# reviewer-core architecture

How `@devdigest/reviewer-core` turns *(parsed diff + PR metadata + repo map + agent prompt)* into a
grounded `Review`: the order things run in, where the purity boundary sits, and which behaviours a
consumer may depend on.

Everything below is the code in [`src/`](../src) as it stands. The citation gate has its own
behaviour contract in [specs/grounding.md](../specs/grounding.md); prompt-authoring conventions live
in [docs/agent-prompts/README.md](../../docs/agent-prompts/README.md).

---

## 1. The pipeline

One entry point: `reviewPullRequest` ([review/run.ts:123](../src/review/run.ts)). It runs
assemble → LLM (1..N calls) → reduce → ground → recompute score, and returns a `ReviewOutcome`.

```
ReviewInput ──▶ selectMode ──▶ chunk(s) ──▶ assemblePrompt ──▶ llm.completeStructured
                                                                      │  (Zod → JSON Schema,
                                                                      │   parse-with-repair)
                                                                      ▼
ReviewOutcome ◀── score := scoreFromFindings(kept) ◀── groundFindings ◀── reduceReviews
```

### 1.1 Input

`ReviewInput` ([run.ts:44-93](../src/review/run.ts)). Required: `systemPrompt`, `model`, `diff`,
`llm`. Everything else is optional and, when absent, changes nothing about the assembled prompt
(see §5).

`diff` is an **already-parsed** `UnifiedDiff`
([adapters.ts:185-188](../../server/src/vendor/shared/adapters.ts)) — the engine never shells out to
git. Its `files[].hunks[].newLineNumbers` is what grounding indexes; the only producer in this repo
is the server's [diff-parser.ts](../../server/src/adapters/git/diff-parser.ts), which pushes a
new-side line number for every added **and** context line in a hunk.

`llm` is an `LLMProvider` ([adapters.ts:82-88](../../server/src/vendor/shared/adapters.ts)); only
`completeStructured` is ever called from the pipeline.

### 1.2 Strategy and chunking

`selectMode` ([run.ts:115-121](../src/review/run.ts)):

| `strategy` | Result |
|---|---|
| `'single-pass'` | always single-pass |
| `'map-reduce'` | map-reduce **only if** `diff.files.length > 1`, else single-pass |
| `'auto'` (default) | map-reduce **only if** total `additions + deletions` across files `> threshold` **and** `files.length > 1` |

`threshold` is `mapThresholdLines ?? DEFAULT_MAP_THRESHOLD_LINES` = 400
([run.ts:30](../src/review/run.ts), [run.ts:124](../src/review/run.ts)).

Chunks ([run.ts:144-147](../src/review/run.ts)): map-reduce → one chunk per file, label = the file
path, text = `sliceDiff(diff, path)`; single-pass → exactly one chunk labelled `'all files'` whose
text is `diff.raw`.

`sliceDiff` ([reduce.ts:58-72](../src/review/reduce.ts)) re-slices the raw diff textually: it starts
capturing at a `diff --git` line containing `b/<path>` or ` <path>` and keeps capturing until the
next `diff --git`. If nothing matched it synthesises a three-line header for that file, or returns
the whole `diff.raw` when the path is not in `diff.files` at all.

### 1.3 `assemblePrompt` message order

[prompt.ts:85-141](../src/prompt.ts). The model always receives **exactly two messages**.

**System** = `parts.system` + `"\n\n"` + `INJECTION_GUARD` ([prompt.ts:86](../src/prompt.ts)). The
guard is appended on every call, so it covers every consumer path.

**User** = the present sections below, joined with `"\n\n"`, in this fixed order:

| # | Section heading | Source slot | Wrapped? | Present when |
|---|---|---|---|---|
| 1 | *(no heading — the task line)* | `task` | no | `task` is truthy |
| 2 | `## PR description` | `prDescription` | `source="pr-description"` | non-blank after `trim()`; sliced to `MAX_PR_DESCRIPTION_CHARS` = 4000 ([prompt.ts:37](../src/prompt.ts)) |
| 3 | `## Skills / rules` | `skills[]` | no | array non-empty; joined with `\n\n` |
| 4 | `## Relevant memory` | `memory[]` | no | array non-empty; rendered as `- ` bullets |
| 5 | `## Repo skeleton` | `repoMap` | `source="repo-map"` | non-blank after `trim()` |
| 6 | `## Project context` | `specs[]` | `source="spec-<i>"` per element | array non-empty |
| 7 | `## Callers of changed symbols` | `callers` | `source="callers"` | non-blank after `trim()` |
| 8 | `## Diff to review` | `diff` (the chunk text) | `source="diff"` | **always** |

