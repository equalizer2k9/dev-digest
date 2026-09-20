import { describe, it, expect } from 'vitest';
import type { Review, RunTrace, UnifiedDiff } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { AgentRow } from '../../db/rows.js';
import { RunBus } from '../../platform/sse.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { ReviewRunExecutor } from './run-executor.js';
import type { ReviewRepository, PullRow } from './repository.js';

/**
 * Skills Lab — the executor half of criteria 14, 19 and 20.
 *
 * Everything below runs against stubs: the diff comes from a stubbed GitClient,
 * the model is MockLLMProvider (which records the exact messages it was sent),
 * and the "persisted" trace is captured off a saveRunTrace stub. No Docker, no
 * DB, no network — so this stays a unit test under `pnpm exec vitest run
 * --exclude '**\/*.it.test.ts'`.
 */

const RAW_DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  timeoutMs: 5000,
   redisUrl: x,`;

const DIFF: UnifiedDiff = parseUnifiedDiff(RAW_DIFF);

/** A clean review — this suite asserts the PROMPT, not the grounding gate. */
const REVIEW: Review = { verdict: 'comment', summary: 'Looks fine.', score: 100, findings: [] };

type SkillSeed = {
  id: string;
  name: string;
  version: number;
  body: string;
  enabled: boolean;
  source: 'manual' | 'imported_file' | 'imported_url' | 'extracted' | 'community';
};

function skill(over: Partial<SkillSeed> & Pick<SkillSeed, 'id' | 'name'>): SkillSeed {
  return {
    version: 1,
    body: `Body of ${over.name}`,
    enabled: true,
    source: 'manual',
    ...over,
  };
}

const AGENT = {
  id: 'agent-1',
  name: 'Test Quality Reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  systemPrompt: 'You review pull requests.',
  strategy: 'single-pass',
  ciFailOn: 'critical',
  // Off, so no repo-intel call is made and the prompt has only the skills work in it.
  repoIntel: false,
  version: 3,
} as unknown as AgentRow;

const PULL = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 7,
  title: 'Add a timeout',
  body: null,
  base: 'main',
  headSha: 'deadbeef',
} as unknown as PullRow;

const REPO_ROW = { owner: 'acme', name: 'widgets' } as never;

/**
 * Run one agent over a fixed diff with `linked` as its agent_skills rows, and
 * hand back the messages the model saw plus the trace that was persisted.
 */
async function runWith(linked: { skill: SkillSeed; order: number }[]) {
  const llm = new MockLLMProvider('openai', { structured: REVIEW });
  let saved: RunTrace | undefined;

  // A deliberately NON-default counter: one token per character. ceil(len/4)
  // — reviewer-core's fallback — could never produce these numbers, so a
  // matching count proves the injected tokenizer is the one that ran.
  const tokenizer = { count: (text: string) => text.length };

  const container = {
    runBus: new RunBus(),
    llm: async () => llm,
    tokenizer,
    git: { diff: async () => DIFF },
  } as unknown as Container;

  const repo = {
    getPrFiles: async () => [],
    insertReview: async () => ({ id: 'review-1' }),
    insertFindings: async () => [],
    markReviewed: async () => undefined,
    completeAgentRun: async () => undefined,
    saveRunTrace: async (_runId: string, trace: RunTrace) => {
      saved = trace;
    },
  } as unknown as ReviewRepository;

  // linkedSkills is contracted to return rows already ordered by
  // agent_skills.order ascending — mirror that here.
  const agents = {
    linkedSkills: async () =>
      [...linked]
        .sort((a, b) => a.order - b.order)
        .map((l) => ({ skill: l.skill, order: l.order })),
  } as unknown as Container['agentsRepo'];

  const executor = new ReviewRunExecutor(container, repo, agents);
  await executor.executeRuns('ws-1', PULL, REPO_ROW, [{ agent: AGENT, runId: 'run-1' }]);

  const call = llm.calls.find((c) => c.method === 'completeStructured');
  const messages = (call?.req as { messages: { role: string; content: string }[] }).messages;
  const userMessage = messages.find((m) => m.role === 'user')!.content;

  if (!saved) throw new Error('no trace was persisted');
  return { userMessage, trace: saved, assembly: saved.prompt_assembly, tokenizer };
}

describe('ReviewRunExecutor — skills in the prompt', () => {
  it('sends the agent’s enabled linked skills in agent_skills.order (AC-14)', async () => {
    const { userMessage, assembly } = await runWith([
      { skill: skill({ id: 's-a', name: 'alpha' }), order: 0 },
      { skill: skill({ id: 's-b', name: 'beta' }), order: 1 },
    ]);

    expect(userMessage).toContain('## Skills / rules');
    expect(userMessage.indexOf('### alpha (v1)')).toBeLessThan(userMessage.indexOf('### beta (v1)'));
    expect(assembly.skill_blocks?.map((b) => b.name)).toEqual(['alpha', 'beta']);
  });

  it('reordering the links reorders the prompt blocks — order is not cosmetic (AC-14)', async () => {
    // Same two skills, orders swapped: beta is now order 0.
    const { userMessage, assembly } = await runWith([
      { skill: skill({ id: 's-a', name: 'alpha' }), order: 1 },
      { skill: skill({ id: 's-b', name: 'beta' }), order: 0 },
    ]);

    expect(userMessage.indexOf('### beta (v1)')).toBeLessThan(userMessage.indexOf('### alpha (v1)'));
    expect(assembly.skill_blocks?.map((b) => b.name)).toEqual(['beta', 'alpha']);
  });

  it('drops a globally disabled skill even while it is linked (AC-20)', async () => {
    const { userMessage, assembly } = await runWith([
      { skill: skill({ id: 's-a', name: 'alpha' }), order: 0 },
      { skill: skill({ id: 's-off', name: 'switched-off', enabled: false }), order: 1 },
    ]);

    expect(userMessage).not.toContain('switched-off');
    expect(assembly.skills).not.toContain('switched-off');
    expect(assembly.skill_blocks?.map((b) => b.name)).toEqual(['alpha']);
  });

  it('never sees a skill that is not linked to the agent (AC-20)', async () => {
    // "Unlinked" = simply absent from linkedSkills; there is no other channel.
    const { userMessage, assembly } = await runWith([
      { skill: skill({ id: 's-a', name: 'alpha' }), order: 0 },
    ]);

    expect(userMessage).not.toContain('somebody-elses-skill');
    expect(assembly.skill_blocks).toHaveLength(1);
  });

  it('with no enabled skills, skills / skill_blocks / skills_tokens are all null (AC-20)', async () => {
    const { userMessage, assembly } = await runWith([
      { skill: skill({ id: 's-off', name: 'switched-off', enabled: false }), order: 0 },
    ]);

    expect(userMessage).not.toContain('## Skills / rules');
    expect(assembly.skills).toBeNull();
    expect(assembly.skill_blocks).toBeNull();
    expect(assembly.skills_tokens).toBeNull();
  });

  it('measures each skill and the block with the INJECTED tokenizer, not the whole prompt (AC-19)', async () => {
    const { assembly, userMessage } = await runWith([
      { skill: skill({ id: 's-a', name: 'alpha' }), order: 0 },
      { skill: skill({ id: 's-b', name: 'beta' }), order: 1 },
    ]);

    const blocks = assembly.skill_blocks!;
    expect(blocks).toHaveLength(2);

    // The stub counts characters, so each block's number must equal the length
    // of exactly that skill's rendered sub-block.
    expect(blocks[0]!.tokens).toBe('### alpha (v1)\nBody of alpha'.length);
    expect(blocks[1]!.tokens).toBe('### beta (v1)\nBody of beta'.length);

    // The block total is the joined section body — and is far smaller than the
    // whole prompt, i.e. it is NOT derived from the full assembly.
    expect(assembly.skills_tokens).toBe(assembly.skills!.length);
    expect(assembly.skills_tokens!).toBeLessThan(userMessage.length);

    expect(blocks.map((b) => b.skill_id)).toEqual(['s-a', 's-b']);
    expect(blocks.map((b) => b.version)).toEqual([1, 1]);
  });

  it('wraps an imported (untrusted) body and leaves a manual one verbatim', async () => {
    const { userMessage } = await runWith([
      { skill: skill({ id: 's-m', name: 'hand-written', source: 'manual' }), order: 0 },
      { skill: skill({ id: 's-i', name: 'uploaded', source: 'imported_file' }), order: 1 },
    ]);

    expect(userMessage).toContain('### hand-written (v1)\nBody of hand-written');
    expect(userMessage).toContain('<untrusted source="skill:uploaded">');
    expect(userMessage).not.toContain('<untrusted source="skill:hand-written">');
  });

  it('logs one Live Log line per assembled skill, matching the trace (AC-19/AC-20)', async () => {
    const { trace, assembly } = await runWith([
      { skill: skill({ id: 's-a', name: 'alpha' }), order: 0 },
      { skill: skill({ id: 's-b', name: 'beta' }), order: 1 },
    ]);

    const skillLines = trace.log.filter((l) => l.msg.startsWith('skill: '));
    expect(skillLines).toHaveLength(2);
    expect(skillLines[0]!.msg).toBe(`skill: alpha v1 — ${assembly.skill_blocks![0]!.tokens} token(s)`);
    expect(skillLines[1]!.msg).toBe(`skill: beta v1 — ${assembly.skill_blocks![1]!.tokens} token(s)`);
  });
});
