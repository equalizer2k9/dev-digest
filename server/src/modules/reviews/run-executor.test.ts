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
type ForRun = () => Promise<{
  documents: { path: string; content: string }[];
  entries: { path: string; tokens: number | null; skip_reason: string | null }[];
}>;

async function runWith(linked: { skill: SkillSeed; order: number }[], forRun?: ForRun) {
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
    projectContext: { forRun: forRun ?? (async () => ({ documents: [], entries: [] })) },
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
  const systemMessage = messages.find((m) => m.role === 'system')!.content;
  const modelCalls = llm.calls.filter((c) => c.method === 'completeStructured').length;

  if (!saved) throw new Error('no trace was persisted');
  return { userMessage, systemMessage, modelCalls, trace: saved, assembly: saved.prompt_assembly, tokenizer };
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

/**
 * A run's terminal status is the signal that its trace can be read: the PR timeline and
 * `waitForPrRuns` poll `agent_runs`, then fetch `/runs/:id/trace`. Writing the status
 * first left a window in which a reader saw `done` and got no trace (the intermittent
 * failure of the intent "sentinel message" integration test).
 */
describe('ReviewRunExecutor — the trace is stored before the terminal status', () => {
  async function writesFor(over: { llm?: () => Promise<unknown>; diffFails?: true }) {
    const writes: string[] = [];
    const container = {
      runBus: new RunBus(),
      llm: over.llm ?? (async () => new MockLLMProvider('openai', { structured: REVIEW })),
      tokenizer: { count: (text: string) => text.length },
      git: { diff: async () => (over.diffFails ? Promise.reject(new Error('clone gone')) : DIFF) },
    } as unknown as Container;
    const repo = {
      // loadDiff falls back to pr_files when git fails; failing both fails the pre-work.
      getPrFiles: async () => (over.diffFails ? Promise.reject(new Error('db gone')) : []),
      insertReview: async () => ({ id: 'review-1' }),
      insertFindings: async () => [],
      markReviewed: async () => undefined,
      completeAgentRun: async (_runId: string, row: { status: string }) => {
        writes.push(`status:${row.status}`);
      },
      saveRunTrace: async () => {
        writes.push('trace');
      },
    } as unknown as ReviewRepository;
    const agents = { linkedSkills: async () => [] } as unknown as Container['agentsRepo'];
    await new ReviewRunExecutor(container, repo, agents).executeRuns('ws-1', PULL, REPO_ROW, [
      { agent: AGENT, runId: 'run-1' },
    ]);
    return writes;
  }

  it('a successful run', async () => {
    expect(await writesFor({})).toEqual(['trace', 'status:done']);
  });

  it('a run whose agent fails', async () => {
    const writes = await writesFor({
      llm: async () => {
        throw new Error('provider down');
      },
    });
    expect(writes).toEqual(['trace', 'status:failed']);
  });

  it('a run failed by the shared pre-work (diff load)', async () => {
    const writes = await writesFor({ diffFails: true });
    expect(writes).toEqual(['trace', 'status:failed']);
  });
});


describe('ReviewRunExecutor — project documents', () => {
  const docs = [
    { path: 'docs/architecture.md', content: '`api/` does not import `db/` directly' },
    { path: 'specs/billing.md', content: 'Billing rules BILLING-TEXT' },
  ];
  const entries = [
    { path: 'docs/architecture.md', tokens: 11, skip_reason: null },
    { path: 'specs/billing.md', tokens: 7, skip_reason: null },
    { path: 'docs/old.md', tokens: null, skip_reason: 'missing' },
  ];
  const withDocs: ForRun = async () => ({ documents: docs, entries });

  it('AC-27: the section holds both texts, each in a block stating its path, with the document rule', async () => {
    const { userMessage, systemMessage } = await runWith([], withDocs);
    expect(userMessage).toContain('## Project context');
    expect(userMessage).toContain('Path: docs/architecture.md\n\n`api/` does not import `db/` directly');
    expect(userMessage).toContain('Path: specs/billing.md\n\nBilling rules BILLING-TEXT');
    expect(systemMessage).toContain('PROJECT DOCUMENTS');
  });

  it('AC-25: the trace records the entries; specs_read stays []', async () => {
    const { trace } = await runWith([], withDocs);
    expect(trace.project_context).toEqual(entries);
    expect(trace.specs_read).toEqual([]);
  });

  it('AC-20/EC-7: no documents -> no section, no rule, messages equal a run without the feature', async () => {
    const none = await runWith([]);
    expect(none.userMessage).not.toContain('## Project context');
    expect(none.systemMessage).not.toContain('PROJECT DOCUMENTS');
    const skipped = await runWith([], async () => ({
      documents: [],
      entries: [{ path: 'docs/old.md', tokens: null, skip_reason: 'missing' }],
    }));
    expect(skipped.userMessage).toBe(none.userMessage);
    expect(skipped.systemMessage).toBe(none.systemMessage);
  });

  it('EC-17/NFR-6: forRun rejecting -> the run completes and one log line names the failure', async () => {
    const { trace, userMessage } = await runWith([], async () => {
      throw new Error('db down');
    });
    expect(userMessage).not.toContain('## Project context');
    expect(trace.project_context ?? []).toEqual([]);
    expect(trace.log.filter((l) => l.msg === 'context: lookup failed (Error)')).toHaveLength(1);
  });

  it('NFR-4: a failed lookup logs the error class or code, never its raw message', async () => {
    const secret = '/home/u/clones/acme/api/.git/config token=ghp_SECRET';
    const named = await runWith([], async () => {
      throw new TypeError(secret);
    });
    const coded = await runWith([], async () => {
      throw Object.assign(new Error(secret), { code: 'ECONNREFUSED' });
    });
    const msgs = (r: typeof named) => r.trace.log.map((l) => l.msg);
    expect(msgs(named)).toContain('context: lookup failed (TypeError)');
    expect(msgs(coded)).toContain('context: lookup failed (ECONNREFUSED)');
    for (const m of [...msgs(named), ...msgs(coded)]) {
      expect(m).not.toContain('ghp_SECRET');
      expect(m).not.toContain('/home/u');
    }
  });

  it('NFR-4: one log line per entry with path and tokens or reason, none with document text', async () => {
    const { trace } = await runWith([], withDocs);
    const lines = trace.log.map((l) => l.msg).filter((m) => m.startsWith('context:'));
    expect(lines).toEqual([
      'context: docs/architecture.md — 11 token(s)',
      'context: specs/billing.md — 7 token(s)',
      'context: docs/old.md — skipped (missing)',
    ]);
    expect(trace.log.some((l) => l.msg.includes('BILLING-TEXT'))).toBe(false);
  });

  it('AC-19: the same number of model calls with and without documents', async () => {
    expect((await runWith([], withDocs)).modelCalls).toBe((await runWith([])).modelCalls);
  });
});