The return value also carries a `PromptAssembly`
([trace.ts:39-53](../../server/src/vendor/shared/contracts/trace.ts)) for the run trace. Note the
asymmetry at [prompt.ts:129-138](../src/prompt.ts): `specs` records the **wrapped** block, while
`callers`, `repo_map` and `pr_description` record the **unwrapped** slot value (`pr_description`
truncated, the other two exactly as passed — so a whitespace-only `repoMap` is recorded even though
its section was omitted). `user` is the final joined message.

In map-reduce mode the non-diff slots are re-rendered into **every** chunk call
([run.ts:172](../src/review/run.ts) reuses the same `promptParts`), so skills / memory / specs /
repo map / callers / PR description are paid for once per file.

### 1.4 The LLM call and structured output

Per chunk ([run.ts:162-188](../src/review/run.ts)): `checkCancelled?.()` first (so an abort costs
nothing), then `emit('tool', …)`, then `llm.completeStructured<Review>` with `schema: ReviewSchema`,
`schemaName: 'Review'`, `maxRetries`, and `sessionId` only when supplied.

The shipped provider, `OpenRouterProvider` ([llm/openrouter.ts](../src/llm/openrouter.ts)), drives
an OpenAI-compatible endpoint:

- **Shape is enforced out of band.** `toJsonSchema(req.schema, req.schemaName)`
  ([structured.ts:19-22](../src/llm/structured.ts), via `zodResponseFormat` from the OpenAI SDK) is
  sent as `response_format: { type: 'json_schema', json_schema: { …, strict: true } }`
  ([openrouter.ts:74-77](../src/llm/openrouter.ts)). The JSON shape is never described in prompt
  text.
- **Parse-with-repair.** Up to `maxRetries + 1` attempts
  ([openrouter.ts:68](../src/llm/openrouter.ts)). Each raw completion goes through
  `parseWithRepair` ([structured.ts:54-84](../src/llm/structured.ts)): `JSON.parse` on the trimmed
  text first, falling back to `extractJson` (fence-strip, then first balanced `{…}`/`[…]`) only if
  that throws — the order matters, because `extractJson` can be fooled by fences or braces *inside*
  JSON string values. On a Zod failure it returns a `repromptMessage` listing the issue paths, which
  is appended as a `user` turn after the model's own output
  ([openrouter.ts:112-113](../src/llm/openrouter.ts)) and the loop retries. Exhausting the budget
  throws ([openrouter.ts:115](../src/llm/openrouter.ts)).
- **No-choices guard.** A 200 response with no `choices` (upstream provider error, moderation,
  free-tier limit) throws with the embedded `error.message`
  ([openrouter.ts:88-92](../src/llm/openrouter.ts)) instead of parsing an empty string.
- **Usage.** Tokens accumulate across attempts; `usage.cost` is requested from OpenRouter
  (`usage: { include: true }`, [openrouter.ts:83](../src/llm/openrouter.ts)) and preferred over the
  **injected** `estimateCost` ([openrouter.ts:36](../src/llm/openrouter.ts),
  [openrouter.ts:107](../src/llm/openrouter.ts)); neither available → `null`. `sessionId` is sent as
  `session_id` only when `id === 'openrouter'` ([openrouter.ts:80](../src/llm/openrouter.ts)).
- `complete` and `embed` throw; `listModels` fetches `/models` raw because the SDK strips `pricing`,
  and treats negative prices as unknown ([openrouter.ts:118-157](../src/llm/openrouter.ts)).

Back in the loop, tokens are summed and cost is **null-poisoned**: one unpriced chunk makes the
whole run's `costUsd` null ([run.ts:184](../src/review/run.ts)).

### 1.5 Reduce

