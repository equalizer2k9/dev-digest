# reviewer-core/ — @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → grounded findings. Consumed ONLY as TypeScript
source by server (alias `@devdigest/reviewer-core` → `../reviewer-core/src/index.ts`).

## Stack

TS 5.7 (ESM) · Zod 3 · `openai` 4 SDK (OpenRouter-compatible) · Vitest 2 · **npm, not pnpm**

## Commands

- `npm test` — hermetic, stubbed `LLMProvider`; no keys, no network
- `npm run typecheck` (= `npm run build`; package never emits JS)
- After changing exports: `cd ../server && pnpm typecheck`

## Where things live

- `src/index.ts` — public barrel; server imports only from here → export new API here
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — `groundFindings` citation gate
- `src/llm/` — `openrouter.ts` provider · `structured.ts` (Zod → JSON Schema, parse-with-repair)
- `src/review/` — `run.ts` orchestration · `reduce.ts` (score, map-reduce)
- `src/output/to-review.ts` — CI payload helper
- Contracts (`Review`, `Finding`, `Verdict`) come from `../server/src/vendor/shared`

## Invariants — do not break

- No DB, GitHub, filesystem or process side effects; the only side effect is the injected `LLMProvider`
- Every finding must cite a real diff line or `groundFindings` drops it
- `score` is recomputed from surviving findings (`reduce.ts`); the model's score is ignored
- Untrusted content (diff, PR body, repo map) always goes through `wrapUntrusted`;
  injection defense = `INJECTION_GUARD`, never keyword-scanning the text
- Output shape is enforced by JSON-schema `response_format`, not prompt text — never describe JSON in prompts

## Gotchas

- Server needs `reviewer-core/node_modules` (`npm ci`) or the API crashes with `ERR_MODULE_NOT_FOUND`
- Prompt slots `skills` / `memory` / `specs` / `callers` are empty in the starter; empty slot = section omitted
- `verdict` comes from the model (worst across chunks) and is NOT re-derived after grounding —
  it can say `request_changes` while every finding was dropped

## Docs — read on trigger

- Pipeline diagram + public API → [README.md](README.md)
- Prompt message order, severity / verdict conventions → [../docs/agent-prompts/README.md](../docs/agent-prompts/README.md)
- Deep dives → [docs/](docs/README.md) · implementing a feature → its spec in [specs/](specs/README.md) first
- Before a non-trivial change → [INSIGHTS.md](INSIGHTS.md); new insight → `engineering-insights` skill
- Test strategy → [../TESTING.md](../TESTING.md)
