import { z } from 'zod';
import type { ChatMessage, Intent, IntentConfidence, LLMProvider } from '@devdigest/shared';
import {
  approxTokens,
  INJECTION_GUARD,
  wrapUntrusted,
  type PromptSection,
} from '../prompt.js';

/**
 * Intent classifier — what is this PR for, and what is it NOT for.
 *
 * Pure: assembles one prompt and makes exactly ONE injected-LLM call. The
 * caller (server) resolves the inputs (issues, spec files, the changed-file
 * outline) and persists the result; this module has no DB / GitHub / fs access.
 * Every input part is untrusted data and goes through `wrapUntrusted`.
 */

/** Hard ceiling for the classifier input (system + user), in tokens. */
export const INTENT_INPUT_BUDGET_TOKENS = 6000;
/** Same cap as the reviewer's PR-description section. */
const MAX_DESCRIPTION_CHARS = 4000;
const MAX_SUMMARY_CHARS = 600;
const MAX_LIST_ITEMS = 8;
const MAX_ITEM_CHARS = 200;

export interface IntentIssuePart {
  number: number;
  title: string;
  body?: string | null;
}

export interface IntentFilePart {
  path: string;
  content: string;
}

export interface IntentPromptParts {
  title: string;
  description?: string | null;
  issues?: IntentIssuePart[];
  /** Referenced plan / spec files, already read and size-capped by the caller. */
  files?: IntentFilePart[];
  /** `path (+a/-d)` and raw `@@` hunk-header lines — never a hunk body line. */
  outline: string;
  countTokens?: (text: string) => number;
}

export interface IntentPrompt {
  messages: ChatMessage[];
  sections: PromptSection[];
  /** What was cut to fit the budget: `spec_file:<path>`, `linked_issue:<n>`, `changed_files`, `pr_description`. */
  truncated: string[];
  totalTokens: number;
}

const SYSTEM_INSTRUCTIONS =
  'You classify what a pull request is FOR. From the title, description, linked issues, ' +
  'referenced plan/spec files and the list of changed files, return:\n' +
  '- intent: one short paragraph saying what the PR is meant to achieve;\n' +
  '- in_scope: the things this PR is meant to change;\n' +
  '- out_of_scope: things it is explicitly not meant to change, or that would be drive-by ' +
  'changes if found in the diff;\n' +
  '- confidence: "high" only when the description or a linked issue/spec states the goal ' +
  'clearly, "medium" when you infer it from partial information, "low" when you are guessing.\n' +
  'Never invent goals that are not supported by the provided data. Answer in the language ' +
  'of the PR title.';

function safeCount(count: (t: string) => number, text: string): number {
  try {
    const n = count(text);
    return Number.isFinite(n) ? n : approxTokens(text);
  } catch {
    return approxTokens(text);
  }
}

interface Working {
  description: string | undefined;
  issues: { number: number; title: string; body: string }[];
  files: { path: string; content: string }[];
  outline: string;
}

