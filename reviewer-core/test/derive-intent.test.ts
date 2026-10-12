/**
 * Intent classifier — acceptance criteria S-AC-5, 6, 7, 25 of
 * server/specs/intent-layer.md (reviewer-core half).
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { StructuredRequest } from '@devdigest/shared';
import { MockLLMProvider } from '../../server/src/adapters/mocks.js';
import {
  assembleIntentPrompt,
  deriveIntent,
  approxTokens,
  INTENT_INPUT_BUDGET_TOKENS,
} from '../src/index.js';

const OUTLINE = 'src/a.ts (+3/-1)\n@@ -1,3 +1,5 @@ function foo()\nsrc/b.ts (+1/-0)\n@@ -10,2 +10,3 @@';
const ANSWER = {
  intent: 'Add rate limiting',
  in_scope: ['rate limiter'],
  out_of_scope: ['auth'],
  confidence: 'high',
};

function mk(answer: Record<string, unknown> = ANSWER) {
  return new MockLLMProvider('openai', { structured: answer });
}

describe('S-AC-5: classifier makes exactly one call', () => {
  it('S-AC-5: one completeStructured call with maxRetries 0 and the given model', async () => {
    const llm = mk();
    await deriveIntent({
      llm,
      model: 'deepseek/deepseek-v4-flash',
      title: 'Add rate limiting',
      description: 'Adds a limiter',
      outline: OUTLINE,
    });
    const calls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(calls).toHaveLength(1);
    expect(llm.calls).toHaveLength(1);
    const req = calls[0]!.req as StructuredRequest<unknown>;
    expect(req.maxRetries).toBe(0);
    expect(req.model).toBe('deepseek/deepseek-v4-flash');
  });

  it('S-AC-5: a schema failure is an error, not a second call', async () => {
    const llm = mk({ nonsense: true });
    await expect(
      deriveIntent({ llm, model: 'm', title: 't', description: 'd', outline: OUTLINE }),
    ).rejects.toThrow();
    expect(llm.calls).toHaveLength(1);
  });
});

describe('S-AC-6: classifier input', () => {
  const hunkBody = '+const secretHunkBodyLine = 1;';
  const prompt = assembleIntentPrompt({
    title: 'My title',
    description: 'My description',
    issues: [{ number: 7, title: 'Issue seven', body: 'issue body text' }],
    files: [{ path: 'docs/plan.md', content: 'PLAN CONTENT' }],
    outline: OUTLINE,
  });
  const all = prompt.messages.map((m) => m.content).join('\n');
  const user = prompt.messages.find((m) => m.role === 'user')!.content;

  it('S-AC-6: contains title, description, issues, files and @@ headers', () => {
    for (const s of ['My title', 'My description', 'Issue seven', 'issue body text', 'PLAN CONTENT', 'docs/plan.md', '@@ -1,3 +1,5 @@', 'src/a.ts']) {
      expect(all).toContain(s);
    }
  });

  it('S-AC-6: no hunk body line appears', () => {
    expect(all).not.toContain(hunkBody);
    // every line of the changed-files block is a path line or an @@ header
    const block = /<untrusted source="changed-files">\n([\s\S]*?)\n<\/untrusted>/.exec(user)![1]!;
    for (const line of block.split('\n')) {
      expect(/^@@ /.test(line) || /^\S+ \(\+\d+\/-\d+\)$/.test(line)).toBe(true);
    }
  });

  it('S-AC-6: every untrusted part is inside wrapUntrusted', () => {
    for (const s of ['My title', 'My description', 'Issue seven', 'issue body text', 'PLAN CONTENT', '@@ -1,3 +1,5 @@']) {
      const idx = user.indexOf(s);
      expect(idx).toBeGreaterThan(-1);
      const before = user.slice(0, idx);
      expect(before.lastIndexOf('<untrusted')).toBeGreaterThan(before.lastIndexOf('</untrusted>'));
    }
  });

  it('S-AC-6: description is capped at 4000 chars', () => {
    const p = assembleIntentPrompt({ title: 't', description: 'x'.repeat(9000), outline: '' });
    const run = /x+/.exec(p.messages[1]!.content)![0];
    expect(run.length).toBe(4000);
  });
});

describe('S-AC-7: no description, no issue, no file', () => {
  for (const [label, description] of [['null', null], ['empty', ''], ['undefined', undefined]] as const) {
    it(`S-AC-7: confidence is low whatever the model says (${label} body)`, async () => {
      const r = await deriveIntent({
        llm: mk(), // model claims "high"
        model: 'm',
        title: 'Some change',
        description,
        outline: OUTLINE,
      });
      expect(r.confidence).toBe('low');
    });
  }

  it('S-AC-7: confidence is NOT capped when a description exists', async () => {
    const r = await deriveIntent({ llm: mk(), model: 'm', title: 't', description: 'real body', outline: OUTLINE });
    expect(r.confidence).toBe('high');
  });

  it('S-AC-7: a resolved issue or file lifts the cap', async () => {
    const a = await deriveIntent({
      llm: mk(), model: 'm', title: 't', description: null, outline: OUTLINE,
      issues: [{ number: 1, title: 'i', body: 'b' }],
    });
    expect(a.confidence).toBe('high');
    const b = await deriveIntent({
      llm: mk(), model: 'm', title: 't', description: null, outline: OUTLINE,
      files: [{ path: 'a.md', content: 'spec' }],
    });
    expect(b.confidence).toBe('high');
  });
});

describe('S-AC-25: input budget', () => {
  it('S-AC-25: budget constant is 6000', () => {
    expect(INTENT_INPUT_BUDGET_TOKENS).toBe(6000);
  });

  it('S-AC-25: spec texts are cut first, input fits, cut is reported', () => {
    const p = assembleIntentPrompt({
      title: 'T',
      description: 'desc stays',
      issues: [{ number: 3, title: 'iss', body: 'issue body stays' }],
      files: [{ path: 'docs/big.md', content: 'S'.repeat(200_000) }],
      outline: OUTLINE,
    });
    const text = p.messages.map((m) => m.content).join('\n');
    expect(approxTokens(text)).toBeLessThanOrEqual(6000);
    expect(p.totalTokens).toBeLessThanOrEqual(6000);
    expect(p.truncated).toContain('spec_file:docs/big.md');
    // nothing but the spec was cut
    expect(p.truncated).toEqual(['spec_file:docs/big.md']);
    expect(text).toContain('desc stays');
    expect(text).toContain('issue body stays');
    expect(text).toContain('@@ -1,3 +1,5 @@');
  });

  it('S-AC-25: under budget nothing is cut', () => {
    const p = assembleIntentPrompt({ title: 'T', description: 'd', outline: OUTLINE, files: [{ path: 'a.md', content: 'small' }] });
    expect(p.truncated).toEqual([]);
  });

  it('S-AC-25: still within budget when everything is huge', () => {
    const p = assembleIntentPrompt({
      title: 'T',
      description: 'd'.repeat(4000),
      issues: [{ number: 1, title: 'i', body: 'b'.repeat(100_000) }],
      files: [{ path: 'a.md', content: 'c'.repeat(100_000) }],
      outline: 'o'.repeat(100_000),
    });
    expect(p.totalTokens).toBeLessThanOrEqual(6000);
    const idxSpec = p.truncated.indexOf('spec_file:a.md');
    const idxIssue = p.truncated.indexOf('linked_issue:1');
    expect(idxSpec).toBeGreaterThanOrEqual(0);
    expect(idxIssue).toBeGreaterThan(idxSpec);
  });
});

// keep zod referenced for schema parity checks
void z;
