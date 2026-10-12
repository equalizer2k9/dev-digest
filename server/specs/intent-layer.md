# Intent Layer — server

**Status:** approved · **Package:** server (+ reviewer-core) · **Date:** 2026-10-12

Sibling: [`client/specs/intent-layer.md`](../../client/specs/intent-layer.md) ·
builds on [`review-flow.md`](review-flow.md)

## Problem

A reviewer agent sees the diff and the PR description, but nothing tells it what the PR is
*for*. It comments on drive-by changes with the same weight as on the feature, and nobody can see
what the system believes the PR's scope is.

The scaffolding exists and is unused: the `pr_intent` table
([`db/schema/reviews.ts`](../src/db/schema/reviews.ts)), `getIntent` / `upsertIntent` in
[`repository/pull.repo.ts`](../src/modules/reviews/repository/pull.repo.ts), the `Intent`
contract, and a `review_intent` entry in `FEATURE_MODELS`. Nothing derives an intent, no route
serves one, and the reviewer prompt has no slot for it. Comments in `run-executor.ts` and
`run-logger.ts` already describe a "derive intent" step that the code does not have.

## Goals / non-goals

**Goals**

- Derive a PR's intent with exactly one call to a cheap model taken from the `review_intent`
  setting; nothing about the model is hardcoded in the module.
- Store it in `pr_intent` with confidence, sources and what the call cost.
- `GET /pulls/:id/intent` reads it without a model call;
  `POST /pulls/:id/intent/recalculate` re-derives it with exactly one call.
- A review derives the intent once if none is stored, and the logs show the classifier call and
  the review call as two separate calls.
- The reviewer receives the intent as a separate, untrusted section. Scope narrows what it
  comments on; it can never mute a CRITICAL.
- Every prompt assembly is logged per section — name, source, token size — with model and a
  correlation id, and without secrets, diff or spec text.
- While the prompt assembly is open anyway: `wrapUntrusted` neutralises forged `<untrusted` /
  `</untrusted` tags inside data, the PR title enters the review prompt as untrusted data, and
  pino redacts keys and tokens.

**Non-goals**

- Fetching any URL found in PR text; cross-repo issues or files.
- A structured `out_of_scope` marker on findings (new `Finding` field, DB column, UI grouping).
- Automatic re-derive when the head moves or the description is edited.
- An `agent_runs` row or a `run_traces` assembly for the classifier call.
- Changing `Intent`, `PrBrief`, `resolveLinkedIssue` / `PrDetail.linked_issue`, or Smart Diff.
- Making the `feat/homework-5` brief read the intent — done when the branches are merged.

## Behaviour

### 1. Where the code lives

`src/modules/reviews/intent/` — `ReviewRepository` already owns `pr_intent`, the run executor
needs the service, and `smart-diff/` is the precedent for a subfolder of this module.

| File | Role |
|---|---|
| `intent-service.ts` | `get`, `recalculate`, `ensureForReview`; in-flight guard; provider-error mapping |
| `collect-sources.ts` | I/O through `container.github()` / `container.git`: resolves issues and files |
| `parse-references.ts` | pure: description → `{ issues: number[], files: string[] }` |
| `file-outline.ts` | pure: `UnifiedDiff` → file list + `@@` hunk headers, capped |
| `constants.ts` | caps: files, hunks, characters, issues, allowed extensions |

The classifier itself — prompt assembly and the one model call — is pure and lives in
`reviewer-core/src/intent/derive-intent.ts`. reviewer-core gains no DB, GitHub or fs import.

### 2. Classifier input — no change bodies

| Part | Source | Limit |
|---|---|---|
| PR title | `pull_requests.title` | — |
| PR description | `pull_requests.body` | 4000 chars |
| Linked issues | `GitHubClient.getIssue` for the PR's own repo | 3 issues |
| Referenced plan / spec files | the PR's own repo: head commit first, then the local clone (§3) | 3 files, `.md` only, size cap |
| Changed files | `path (+a/−d)` and the raw `@@ … @@` header lines of each hunk | caps on files, hunks, 160 chars per header |

