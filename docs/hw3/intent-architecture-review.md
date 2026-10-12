# Intent Layer — architecture review

Report of the `architecture-reviewer` agent, as returned. Input: the 49 files changed between
the specs commit `d735091` and the implementation, before fixes, the two specs and the plan.

## Round 1

```
client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx:20 | WARNING | Component-private constants are declared inline in the component (CONFIDENCE_COLOR at :20, ERROR_KEY_BY_CODE at :26, REASON_KEYS at :32). The folder has no constants.ts. | Frontend-architecture rule 3 and the root CLAUDE.md naming table put component constants in the fixed-name `constants.ts`. `styles.ts` and `index.ts` are correct. The `ScopeList` helper at :42 is fine inline.

client/src/lib/hooks/index.ts:4 | WARNING | The new `hooks/intent.ts` is not re-exported from the hooks barrel. `OverviewTab.tsx:6` deep-imports `import { useIntent, useRecalculateIntent } from "@/lib/hooks/intent"`. | Frontend-architecture "Where things live": a data hook is "exported from `src/lib/hooks/index.ts`". The barrel header says domain files "resolve here". Every other domain file (core, agents, skills, reviews, trace, repo-intel, conventions) is exported at lines 4-10, and `intent` is missing.

server/src/modules/reviews/intent/intent-service.ts:14 | WARNING | The service takes a DB row type from the schema: `import type * as schema from '../../../db/schema.js'; type RepoRow = typeof schema.repos.$inferSelect;`. This type is used in the signatures of the public `ensureForReview` and the private `deriveShared`, `derive` and `callClassifier`. The module already routes row types through its repository facade (`PullRow` via `repository.ts`, which re-exports it from `db/rows.ts`). `RepoRow` is exported from `modules/repos/repository.ts:10`, and a parallel type could instead be added to `db/rows.ts`. | Onion layering: the schema is the innermost ring and the service should see rows only via the repository. This is a Drizzle type leaking into the service layer.

server/src/modules/reviews/intent/intent-service.ts:11 | SUGGESTION | `IntentRecord` is imported from the sub-file `../repository/pull.repo.js`. Callers should see the facade, but `repository.ts` only exposes it indirectly through `pullRepo.IntentRecord` in method signatures (lines 140-145) and does not re-export the type. | Compare `repository.ts:17`, `export type { FindingRow, PullRow }`. Re-export `IntentRecord` there so the service depends on the `repository.ts` public surface only.

server/src/modules/reviews/intent/intent-service.ts:27 | SUGGESTION | The module-level `inFlight` Map is process-global mutable state. It works across the two `IntentService` instances that `service.ts:42` and `run-executor.ts:57` each construct with `new IntentService(container, repo)`, but only because it is module-scoped. It is not keyed by workspace or tied to the container, so a second container (for example in tests) shares in-flight promises. The dedupe logic is not isolated, and the service is not resolvable from the composition root. | `const inFlight = new Map<string, Promise<PrIntentDetail>>();`. Onion rule 3 favours container-held state. Acceptable today because PR ids are globally unique UUIDs and entries are deleted in `.finally`. Consider holding the map as an instance field on a single shared service, or on the container.

client/src/vendor/shared/adapters.ts:135 | SUGGESTION | The server `adapters.ts` was changed (`getFileContent` at server:169, `readFileAtRef` at server:236). The client copy has only `getIssue` and neither new method. This is a divergence from this change in the second `vendor/shared` copy. The client never calls these interfaces, so the impact is low. | `grep readFileAtRef|getFileContent` in `client/src/vendor/shared` returns only `getIssue`. Rule 9 says a contract change goes to both copies, though adapters are server-side ports.
```

Checked with no finding:

- Both copies of `contracts/intent.ts` are byte-identical.
- `platform.ts` has the identical `review_intent` entries at line 16 and lines 52-54 in both copies.
- `trace.ts` has the identical `intent` field in both copies. The only remaining difference is the
  pre-existing `callers`/`repo_map` comment wording, which this change did not introduce.
- Both `index.ts` files export `contracts/intent.js` at line 24.
- Layering: `routes.ts` only calls `ReviewService.intentForPull` and `recalculateIntent` and reaches
  no adapter or DB. `collect-sources.ts` reaches GitHub and git only through `container.github()`
  and `container.git`. `intent-service.ts` uses `container.llm()` and `container.tokenizer`.
- Cross-module use of `resolveFeatureModel` matches the existing precedent in
  `conventions/service.ts`.