`reduceReviews(partials)` ([reduce.ts:43-55](../src/review/reduce.ts)):

- exactly one partial → returned unchanged (the single-pass short circuit);
- otherwise: findings concatenated in chunk order; **worst** verdict wins by `VERDICT_RANK`
  (`request_changes` 2 > `comment` 1 > `approve` 0, [reduce.ts:33-37](../src/review/reduce.ts));
  score is the rounded mean of the partials' self-reported scores; summaries joined with a space
  after dropping falsy ones.

The mean score is transient — §1.7 overwrites it.

### 1.6 Grounding

`groundFindings(merged.findings, input.diff)` ([run.ts:197](../src/review/run.ts)) is the single
post-step, shared by both strategies. Each dropped finding is announced as an `info` event
([run.ts:199-201](../src/review/run.ts)) — the gate is never silent — and
`groundingSummary` produces the `"kept/total passed"` string carried on the outcome. The full
acceptance rule, the drop cases and the downstream consequences are specified in
[specs/grounding.md](../specs/grounding.md).

### 1.7 The returned `ReviewOutcome`

[run.ts:207-218](../src/review/run.ts), shape at [run.ts:95-113](../src/review/run.ts):

| Field | Value |
|---|---|
| `review.findings` | the **kept** findings only |
| `review.score` | `scoreFromFindings(kept)` — recomputed, the model's number discarded |
| `review.verdict`, `review.summary` | passed through from `reduceReviews` unchanged (`...merged`) |
| `grounding` | `"kept/total passed"` |
| `dropped` | `{ finding, reason }[]` for logs and the trace |
| `mode` | `'single-pass'` \| `'map-reduce'` |
| `assembly` | single-pass → the one call's assembly ([run.ts:173](../src/review/run.ts)); map-reduce → the **whole-diff** assembly built up front ([run.ts:142](../src/review/run.ts)) |
| `chunks` | `{ label }[]` only |
| `tokensIn` / `tokensOut` / `costUsd` | summed across chunks; cost null-poisoned |
| `raw` | chunk raws joined with `\n---\n` |

`scoreFromFindings` ([reduce.ts:27-30](../src/review/reduce.ts)) is `100 −` the sum of per-severity
penalties (`CRITICAL` 35, `WARNING` 12, `SUGGESTION` 3), clamped to 0–100. Pinned by
[test/run.test.ts:67](../test/run.test.ts) (one surviving CRITICAL ⇒ 65, from a model that reported
38) and [test/run.test.ts:88](../test/run.test.ts) (zero findings ⇒ 100, from a model that reported
10).

### 1.8 Progress events

`onEvent` receives `ReviewEvent { kind, msg, data? }` ([run.ts:38-42](../src/review/run.ts)), with
`kind` from `RunEventKind` (`info | tool | result | error`,
[trace.ts:9](../../server/src/vendor/shared/contracts/trace.ts)). Emitted, in order: one `info` for
the selected mode; per chunk a `tool` (`data: { file }`) and a `result` with the candidate count;
a `result` for the reduce; one `info` per dropped finding; a final `result` with the grounding
summary. The server bridges these onto SSE
([run-executor.ts:209](../../server/src/modules/reviews/run-executor.ts)).

### 1.9 Output helper

`toReviewPayload` ([output/to-review.ts:148](../src/output/to-review.ts)) is a separate, optional
step — `reviewPullRequest` does not call it. It renders a grounded `Review` into a
`GitHubReviewPayload`, and computes the review **event** deterministically from severities plus the
agent's `ci_fail_on` gate, ignoring the model's `verdict`
([to-review.ts:156-161](../src/output/to-review.ts)): no findings → `APPROVE`, gate tripped →
`REQUEST_CHANGES`, else `COMMENT`. It reuses grounding's `buildLineIndex` to anchor each inline
comment to the in-diff line nearest `end_line`, dropping the inline comment (never the finding) when
no line in the range is in the diff ([to-review.ts:107-122](../src/output/to-review.ts)). The gate
and anchoring rules are pinned by [test/to-review.test.ts](../test/to-review.test.ts).

---

## 2. The purity boundary

**Injected, and therefore the only way the engine reaches the outside world:**