No line of a hunk body (`+`, `-` or context) enters the prompt. Every part, including file paths
and issue titles, is wrapped with `wrapUntrusted`; the system message is trusted text plus the
existing `INJECTION_GUARD`.

**Input budget:** the assembled classifier input is at most 6 000 tokens (counted with the
injected tokenizer). When it is over, spec texts are cut first (longest first, down to
nothing), then issue bodies, then the file outline, then the description; the title is never
cut. Every cut is recorded on the matching `sources` entry as `reason: 'truncated'`.

### 3. Resolving references — no SSRF

- **Issues** come only from a closing keyword (`closes|fixes|resolves #N`) or from a
  `https://github.com/<owner>/<name>/issues/N` URL whose owner and name equal the PR's repo. A
  bare `#N` is not a linked issue. A number that turns out to be a pull request is recorded as
  `skipped` and not used.
- **Files** come from relative Markdown links, backticked paths and same-repo
  `/blob/<ref>/<path>` URLs, which are reduced to a path. Only `.md`, with a size cap. A path
  is normalised and rejected before any read if it is absolute or has a `..` segment.
- **Where a file is read from**, in this order, all inside the PR's own repo: (1) the PR head
  commit — `git show <head_sha>:<path>` in the clone through a new `GitClient.readFileAtRef`,
  or, when the clone does not have that commit, the GitHub contents API for the same repo at
  `head_sha` through a new `GitHubClient.getFileContent`; (2) the clone's working tree. A file
  is `missing` only when none of them has it. A spec added by the PR itself is therefore found.
- No HTTP request is ever made to a URL taken from PR text.
- `SimpleGitClient.readFile` today joins the path without confinement
  (`adapters/git/simple-git.ts:129-131`). It gets a `confinePath(root, rel)` guard —
  resolve + realpath prefix check — so absolute paths, `..` segments and symlinks leaving the
  clone are rejected for every caller.
- A `#N` whose `getIssue` answer is a pull request is skipped, not used as an issue.
- Anything that cannot be resolved is never invented: it becomes a `sources` entry with
  `status: 'missing'` and a reason, and the call still happens without it.

### 4. Output and confidence

The model returns `{ intent, in_scope, out_of_scope, confidence }`. `sources` are computed by
the server from what was actually resolved — never produced by the model. After the parse the
server clamps lengths (summary ≤ 600 chars, ≤ 8 items × 200 chars) and applies one deterministic
rule: with no description and no resolved issue or file, confidence is never above `low`,
whatever the model said. Confidence is the enum `low | medium | high`.

A `null` body (`pull_requests.body` stays null until `GET /pulls/:id` has synced it) is treated
as no description; the source is recorded as `missing` / `not_synced`.

### 5. Routes

Both in [`modules/reviews/routes.ts`](../src/modules/reviews/routes.ts), with response schemas.

| Method | Path | Returns | Model calls |
|---|---|---|---|
| GET | `/pulls/:id/intent` | 200 `{ intent: PrIntentDetail \| null }` | 0 |
| POST | `/pulls/:id/intent/recalculate` | 200 `{ intent: PrIntentDetail }` | exactly 1 |

`recalculate` is synchronous, rate-limited (10/min), and calls `completeStructured` with
`maxRetries: 0`, so a schema failure is an error rather than a second call. SDK-level network
retries on 429 / 5xx remain. A failed call leaves the stored row untouched.

Provider errors on `recalculate`: 402 → HTTP 402 `llm_payment_required`; 404 → HTTP 502
`llm_model_not_found`; missing key → the existing `ConfigError`; anything else → 502. It never
answers 404 for a provider problem — 404 means "PR not found".

### 6. Before a review

After the shared diff load in `executeRuns`, `ensureForReview` runs once for all queued agents:

- stored intent → reused, no model call, one Live Log line saying so. When the head moved since
  it was derived it is still reused, flagged `stale`; re-deriving is a manual Recalculate;
- no stored intent → one classifier call, shown as its own `Deriving PR intent (<provider>/<model>)`
  step;