export function assembleIntentPrompt(parts: IntentPromptParts): IntentPrompt {
  const count = parts.countTokens ?? approxTokens;
  const system = `${SYSTEM_INSTRUCTIONS}\n\n${INJECTION_GUARD}`;
  const title = parts.title.trim();

  const w: Working = {
    description: parts.description?.trim()
      ? parts.description.trim().slice(0, MAX_DESCRIPTION_CHARS)
      : undefined,
    issues: (parts.issues ?? []).map((i) => ({
      number: i.number,
      title: i.title,
      body: i.body ?? '',
    })),
    files: (parts.files ?? []).map((f) => ({ path: f.path, content: f.content })),
    outline: parts.outline,
  };

  const build = () => {
    const user: string[] = [];
    const sections: PromptSection[] = [
      { name: 'system', source: 'intent_instructions', tokens: safeCount(count, system) },
    ];
    const add = (name: string, source: string, text: string) => {
      user.push(text);
      sections.push({ name, source, tokens: safeCount(count, text) });
    };
    add('pr_title', 'pull_request', `## PR title\n${wrapUntrusted('pr-title', title)}`);
    if (w.description) {
      add(
        'pr_description',
        'pull_request',
        `## PR description\n${wrapUntrusted('pr-description', w.description)}`,
      );
    }
    for (const i of w.issues) {
      const text = i.body ? `#${i.number} ${i.title}\n\n${i.body}` : `#${i.number} ${i.title}`;
      add(
        `linked_issue:${i.number}`,
        'github_issue',
        `## Linked issue\n${wrapUntrusted('linked-issue', text)}`,
      );
    }
    for (const f of w.files) {
      // A fully cut file contributes nothing — its content must be absent.
      if (f.content.length === 0) continue;
      add(
        `spec_file:${f.path}`,
        'repo_file',
        `## Referenced file\n${wrapUntrusted('referenced-file', `Path: ${f.path}\n\n${f.content}`)}`,
      );
    }
    if (w.outline.trim().length > 0) {
      add(
        'changed_files',
        'diff_outline',
        `## Changed files\n${wrapUntrusted('changed-files', w.outline)}`,
      );
    }
    // + 1 per user section: the join separators are not part of any section's own count.
    const total = sections.reduce((n, s) => n + s.tokens, 0) + user.length;
    return { user, sections, total };
  };

  const truncated: string[] = [];
  const mark = (key: string) => {
    if (!truncated.includes(key)) truncated.push(key);
  };

  // Shrink one text until the whole input fits, or the text is gone. Each pass
  // removes at least `overage * 4` chars (≈ the overage in tokens), so it ends.
  const shrink = (get: () => string, set: (s: string) => void, key: string): void => {
    for (;;) {
      const { total } = build();
      const over = total - INTENT_INPUT_BUDGET_TOKENS;
      const cur = get();
      if (over <= 0 || cur.length === 0) return;
      set(cur.slice(0, Math.max(0, cur.length - Math.max(over * 4, 1))));
      mark(key);
    }
  };
  const fits = () => build().total <= INTENT_INPUT_BUDGET_TOKENS;

  // 1) spec texts, longest first, down to nothing
  while (!fits()) {
    const f = [...w.files].sort((a, b) => b.content.length - a.content.length)[0];
    if (!f || f.content.length === 0) break;
    shrink(() => f.content, (s) => (f.content = s), `spec_file:${f.path}`);
  }
  // 2) issue bodies, longest first
  while (!fits()) {
    const i = [...w.issues].sort((a, b) => b.body.length - a.body.length)[0];
    if (!i || i.body.length === 0) break;
    shrink(() => i.body, (s) => (i.body = s), `linked_issue:${i.number}`);
  }
  // 3) the changed-file outline
  shrink(() => w.outline, (s) => (w.outline = s), 'changed_files');
  // 4) the description — never the title
  shrink(
    () => w.description ?? '',
    (s) => (w.description = s.length > 0 ? s : undefined),
    'pr_description',
  );

  const { user, sections, total } = build();
  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user.join('\n\n') },
    ],
    sections,
    truncated,
    totalTokens: total,
  };
}

/**
 * The model's answer. No `.max()` anywhere: strict JSON-schema mode rejects
 * length keywords on some providers, so lengths are clamped AFTER the parse.
 */
const IntentModelOutput = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  confidence: z.enum(['low', 'medium', 'high']),
});
type IntentModelOutput = z.infer<typeof IntentModelOutput>;

function clampList(items: string[]): string[] {
  return items
    .map((s) => s.trim().slice(0, MAX_ITEM_CHARS))
    .filter((s) => s.length > 0)
    .slice(0, MAX_LIST_ITEMS);
}

export interface DeriveIntentInput extends IntentPromptParts {
  llm: LLMProvider;
  model: string;
  sessionId?: string;
}

export interface DeriveIntentResult {
  intent: Intent;
  confidence: IntentConfidence;
  sections: PromptSection[];
  truncated: string[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  raw: string;
}

export async function deriveIntent(input: DeriveIntentInput): Promise<DeriveIntentResult> {
  const { llm, model, sessionId, ...parts } = input;
  const prompt = assembleIntentPrompt(parts);

  // Exactly one call; a schema failure is an error, not a second call.
  const res = await llm.completeStructured<IntentModelOutput>({
    model,
    schema: IntentModelOutput,
    schemaName: 'PrIntent',
    messages: prompt.messages,
    maxRetries: 0,
    ...(sessionId ? { sessionId } : {}),
  });

  const hasContext =
    Boolean(parts.description?.trim()) ||
    (parts.issues?.length ?? 0) > 0 ||
    (parts.files ?? []).some((f) => f.content.trim().length > 0);
  // The model cannot be confident about a PR it knows nothing about.
  const confidence: IntentConfidence = hasContext ? res.data.confidence : 'low';

  return {
    intent: {
      intent: res.data.intent.trim().slice(0, MAX_SUMMARY_CHARS),
      in_scope: clampList(res.data.in_scope),
      out_of_scope: clampList(res.data.out_of_scope),
    },
    confidence,
    sections: prompt.sections,
    truncated: prompt.truncated,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
    raw: res.raw,
  };
}
