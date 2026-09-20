import { describe, it, expect } from 'vitest';
import type {
  ChatMessage,
  LLMProvider,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest, type SkillPart } from '../src/index.js';

/**
 * Engine-level test for reviewPullRequest (the core lifted out of the server's
 * runOneAgent). Uses the server's mock LLM + git so we exercise the real
 * assemble → completeStructured → reduce → grounding pipeline with no DB/SSE.
 */
describe('reviewPullRequest (engine)', () => {
  // One grounded finding (line 11 is in the MockGitClient diff) + one
  // hallucinated finding (line 999) the grounding gate must drop.
  const fixture = {
    verdict: 'request_changes',
    summary: 'secret key committed',
    score: 38,
    findings: [
      {
        id: 'f1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'sk_live in diff',
        confidence: 0.98,
        kind: 'finding',
      },
      {
        id: 'f-hallucinated',
        severity: 'WARNING',
        category: 'bug',
        title: 'phantom finding on a line not in the diff',
        file: 'src/config.ts',
        start_line: 999,
        end_line: 999,
        rationale: 'not real',
        confidence: 0.3,
        kind: 'finding',
      },
    ],
  };

  it('single-pass: assembles, grounds, drops the hallucinated finding', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();

    const events: string[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      task: 'Review PR #482',
      onEvent: (e) => events.push(e.msg),
    });

    expect(outcome.mode).toBe('single-pass');
    expect(outcome.grounding).toBe('1/2 passed');
    expect(outcome.review.findings).toHaveLength(1);
    expect(outcome.review.findings[0]!.start_line).toBe(11);
    expect(outcome.dropped).toHaveLength(1);
    // Score is derived from the SURVIVING findings, not the model's self-reported
    // 38: one CRITICAL remains after grounding ⇒ 100 − 35 = 65.
    expect(outcome.review.score).toBe(65);
    // progress is surfaced (server bridges this onto SSE; runner logs it)
    expect(events.some((m) => m.includes('Citation grounding'))).toBe(true);
  });

  it('score is deterministic from findings: a clean approve scores 100', async () => {
    // Model "approves" but reports a nonsense low score (the cheap-model bug).
    // The engine must ignore that and score the zero findings as a perfect 100.
    const clean = { verdict: 'approve', summary: 'looks good', score: 10, findings: [] };
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'deepseek/deepseek-v4-flash',
      diff,
      llm,
      task: 'Review PR #5',
    });

    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.review.score).toBe(100);
  });

  it('checkCancelled throwing aborts before the LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();
    await expect(
      reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff,
        llm,
        checkCancelled: () => {
          throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
  });

  it('forwards sessionId to every LLM call (OpenRouter session grouping)', async () => {
    const seen: (string | undefined)[] = [];
    const recorder: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req): Promise<StructuredResult<T>> {
        seen.push(req.sessionId);
        return {
          data: fixture as unknown as T,
          model: req.model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          raw: '',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    const diff = await new MockGitClient().diff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: recorder, sessionId: 'sess-abc' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'sess-abc')).toBe(true);
  });
});

/**
 * Skills Lab — the engine forwards `skills` + `countTokens` into assemblePrompt
 * unchanged, on BOTH strategies, and the returned assembly carries the per-skill
 * trace record (AC-14 order, AC-19 token attribution).
 */
describe('reviewPullRequest — skills + countTokens forwarding', () => {
  const clean = { verdict: 'approve', summary: 'looks good', score: 90, findings: [] };

  const skills: SkillPart[] = [
    { id: 's-house', name: 'house-style', version: 3, body: 'Prefer early returns.', trusted: true },
    { id: 's-comm', name: 'community-sec', version: 1, body: 'Flag eval().', trusted: false },
  ];

  /** LLM stub that records the messages of every chunk call. */
  function recordingLlm(): { llm: LLMProvider; seen: ChatMessage[][] } {
    const seen: ChatMessage[][] = [];
    const llm: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        seen.push(req.messages);
        return {
          data: clean as unknown as T,
          model: req.model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          raw: '',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    return { llm, seen };
  }

  /** Distinctive counter: a default (ceil(len/4)) could never produce these. */
  const countTokens = (text: string) => text.length * 10;

  const TWO_FILE_DIFF =
    'diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n' +
    '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,\n' +
    'diff --git a/src/server.ts b/src/server.ts\n--- a/src/server.ts\n+++ b/src/server.ts\n' +
    '@@ -1,2 +1,3 @@\n const a = 1;\n+const b = 2;\n const c = 3;';

  it('single-pass: renders both skills in the prompt and traces them in order', async () => {
    const { llm, seen } = recordingLlm();
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      skills,
      countTokens,
    });

    expect(outcome.mode).toBe('single-pass');
    expect(seen).toHaveLength(1);
    const user = seen[0]![1]!.content;
    expect(user).toContain('## Skills / rules');
    expect(user).toContain('### house-style (v3)\nPrefer early returns.');
    expect(user).toContain('### community-sec (v1)\n<untrusted source="skill:community-sec">');

    expect(outcome.assembly.skill_blocks!.map((b) => b.skill_id)).toEqual(['s-house', 's-comm']);
    expect(outcome.assembly.skill_blocks!.map((b) => b.version)).toEqual([3, 1]);
    // the INJECTED counter was used, not the ceil(len/4) default
    expect(outcome.assembly.skills_tokens).toBe(outcome.assembly.skills!.length * 10);
    expect(outcome.assembly.skill_blocks!.every((b) => b.tokens % 10 === 0)).toBe(true);
  });

  it('map-reduce: every chunk gets the identical skills section, assembly keeps skill_blocks', async () => {
    const { llm, seen } = recordingLlm();
    const diff = await new MockGitClient({ diff: TWO_FILE_DIFF }).diff();
    expect(diff.files).toHaveLength(2);

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      strategy: 'map-reduce',
      skills,
      countTokens,
    });

    expect(outcome.mode).toBe('map-reduce');
    expect(seen).toHaveLength(2);
    const sections = seen.map((msgs) => {
      const user = msgs[1]!.content;
      const start = user.indexOf('## Skills / rules');
      return user.slice(start, user.indexOf('\n\n##', start));
    });
    expect(sections[0]).toContain('### house-style (v3)');
    expect(sections[1]).toBe(sections[0]);

    expect(outcome.assembly.skill_blocks!.map((b) => b.name)).toEqual([
      'house-style',
      'community-sec',
    ]);
    expect(outcome.assembly.skills_tokens).toBe(outcome.assembly.skills!.length * 10);
  });

  it('no skills: the section and all three trace fields are absent', async () => {
    const { llm, seen } = recordingLlm();
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
    });

    expect(seen[0]![1]!.content).not.toContain('## Skills / rules');
    expect(outcome.assembly.skills ?? null).toBeNull();
    expect(outcome.assembly.skill_blocks ?? null).toBeNull();
    expect(outcome.assembly.skills_tokens ?? null).toBeNull();
  });
});