- two concurrent triggers for the same PR share one in-flight call;
- a classifier failure (missing key, 402 / 404, schema failure) is logged and the review runs
  without an intent section. It never fails a review.

The classifier's tokens and cost go on the `pr_intent` row and into its log line. `agent_runs`
totals stay "review call(s) only", so the run cost badge keeps its meaning.

### 7. Reviewer prompt

`assemblePrompt` gains an optional `intent` part:

- user message: a `## PR intent and scope` section right after `## PR description`, its content
  inside `wrapUntrusted('pr-intent', …)`;
- system message: a trusted `SCOPE_RULE` after the injection guard — comment only on what is in
  scope; a CRITICAL outside scope is still reported, with its title starting with the literal
  marker `Out of scope: `, so the reader sees one clear signal in the findings list; nothing
  below CRITICAL is reported outside scope; scope never waives a CRITICAL.

The marker is a title prefix written by the model — no contract or DB change. Without an intent
there is no intent section and no `SCOPE_RULE`. No code path drops, downgrades or merges a
finding because of intent, scope or the marker — the rule is prompt-level only.

**Hardening of the same assembly**

- `wrapUntrusted` neutralises every forged opening or closing tag inside the data — any
  `<untrusted` and `</untrusted`, case-insensitive and with inner whitespace — not only the
  exact string `</untrusted>`. The label is sanitised too.
- The PR title leaves the trusted task line (`modules/reviews/helpers.ts:92`): the task line
  names the PR by number and author only, and the title is passed as its own part, rendered as
  `wrapUntrusted('pr-title', …)`.

### 8. Prompt-assembly logging

`platform/prompt-log.ts` emits, for each model call (classifier and every review chunk):

- `event: 'prompt_assembly'` — `call` (`intent_classifier` | `review`), `correlationId`, `prId`,
  `provider`, `model`, `sections: [{ name, source, tokens }]`, `totalTokens`;
- `event: 'llm_call'` — the same ids plus `tokensIn`, `tokensOut`, `costUsd`, `durationMs`.

One `correlationId` (a UUID created per review trigger or per recalculate request) ties the
classifier call to the review calls. The helper accepts only names, sources and numbers, so
prompt text, diff, issue or spec text and keys cannot reach the log. Section text previews are
logged at `debug` only when `PROMPT_LOG_VERBOSE=true` **and** `NODE_ENV=development`; elsewhere
the flag is inert.

The Fastify pino logger gets a `redact` list — `authorization` and `cookie` headers, and any
`apiKey`, `api_key`, `token`, `accessToken`, `secret`, `password` field at the top level or one
level down — censored as `[redacted]`.

## Contracts & data

- **New** `contracts/intent.ts` in both `@devdigest/shared` copies:
  `IntentConfidence = 'low' | 'medium' | 'high'`;
  `IntentSource = { kind: 'pr_title' | 'pr_description' | 'linked_issue' | 'spec_file' | 'changed_files', ref, status: 'used' | 'missing' | 'skipped', reason? }`;
  `PrIntentDetail = Intent & { pr_id, confidence, sources, provider, model, head_sha, generated_at, stale }`;
  `PrIntentResponse = { intent: PrIntentDetail | null }`.
- **Unchanged:** `Intent` (`contracts/brief.ts`) and `PrIntentRecord` (`review-api.ts`). The
  requirement's "summary" is the existing `intent` field — `feat/homework-5` depends on these
  names.
- `platform.ts` (both copies) and `client/src/lib/feature-models.ts`: the `review_intent`
  default becomes `openrouter` / `deepseek/deepseek-v4-flash` (today `openai` / `gpt-4.1`);
  `IssueMeta` gains optional `is_pull_request`.
- Adapter ports (`adapters.ts`, server copy): `GitClient.readFileAtRef(repo, ref, path)` and
  `GitHubClient.getFileContent(repo, path, ref)`, with mocks.
- `trace.ts` (both copies): `PromptAssembly.intent`, nullish.
- **DB:** `pr_intent` gains nullable or defaulted columns — `confidence`, `sources`, `provider`,
  `model`, `head_sha`, `tokens_in`, `tokens_out`, `cost_usd`, `generated_at` — through a
  drizzle-generated `0012_*` migration (`ADD COLUMN` only). `0012` is free on `feat/homework-5`
  too.
