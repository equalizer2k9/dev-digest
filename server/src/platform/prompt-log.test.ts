import { describe, it, expect } from 'vitest';
import { logLlmCall, logPromptAssembly, type PromptLogger } from './prompt-log.js';
import { loadConfig } from './config.js';

function capture() {
  const info: { obj: Record<string, unknown>; msg?: string }[] = [];
  const debug: { obj: Record<string, unknown>; msg?: string }[] = [];
  const logger: PromptLogger = {
    info: (obj, msg) => info.push({ obj: obj as Record<string, unknown>, msg }),
    debug: (obj, msg) => debug.push({ obj: obj as Record<string, unknown>, msg }),
  };
  return { logger, info, debug };
}

const ids = {
  call: 'review' as const,
  correlationId: 'c-1',
  prId: 'pr-1',
  provider: 'openai',
  model: 'gpt-4.1',
};

describe('prompt-log (S-AC-16)', () => {
  it('S-AC-16: one prompt_assembly line with ids, sections [{name, source, tokens}] and totalTokens', () => {
    const { logger, info } = capture();
    logPromptAssembly(logger, {
      ...ids,
      sections: [
        { name: 'diff', source: 'git', tokens: 120 },
        { name: 'pr-intent', source: 'pr_intent', tokens: 30 },
      ],
      totalTokens: 150,
    });
    expect(info).toHaveLength(1);
    expect(info[0]!.obj).toEqual({
      event: 'prompt_assembly',
      ...ids,
      sections: [
        { name: 'diff', source: 'git', tokens: 120 },
        { name: 'pr-intent', source: 'pr_intent', tokens: 30 },
      ],
      totalTokens: 150,
    });
  });

  it('S-AC-16: a stray text field on a section never reaches the log', () => {
    const { logger, info, debug } = capture();
    logPromptAssembly(logger, {
      ...ids,
      sections: [{ name: 'diff', source: 'git', tokens: 1, text: 'SECRET DIFF TEXT' } as never],
      totalTokens: 1,
      previews: [{ name: 'diff', text: 'SECRET DIFF TEXT' }],
    });
    expect(JSON.stringify(info)).not.toContain('SECRET DIFF TEXT');
    expect(debug).toEqual([]); // verbose not set
  });

  it('S-AC-18: llm_call line carries ids plus tokens, cost and duration', () => {
    const { logger, info } = capture();
    logLlmCall(logger, { ...ids, call: 'intent_classifier', tokensIn: 100, tokensOut: 50, costUsd: 0.002, durationMs: 12 });
    expect(info[0]!.obj).toEqual({
      event: 'llm_call',
      ...ids,
      call: 'intent_classifier',
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.002,
      durationMs: 12,
    });
  });

  it('no logger → no throw', () => {
    expect(() => logPromptAssembly(undefined, { ...ids, sections: [], totalTokens: 0 })).not.toThrow();
    expect(() => logLlmCall(undefined, { ...ids, tokensIn: 0, tokensOut: 0, costUsd: null, durationMs: 0 })).not.toThrow();
  });
});

describe('verbose previews (S-AC-17)', () => {
  const entry = {
    ...ids,
    sections: [{ name: 'diff', source: 'git', tokens: 1 }],
    totalTokens: 1,
    previews: [{ name: 'diff', text: 'preview text' }],
  };

  it('S-AC-17: previews are logged at debug only when verbose is true', () => {
    const on = capture();
    logPromptAssembly(on.logger, { ...entry, verbose: true });
    expect(on.debug).toHaveLength(1);
    expect(JSON.stringify(on.debug[0]!.obj)).toContain('preview text');

    const off = capture();
    logPromptAssembly(off.logger, { ...entry, verbose: false });
    logPromptAssembly(off.logger, entry);
    expect(off.debug).toEqual([]);
    expect(JSON.stringify(off.info)).not.toContain('preview text');
  });

  const cfg = (env: Record<string, string>) =>
    loadConfig({ ...process.env, ...env } as NodeJS.ProcessEnv);

  it('S-AC-17: promptLogVerbose is true only with PROMPT_LOG_VERBOSE=true AND NODE_ENV=development', () => {
    expect(cfg({ NODE_ENV: 'development', PROMPT_LOG_VERBOSE: 'true' }).promptLogVerbose).toBe(true);
    expect(cfg({ NODE_ENV: 'test', PROMPT_LOG_VERBOSE: 'true' }).promptLogVerbose).toBe(false);
    expect(cfg({ NODE_ENV: 'production', PROMPT_LOG_VERBOSE: 'true' }).promptLogVerbose).toBe(false);
    expect(cfg({ NODE_ENV: 'development', PROMPT_LOG_VERBOSE: 'false' }).promptLogVerbose).toBe(false);
    expect(cfg({ NODE_ENV: 'development' }).promptLogVerbose).toBe(false);
  });
});