- `reviewer-core/derive-intent.ts` imports only `zod`, `@devdigest/shared` types and its own
  `../prompt.js`. It has no server, DB or fs imports, and is pure apart from the injected LLM.
- The `intent/` subfolder follows the `smart-diff/` precedent. `constants.ts` is a fixed name.
- The IntentCard folder, its barrel and its `messages/en/intent.json` namespace follow the skill.
  The component fetches nothing, and all fetching sits in `hooks/intent.ts` through `api`. Colors
  are CSS vars with no hex literals. The showcase entry was added.
- I did not read the migration SQL, snapshot or journal content, as instructed. I did not open
  `0012_nice_wolf_cub.sql`, so I could not confirm it was drizzle-generated rather than
  hand-shaped.

**Verdict: PASS (0 CRITICAL, 3 WARNING, 3 SUGGESTION)**

## Round 2 — after the fix round

Input: the files changed by the fix round and the round-1 report.

| round-1 finding | status | evidence file:line |
|---|---|---|
| IntentCard constants inline (WARNING) | FIXED | `IntentCard/constants.ts:1,7,17` hold `CONFIDENCE_COLOR`, `ERROR_KEY_BY_CODE` and `REASON_KEY_BY_REASON`. `IntentCard.tsx:9` imports them. `ScopeList` stays inline at :21, which is acceptable. |
| `hooks/intent` not in the hooks barrel (WARNING) | FIXED | `client/src/lib/hooks/index.ts:11` has `export * from "./intent"`. `OverviewTab.tsx:6` now imports from `@/lib/hooks`. |
| `RepoRow` taken from `db/schema` in the service (WARNING) | FIXED | `server/src/db/rows.ts:15` defines `RepoRow`. `reviews/repository.ts:16-18` re-exports it. `intent-service.ts:10` imports `RepoRow` from `../repository.js`. The service has no schema import left. |
| `IntentRecord` imported from `pull.repo.js` (SUGGESTION) | FIXED | `reviews/repository.ts:17-18` re-exports it. `intent-service.ts:10` imports it from the facade. |
| Module-level `inFlight` map (SUGGESTION) | NOT FIXED | `intent-service.ts:23` still has `const inFlight = new Map<...>()`. It was optional. |
| Client `adapters.ts` lacks `readFileAtRef` / `getFileContent` (SUGGESTION) | NOT FIXED | A grep of `client/src/vendor/shared` for `readFileAtRef`, `getFileContent` and `maxBytes` finds nothing. `maxBytes` was added only to the server copy at `server/src/vendor/shared/adapters.ts:174,238,243`. These are server-side ports, so the impact stays low. |

New findings, only in the changed files:

```
server/src/modules/reviews/intent/collect-sources.ts:4 | SUGGESTION | The service layer imports a runtime helper from `adapters/` (`isFileTooLarge`). The error type is defined in `adapters/file-too-large.ts`, outside the shared port contract. The port doc in `vendor/shared/adapters.ts:173,237` names `FileTooLargeError` and `code: 'FILE_TOO_LARGE'`, but the shared package exports no way to detect it. Other modules already import pure helpers from `adapters/`: `diff-loader.ts:3` imports `diff-parser.js`, and `repo-intel` imports `astgrep` and `codeindex`. So this is not a boundary break. The type is also not an `AppError`. | Onion layering says outside dependencies are reached through an adapter. A cleaner structure would put the error type and its detector in `platform/errors.ts` or in `vendor/shared`, next to the port that documents it. The current placement is acceptable.

server/src/db/rows.ts:15 | SUGGESTION | `RepoRow` now exists twice with the same shape: `db/rows.ts:15` and `modules/repos/repository.ts:10` (`export type RepoRow = typeof t.repos.$inferSelect`). The `rows.ts` header says each owning repository should re-export from `rows.ts`. The repos module was not switched over, though the change touched `rows.ts`. | `rows.ts:6-10`. Drift risk is low because both are inferred from the same table.
```

The `maxBytes` parameter is optional on the ports, so existing callers are unaffected. The three
adapter implementations and the mocks all throw `FileTooLargeError` (`simple-git.ts:135,154`,
`octokit.ts:384`, `mocks.ts:253,317,330`). No layering problems found in `file-too-large.ts`, the
hooks barrel or the `IntentCard` constants.

**Verdict: PASS (0 CRITICAL, 0 WARNING, 2 SUGGESTION).** All three round-1 WARNINGs are FIXED. One
of the round-1 SUGGESTIONs is fixed; the others stay open and are not fixed in this homework.