- Repository: `getIntentRecord` / `saveIntentRecord` are added; `getIntent` / `upsertIntent`
  keep their signatures.
- Config: `PROMPT_LOG_VERBOSE`.

## Acceptance criteria

- [ ] **S-AC-1 (contract)** — `Intent` and `PrIntentRecord` are unchanged in both vendor copies;
  `contracts/intent.ts` exists in both, identical, and exports `IntentConfidence`,
  `IntentSource`, `PrIntentDetail`, `PrIntentResponse`.
- [ ] **S-AC-2 (schema)** — `pr_intent` gains only nullable or defaulted columns through a
  generated `0012_*` migration; a row written by the old `upsertIntent` still reads back.
- [ ] **S-AC-3 (default model)** — with no workspace override,
  `resolveFeatureModel(…, 'review_intent')` returns `openrouter` / `deepseek/deepseek-v4-flash`;
  a `PUT /settings` override is honoured.
- [ ] **S-AC-4 (GET never calls the model)** — `GET /pulls/:id/intent` returns 200
  `{ intent }` or `{ intent: null }`, 404 for a PR outside the workspace, 422 for a non-uuid; the
  mock LLM records 0 calls.
- [ ] **S-AC-5 (recalculate = one call)** — `POST /pulls/:id/intent/recalculate` makes exactly
  one `completeStructured` call with the provider and model from `review_intent`, upserts the
  row and returns it; on failure the previous row is untouched.
- [ ] **S-AC-6 (classifier input)** — the messages contain title, description (≤ 4000 chars),
  resolved issues, resolved files and the changed-file list with `@@` headers; no hunk body line
  appears; every untrusted part is inside `wrapUntrusted`; the model is resolved only through
  `resolveFeatureModel(…, 'review_intent')`.
- [ ] **S-AC-7 (no description)** — with an empty or null body and no resolved issue or file,
  stored `confidence` is `low` regardless of the model's answer and `sources` has `pr_description`
  with `status: 'missing'`.
- [ ] **S-AC-8 (references)** — a referenced `.md` file is taken from the PR head commit when
  it exists there, otherwise from the clone, and is `used`; one found in neither yields a
  `sources` entry `{ status: 'missing', reason }`, its content is absent from the prompt, and
  the call still happens.
- [ ] **S-AC-9 (SSRF / traversal)** — no HTTP fetch of a URL from PR text; issues only through
  `GitHubClient.getIssue` for the PR's own repo; files only from the PR's own repo (head commit
  or clone); absolute paths, `..`, symlinks leaving the clone, non-`.md` files and oversized
  files are never read and are recorded;
  `SimpleGitClient.readFile` rejects a path escaping the clone.
- [ ] **S-AC-10 (PR-as-issue)** — a `#N` that is a pull request is recorded `skipped` /
  `is_pull_request`; a bare `#N` without a closing keyword is not a linked issue.
- [ ] **S-AC-11 (derive once before review)** — `POST /pulls/:id/review` with no stored intent
  makes one classifier call shared by all queued agents; with a stored intent, zero; two
  concurrent triggers share one in-flight call.
- [ ] **S-AC-12 (two calls visible)** — a review that derived intent shows a
  `Deriving PR intent (…)` step distinct from the review step in each run's log, and stdout has
  two `llm_call` lines — `intent_classifier` and `review` — with the same `correlationId`.
- [ ] **S-AC-13 (classifier failure)** — a missing key, 402 / 404 or schema failure before a
  review logs an error; the review runs without an intent section and ends `done`.
- [ ] **S-AC-14 (reviewer prompt)** — with intent, the user message has `## PR intent and scope`
  wrapped as `pr-intent` after `## PR description` and the system message ends with
  `SCOPE_RULE`; without intent the prompt has neither.