| Injection | Declared at | Purpose |
|---|---|---|
| `llm: LLMProvider` | [run.ts:52](../src/review/run.ts) | the one side effect of a review |
| `onEvent?` | [run.ts:86](../src/review/run.ts) | progress sink — the caller decides whether that is SSE, a log, or nothing |
| `checkCancelled?` | [run.ts:92](../src/review/run.ts) | caller-owned abort; it **throws**, so the engine needs no error type of its own |
| `estimateCost?` | [openrouter.ts:36](../src/llm/openrouter.ts) | pricing table stays in the consumer; the engine ships none |

**Refused:** no database, no GitHub, no filesystem, no clock, no randomness, no `process`/env
reads, no logging. That is visible in the source — the runtime (non-`type`) imports across all of
`src/` are exactly `openai`, `zod`, the `Review` Zod schema from `@devdigest/shared`, and sibling
modules; no `node:*` builtin is imported anywhere. Contracts come in as `import type`, so they cost
nothing at runtime.

The one file that does I/O of its own is `OpenRouterProvider`
([llm/openrouter.ts](../src/llm/openrouter.ts)) — an *implementation* of the injected interface that
the package happens to own because both consumers need it. It is inert unless a consumer constructs
it (the server does, in
[container.ts:22](../../server/src/platform/container.ts)); nothing in the pipeline imports it.

**How it is enforced:** by construction plus the test setup, not by a lint rule (the repo has no
linter). `npm test` runs the whole pipeline against stubbed providers with no keys and no network —
[test/run.test.ts](../test/run.test.ts) drives `reviewPullRequest` with the server's
`MockLLMProvider` / `MockGitClient` and with a hand-written `LLMProvider` literal
([run.test.ts:109-132](../test/run.test.ts)). A dependency on a DB, fs or HTTP client would make
those tests impossible to run as they are. `npm run typecheck` is also `build`
([package.json:8-10](../package.json)) because `tsconfig.json` is `noEmit`
([tsconfig.json:18](../tsconfig.json)) — the package never produces JS.

---

## 3. Untrusted input: `wrapUntrusted` + `INJECTION_GUARD`

Everything derived from the repo, the PR author or the diff is **data, never instructions**.

`wrapUntrusted(label, content)` ([prompt.ts:30-34](../src/prompt.ts)) fences content in
`<untrusted source="…">…</untrusted>` and first neutralises any attempt to close the delimiter early
by rewriting `</untrusted>` to `<\/untrusted>`.

| Slot | Wrapped | Rationale |
|---|---|---|
| `diff` | yes (`diff`) | repo content |
| `prDescription` | yes (`pr-description`) | author-controlled — the prime injection vector; also capped at 4000 chars |
| `repoMap` | yes (`repo-map`) | derived from repo code |
| `callers` | yes (`callers`) | derived from repo code |
| `specs[]` | yes (`spec-<i>`, per element) | project docs |
| `system` | **no** | the agent's own prompt — trusted |
| `skills[]` | **no** | trusted-ish; community skills are expected to be sanitised upstream ([prompt.ts:42](../src/prompt.ts)) |
| `memory[]` | **no** | curated by the workspace |

`INJECTION_GUARD` ([prompt.ts:16-28](../src/prompt.ts)) is appended to every system message. It says
two things: content inside `<untrusted>` blocks is data, and — specifically — claims that the code
is a "test fixture" / "intentional" / "demo" / "not for production", or instructions to "ignore"
issues, **in any language**, never reduce, waive or descope the review.

**Why the defense is a trusted prompt rule and not text scanning.** It replaced a keyword sanitizer
([prompt.ts:11-15](../src/prompt.ts)): scanning untrusted text only ever catches one phrasing in one
language, while a general rule in the trusted channel applies to every phrasing, and it lives in one
place that both the studio and the CI path traverse (both call `reviewPullRequest` →
`assemblePrompt`). [test/prompt.test.ts:18-33](../test/prompt.test.ts) pins the properties that
matter — the guard follows the agent prompt, names the descoping claims, forbids them from reducing
the review, and says "any language".