- [ ] **S-AC-15 (CRITICAL never muted)** — no code path drops, downgrades or merges a finding by
  intent or scope; a stubbed CRITICAL in a file outside `in_scope` survives `reviewPullRequest`
  and is persisted, with or without the marker; `SCOPE_RULE` contains the rule: an out-of-scope
  CRITICAL is reported with a title starting `Out of scope: `, and scope never waives a
  CRITICAL.
- [ ] **S-AC-16 (assembly log)** — each model call emits one `prompt_assembly` line with `call`,
  `correlationId`, `prId`, `provider`, `model`, `sections: [{ name, source, tokens }]`,
  `totalTokens`; no field holds prompt, diff, spec or issue text, or a key.
- [ ] **S-AC-17 (verbose only locally)** — text previews are logged only with
  `PROMPT_LOG_VERBOSE=true` and `NODE_ENV=development`; in `test` and `production` the flag does
  nothing.
- [ ] **S-AC-18 (cost)** — the classifier's tokens and cost are on the `pr_intent` row and in
  its `llm_call` line; `agent_runs` totals equal the review call(s) only.
- [ ] **S-AC-19 (provider errors)** — `recalculate` maps provider 402 → 402
  `llm_payment_required`, provider 404 → 502 `llm_model_not_found`, missing key → `ConfigError`,
  the rest → 502.
- [ ] **S-AC-20 (staleness)** — `PrIntentDetail.stale` is `true` when the stored `head_sha`
  differs from `pull_requests.head_sha`; `false` otherwise or when the stored value is null.
- [ ] **S-AC-21 (untouched)** — Smart Diff, `PrDetail.linked_issue`, `Intent`, `PrBrief` and
  migrations `0000`–`0011` are unchanged; reviewer-core has no new DB / GitHub / fs import.
- [ ] **S-AC-22 (forged tags)** — data containing `</untrusted>`, `</UNTRUSTED >`,
  `<untrusted source="x">` or `< /untrusted` cannot close or open a block: after
  `wrapUntrusted` the output has exactly one opening and one closing tag.
- [ ] **S-AC-23 (title is data)** — in the review prompt the PR title appears only inside
  `wrapUntrusted('pr-title', …)`; the task line does not contain it.
- [ ] **S-AC-24 (redaction)** — a log call carrying an `authorization` header, an `apiKey` or a
  `token` field prints `[redacted]` in its place.
- [ ] **S-AC-25 (input budget)** — the classifier input never exceeds 6 000 tokens; when over,
  spec texts are cut before anything else, and each cut source carries `reason: 'truncated'`.

## Tests

| Suite | Covers |
|---|---|
| reviewer-core unit — `intent/derive-intent.test.ts`, `prompt.test.ts` | S-AC-5, 6, 7, 14, 15, 16, 22, 23, 25 |
| server unit — `intent/*.test.ts`, `adapters/git/confine-path.test.ts`, `platform/prompt-log.test.ts` | S-AC-6–10, 13, 16, 17, 19, 20, 23, 24, 25 |
| server unit — `run-executor.test.ts` (extended) | S-AC-11, 12, 13, 15, 18 |
| server integration — `test/intent.it.test.ts` | S-AC-2, 4, 5, 18, 19, 20 |
| server unit — `test/contracts.test.ts` (extended) | S-AC-1, 3 |

## Decisions

Settled with the owner on 2026-10-12:

1. The summary stays in the existing `intent` field; the UI labels it "Summary". `Intent` is not
   changed.
2. Out-of-scope CRITICAL: prompt rule + the `Out of scope: ` title marker. No structured field.
3. `review_intent` defaults to `deepseek/deepseek-v4-flash` via OpenRouter; the classifier takes
   its model only from `resolveFeatureModel(…, 'review_intent')`.
4. Confidence is `low | medium | high`, capped by the server.
5. A stale intent is reused and flagged; recalculation is manual.
6. Classifier cost lives on `pr_intent` and in the log line.
7. Issues: closing keywords or a same-repo issue URL only; a PR returned by `getIssue` is
   skipped.
8. A referenced spec is read from the PR head first, then the clone; `.md` only, size-capped.
9. The `feat/homework-5` "No intent available" line is fixed when the branches are merged.