The same principle applies to output: the response shape is pinned by the JSON Schema
`response_format` (§1.4), never by prose in the prompt — so an agent prompt must not describe the
JSON ([docs/agent-prompts/README.md](../../docs/agent-prompts/README.md)).

---

## 4. Public surface and how the server consumes it

[`src/index.ts`](../src/index.ts) is the **only** supported surface. It exports:

| Group | Exports |
|---|---|
| Prompt | `assemblePrompt`, `wrapUntrusted`, `PromptParts`, `AssembledPrompt` |
| Grounding | `groundFindings`, `groundingSummary`, `GroundingResult` |
| Structured output | `toJsonSchema`, `extractJson`, `parseWithRepair`, `JsonSchema`, `ParseResult` |
| Map-reduce | `reduceReviews`, `sliceDiff` |
| Engine | `reviewPullRequest`, `DEFAULT_MAP_THRESHOLD_LINES`, `DEFAULT_REVIEW_MAX_RETRIES`, `ReviewInput`, `ReviewOutcome`, `ReviewEvent`, `ReviewStrategy`, `ReviewMode` |
| Output | `toReviewPayload`, `gateTriggered`, `countBlockers`, `ToReviewOptions` |
| Provider | `OpenRouterProvider`, `OpenRouterProviderOptions` |

Anything not listed (e.g. `buildLineIndex`, `scoreFromFindings`, `SEV_RANK`) is exported from its
module but not from the barrel — internal, and free to change. A new API is only public once it is
added here.

**Consumption is raw TypeScript source, not a build artifact.** The server maps the package name
onto this file with a tsconfig path alias —
`"@devdigest/reviewer-core": ["../reviewer-core/src/index.ts"]`
([server/tsconfig.json:24-25](../../server/tsconfig.json)) — mirrored for the test runner in
[server/vitest.config.ts:8](../../server/vitest.config.ts). tsx in dev and vitest in tests compile
the `.ts` files directly, which is why the package's `build` is a type-check and why
`reviewer-core/node_modules` must exist for the API to boot.

The dependency runs the other way too: reviewer-core borrows the shared contracts from the server's
vendored copy, `"@devdigest/shared": ["../server/src/vendor/shared/index.ts"]`
([tsconfig.json:21-25](../tsconfig.json), aliased again in
[vitest.config.ts:9](../vitest.config.ts)). `Review` is imported as a **value** (the Zod schema
handed to `completeStructured`); the rest are type-only imports.

Server code does not import the barrel everywhere; three thin re-export shims keep the old server
paths working — [platform/prompt.ts](../../server/src/platform/prompt.ts),
[platform/grounding.ts](../../server/src/platform/grounding.ts),
[platform/structured.ts](../../server/src/platform/structured.ts) — plus
[modules/reviews/helpers.ts](../../server/src/modules/reviews/helpers.ts) for `reduceReviews` /
`sliceDiff`. The real call site is
[modules/reviews/run-executor.ts:191-213](../../server/src/modules/reviews/run-executor.ts).
Because there is no compiled interface between the packages, changing an export is only verified by
running `pnpm typecheck` in `server/`.

---

## 5. Prompt slots and the empty-slot contract

The four context slots — `skills`, `memory`, `specs`, `callers` — plus `repoMap`, `prDescription`
and `task` are all optional, and the contract is the same for each: **an empty slot omits its whole
section**, producing a prompt byte-identical to one assembled without that slot. No placeholder, no
empty heading.

The emptiness test differs by slot type ([prompt.ts:88-120](../src/prompt.ts)):

- arrays (`skills`, `memory`, `specs`) — `undefined` or `length === 0`;
- strings (`repoMap`, `callers`, `prDescription`) — `undefined` or blank after `trim()`;
- `task` — any falsy value, including `''`.

Pinned for `prDescription` by [test/prompt.test.ts:50-56](../test/prompt.test.ts): both `undefined`
and `'   '` leave the section out and record `null` in the assembly.

Consumers therefore pass slots conditionally rather than passing empties — the server spreads them
in only when it has content ([run-executor.ts:201-206](../../server/src/modules/reviews/run-executor.ts)),
so in the starter (`skills` / `memory` / `specs` unused) the assembled prompt is exactly task +
diff, plus whatever repo-intel produced.
