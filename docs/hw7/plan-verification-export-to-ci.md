# Plan verification — Export to CI (HW7, Part B)

## 1. Inputs

| | |
|---|---|
| Spec | `specs/export-to-ci/spec.md` — SPEC-05, `Status: approved` |
| Plan | `specs/export-to-ci/plan.md` |
| Requirements | `docs/hw7/requirements.md`, Part B |
| Branch | `feat/export-to-ci` (cherry-picked from the mixed local `feat/homework-7`) |
| Base | `d24a10f` (last commit before the run; merge-base with `main` is `c583b67`) |
| Head | `7d9e404` |
| SHA map | `9438a7d`→`13d0764` · `5f2a27a`→`c7e2f99` · `f5884e1`→`7d9e404`; the SHAs below are the original ones |
| Feature commits | `9438a7d` feat(client) · `5f2a27a` feat(server) · `f5884e1` fix(ci): address review |

`ffe29a1` (multi-agent review, Part A) sits between base and head. A parallel session committed it, and it is not part of this run.

## 2. Matrix

Tasks and tests come from the plan's Traceability table. Evidence and status come from the merged server and client verifier matrices.

| AC | task(s) | test (file › case) | commit | evidence (file:line) | status |
|---|---|---|---|---|---|
| AC-1 | T-S4, T-C5 | `server/src/modules/ci/bundle.test.ts` › exact file set, identical runner contents, only the workflow editable; `ExportWizard.test.tsx` › Preview lists files, only the workflow is editable | 5f2a27a, 9438a7d (wizard moved in f5884e1) | server: `bundle.ts:24-33`, `manifest.ts:47-51`, `runner-build.ts:4-27`, `service.ts:277-283`, `bundle.test.ts:53-77` · client: `components/ci/ExportWizard/ExportWizard.tsx:60-66,107-120,219-223`, `ExportWizard.test.tsx:91-104` | PASS |
| AC-2 | T-S4, T-S7 | `bundle.test.ts` › manifest round-trip through `AgentManifest`, invalid → null; `service.test.ts` › invalid manifest → 422, nothing committed | 5f2a27a | `manifest.ts:53-85`, `service.ts:284-290`, `bundle.test.ts:111-143`, `service.test.ts:124-134` | PASS |
| AC-3 | T-S4, T-S7, T-S8, T-C5 | `runner-build.test.ts` › missing dir / no `index.js` → null; `service.test.ts` › 409 with build hint, no GitHub call; `routes.test.ts` › 409 envelope; `ExportWizard.test.tsx` › 409 hint, Install unreachable | 5f2a27a, 9438a7d, f5884e1 | server: `runner-build.ts:18-26`, `service.ts:269-276`, `constants.ts:48`, `routes.ts:42-58`, `service.test.ts:110-122`, `routes.test.ts:41-47` · client: `ExportWizard.tsx:72-73,98-105`, `helpers.ts:18`, `ci.json:90`, `ExportWizard.test.tsx:106-116` | PASS |
| AC-4 | T-S3 | `workflow.test.ts` › name, types, permissions, concurrency, timeout, Node 22, run + env, artifact upload `always()` / 7 days | 5f2a27a | `workflow.ts:27-91`, `constants.ts:8-19`, `workflow.test.ts:8-46` (upload `if` is `always() && steps.runner.outputs.present == 'true'`, as the plan's T-S3 says) | PASS |
| AC-5 | T-S3 | `workflow.test.ts` › base-SHA checkout, `persist-credentials: false`, no `pull_request_target`, 40-hex pins, fork skip notice, absent-runner notice + success, only two secrets, no `${{` in `run:` | 5f2a27a | `workflow.ts:46-90`, `constants.ts:27-41` (the three SHAs match the spec), `workflow.test.ts:48-118` | PASS |
| AC-6 | T-S7, T-C1, T-C5 | `service.test.ts` › first install: one commit to `devdigest/ci` from `main`, PR title/body, URL, installation recorded, nothing else written; `ci.test.ts` › install body; `ExportWizard.test.tsx` › PR link shown | 5f2a27a, 9438a7d | server: `service.ts:95-156`, `bundle.ts:36-49`, `octokit.ts:282-347`, `repository.ts:112-149`, `service.test.ts:183-199` · client: `hooks/ci.ts:51-57`, `ExportWizard.tsx:156-163,189-196`, `ExportWizard.test.tsx:134-174`, `ci.test.ts:74-90` | PASS — live 2026-10-16: wizard → PR [#25](https://github.com/equalizer2k9/dev-digest/pull/25) `devdigest/ci` → `main` with the 5 files; one `ci_installations` row (Security Reviewer, `equalizer2k9/dev-digest`, `gha`); the upsert with `pg_advisory_xact_lock` ran on Postgres (§7) |
| AC-7 | T-S7 | `service.test.ts` › second install: no new PR, same URL, same installation upserted | 5f2a27a | `service.ts:136-155`, `repository.ts:132-147`, `service.test.ts:201-211` | PASS — live: a second Install returned the same #25 URL; `ci_installations` still 1 row, GitHub lists 1 PR from `devdigest/ci` (`export-to-ci/06-reinstall-same-pr.png`) |
| AC-8 | T-S2, T-S7, T-S8, T-C5 | `octokit-actions.test.ts` › 403/`workflow` → permission error; `service.test.ts` › 403 `ci_workflow_permission`, no installation; `routes.test.ts` › 403 envelope; `ExportWizard.test.tsx` › message shown | 5f2a27a, 9438a7d, f5884e1 | server: `octokit.ts:23-31,301-342`, `platform/errors.ts:43-57`, `service.ts:124-134`, `octokit-actions.test.ts:123-168`, `service.test.ts:158-166`, `routes.test.ts:49-54` · client: `ExportWizard.tsx:164-169`, `ExportWizard.test.tsx:176-183` | PASS |
| AC-9 | T-S2, T-S5, T-S7, T-C1, T-C4 | `artifact.test.ts` › valid artifact; `service.test.ts` › a run from another or null head repo is skipped before any download (fix(ci): same-repo runs only); `service.test.ts` › one `recordCiRun` with source `ci`, already-ingested URL skipped, limit 30; `ci.test.ts` › refresh posts once; `CiRunsView.test.tsx` › one ingest on open, one per Refresh; manual: double refresh on the live stack records one row | 5f2a27a, 9438a7d, fix(ci) | server: `service.ts:164-245`, `octokit.ts:411-442`, `repository.ts:91-105,152-160,183-226`, `service.test.ts:244-279`, `artifact.test.ts:38-78` · client: `CiRunsView.tsx:18-25,59-61`, `hooks/ci.ts:34-43`, `CiRunsView.test.tsx:63-68`, `ci.test.ts:40-72` | PASS — live: run [38921296678](https://github.com/equalizer2k9/dev-digest/actions/runs/38921296678) on PR #26; page open + Refresh ×2 → one `ci_runs` row and one `agent_runs` row (`source=ci`) with the same id, status failed, 1 finding, $0.00049714 (`export-to-ci/10-ci-runs.png`) |
| AC-10 | T-S5, T-S7 | `artifact.test.ts` › bad archive / invalid / pr / agent mismatch; `service.test.ts` › each skipped with one `{runUrl, reason}` warn, next run still recorded; `too_large` skipped; `recordCiRun` throwing for one run skips only that run, refresh `error` null; `artifact.test.ts` › negative / over-max counts, cost, duration and `pr_number` rejected, maxima accepted; `octokit-actions.test.ts` › 1 MiB + 1 byte → `too_large`, no download | 5f2a27a, fix(ci) | `octokit.ts:444-468`, `artifact.ts:15-59`, `service.ts:206-225`, `artifact.test.ts:38-78`, `service.test.ts:281-314` | PASS |
| AC-11 | T-S2, T-S7, T-S8, T-C4 | `service.test.ts` › list error → runs + error, nothing deleted, other installations continue; `routes.test.ts` › 200 with error; `CiRunsView.test.tsx` › notice above existing rows | 5f2a27a, 9438a7d | server: `service.ts:170-185`, `octokit.ts:437-441`, `routes.ts:69-72`, `service.test.ts:316-342`, `routes.test.ts:102-108` · client: `CiRunsView.tsx:27,48,63`, `ci.json:37`, `CiRunsView.test.tsx:76-90` | PASS |
| AC-12 | T-S1, T-S5, T-S7, T-S8, T-C3, T-C6 | `ci-contracts.test.ts` › `CiRunRow` shape, copies identical; `artifact.test.ts` › `toCiRunRow` + `newestFirst`; `service.test.ts` › agent filter forwarded, foreign agent 404; `routes.test.ts` › `agent_id` query; `CiRunsTable.test.tsx` › all columns, link new tab, agent "—"; `CiTab.test.tsx` › runs for this agent; manual: workspace scoping and SQL order on the live stack | 5f2a27a, 9438a7d | server: `repository.ts:229-256`, `artifact.ts:88-112`, `service.ts:158-161`, `routes.ts:27,60-67`, `contracts/ci.ts:42-59`, `artifact.test.ts:103-146`, `service.test.ts:363-378`, `routes.test.ts:87-93`, `ci-contracts.test.ts:45-82` · client: `hooks/ci.ts:26-31`, `CiRunsTable.tsx:19-68`, `CiTab.tsx:19,67`, `CiRunsTable.test.tsx:35-80`, `CiTab.test.tsx:63-84` | PASS — live: `GET /ci/runs` → 1 row; `?agent_id=<Security>` → 1; `?agent_id=<General>` → 0; the agent CI tab shows the installation and the run (`export-to-ci/11-agent-ci-tab.png`). Deleting the agent was not exercised |
| AC-13 | T-S10 | `agent-runner/src/run.test.ts` › PR title reaches the model only inside the untrusted PR block; task line is `Review PR #<n>` | 5f2a27a | `agent-runner/src/run.ts:136-139`, `run.test.ts:234-261,384` | PASS |

Counts: **9 PASS · 4 PARTIAL · 0 MISSING**.

## 3. Open rows

- **AC-6, AC-7, AC-9, AC-12 — closed 2026-10-16** by the live run on the fork (§7).
- **NFR-2 — closed by `fix(ci): same-repo runs only, bounded artifact, ruleset hint`.** `exportWizard.requiredCheckHint` now says to create a ruleset on `main` that requires the `DevDigest Review` status check, and the generated job is named `DevDigest Review` (`workflow.ts`, asserted in `workflow.test.ts`), so the hint, the install PR body and the actual check name agree.

## 3a. Follow-ups after verification (`fix(ci): same-repo runs only, bounded artifact, ruleset hint`)

- AC-9: ingest takes only runs whose head repository is the installation's repository, before any download; fork PRs are dropped at ingest too (D15). Same-repo forgery stays residual (spec R-5).
- AC-10: artifact numbers bounded in `CiResultArtifact` (both shared copies); an artifact over 1 MiB by its metadata is skipped before the download; a run whose recording fails is skipped alone, so one bad artifact no longer fails every Refresh.
- NFR-2: see §3.
- Not done (minor, left as is): `CiRunsTable/helpers.ts` constants → `constants.ts`; `CiRunDbRow` type location in `ci/repository.ts`; `GitHubWorkflowPermissionError` not extending `AppError`; `pr_url` `href` without `isHttpsUrl`; `GET /ci/runs?agent_id=<foreign>` → empty list instead of 404; second `ci_repo_taken` 409 race after commit; any 403 on a write step reported as the workflow-permission error.

## 4. Reviews

### Architecture review

- Rounds: 1 review, 1 fix round, 1 re-review of the fix.
- Fixed in `f5884e1` (all five CLOSED on re-review):
  - CRITICAL: `Showcase.tsx` imported a route-private `_components/ExportWizard`. ExportWizard was promoted to `client/src/components/ci/ExportWizard/`.
  - WARNING: deep `../` imports in `CiTab.tsx` and `ExportWizard.tsx`. They now use `@/`.
  - WARNING: `ci/service.ts` imported adapter code (`adapters/github/errors.js`). The error and its guard moved to `platform/errors.ts`, and the adapter file only re-exports them.
  - WARNING: `runner-build.ts` hard-coded `../../../../agent-runner/dist/`. The path now comes from config `ciRunnerDir` (env `CI_RUNNER_DIR`).
  - WARNING: the runner-missing case was detected by a bare `status === 409` while `ERR_RUNNER_MISSING` sat unused. It now compares `ApiError.code`.
- CRITICAL/major still open: none.
- minor/nit (not sent to the implementer):
  - SUGGESTION `client/src/components/ci/CiRunsTable/helpers.ts:3,18-35`: `DASH`, `STATUS_KEYS` and `STATUS_COLORS` are constants but live in `helpers.ts`. They belong in `constants.ts`.
  - SUGGESTION `server/src/modules/ci/repository.ts:4`: the repository imports the type `CiRunDbRow` from `./artifact.js`. Define it in `repository.ts` instead.
  - INFO `server/src/platform/errors.ts:48`: `GitHubWorkflowPermissionError` extends `Error`, not `AppError`. Callers detect it by its `code`. The reviewer rated this acceptable.

### Security review

- Rounds: 1 review, verdict PASS. No fix round was needed.
- CRITICAL/major still open: none.
- minor/nit (not sent to the implementer):
  - SUGGESTION `server/src/modules/ci/service.ts:229` and the shared `CiResultArtifact`: `findings_count`, `cost_usd` and `duration_ms` have no upper bound. A value above the int4 range makes the insert throw. Every refresh of that installation then fails at the same run. Fix: add `.min(0).max(…)` bounds to the contract.
  - SUGGESTION `server/src/adapters/github/octokit.ts:463`: the artifact zip is buffered whole before the 64 KiB entry cap applies. Fix: check the artifact's `size_in_bytes` before downloading it.
  - INFO `client/src/components/ci/ExportWizard/ExportWizard.tsx:159`: `pr_url` becomes an `href` without the `isHttpsUrl` check. The value is GitHub's own `html_url`, so this is not exploitable today.
- An automated plugin review of the committed change (security-guidance; not one of this command's reviewers) raised two MEDIUM points. They are shown here for the user to decide on:
  - The same unbounded artifact download as above.
  - **Forged CI result ingestion.** On `pull_request`, GitHub runs the workflow file from the PR itself. A PR author, including a fork author, can therefore replace the workflow and upload a forged `devdigest-result` artifact. If that artifact matches the PR number and the public agent name, ingest records it, so the studio shows the CI run's findings count, cost and status as the forger chose. The GitHub check and the repository secret are not affected: fork runs get no secrets. Possible fix: also require that the run's head repository equals the installation's repository. This does not stop same-repo collaborators, who fall under residual risk R-3.
- Side notes from the verifiers:
  - `GET /ci/runs?agent_id=<foreign>` returns an empty list instead of 404 (NFR-6).
  - A second `ci_repo_taken` 409 can fire after the commit and PR in a race.
  - Any 403 on a write step is reported as the workflow-permission error.

## 5. Checks

Run by the orchestrator:

| command | where | result |
|---|---|---|
| `pnpm typecheck` | `client/` | pass (after group commit and after the fix round) |
| `pnpm test` | `client/` | 73 files / 614 tests pass (group); 80 files / 659 tests pass (after the fix round; includes Part A's new client tests) |
| `pnpm typecheck` | `server/` | pass (after group commit and after the fix round) |
| `pnpm exec vitest run --exclude '**/*.it.test.ts'` | `server/` | 67 files / 838 tests pass (both times) |
| `pnpm --dir agent-runner typecheck` | root | pass |
| `pnpm --dir agent-runner test` | root | 24 tests pass |
| `pnpm --dir agent-runner build` | root | pass; `dist/` = `index.js`, `300.index.js`, `package.json` |

On `feat/export-to-ci` after the split and the follow-ups (2026-10-16), without Part A: server typecheck + `pnpm test` 78 files / 951 tests (17 `*.it.test.ts` on Docker included), client typecheck + 73 files / 614 tests + build, agent-runner 24 tests + build — all pass.

Not run at verification time (since run, see above):
- The server `*.it.test.ts` integration tests.
- The `needs runtime check` items for AC-6, AC-7, AC-9 and AC-12.

The DevDigest Postgres container was not running. The install checks would also create a real branch and PR on `equalizer2k9/dev-digest`, so they are left to the user.

## 6. Deviations

**Server group** (T-S1–T-S10):
- T-S1 added the two `GitHubClient` methods without stubs. Server typecheck was red until T-S2, so T-S1 to T-S10 were committed together in `5f2a27a`.
- `pnpm add yaml@^2.6.1` wrote `"yaml": "^2.9.0"` (resolved 2.9.0, same major).
- The manifest is validated in `preview` as well as in install, because both use one `bundle()` path. An invalid manifest therefore gives 422 at preview too.
- `CiRefreshResult.skipped` counts only skipped-with-warn runs. Runs that were already ingested are not counted.
- The refresh `error` is "GitHub error for <repo>: <msg>", cut to 300 characters and joined with "; ".
- `ARTIFACT_MAX_BYTES` is 64 KiB. The plan gave no value.
- `uniqueSlugs(names, fallback = 'skill')`.
- `CiRepository` returns raw rows, and the service maps them to the contract.
- The repo-taken check (409 `ci_repo_taken`) runs on install only.
- Review fix: the runner location now comes from config `ciRunnerDir` / `CI_RUNNER_DIR`, and the workflow-permission error lives in `platform/errors.ts`.

**Client group** (T-C1–T-C6):
- `AgentEditor.test.tsx` "offers exactly four tabs" became "five tabs" and now asserts the CI tab.
- The nav item is in a new `CI` group. The existing groups are pinned by `nav.test.ts`, so a new test was added for the item.
- ExportWizard renders inline in the CI tab, not in a modal.
- ExportWizard takes an optional `initial` prop for the gallery. The gallery also uses its own `QueryClient` seeded with `["repos"]`.
- Extra message keys: `runs.loadError` and `exportWizard.close`. `ci.json` was re-serialised (trailing commas only).
- `CiRunsTable` links only `https://` run URLs and shows an unknown status as raw text.
- The preview is requested with the default triggers when leaving Target. Changing triggers on Configure does not refresh the Preview text. Install still regenerates the workflow with the chosen options, unless the user edited it.
- Review fix: ExportWizard moved to `client/src/components/ci/ExportWizard/`.

## 7. Live check (2026-10-16, `feat/export-to-ci` merged with `feat/homework-7`)

Security Reviewer (`openrouter/deepseek/deepseek-v4-flash`, no linked skills), target
`equalizer2k9/dev-digest`, triggers opened + synchronize, GitHub review, Fail CI on critical.
Screenshots in [`export-to-ci/`](export-to-ci/) (00–06 wizard, 07–08 GitHub, 09–11 studio).

Install PR [#25](https://github.com/equalizer2k9/dev-digest/pull/25), checked by hand:
- `permissions: contents: read, pull-requests: write`; `on: pull_request: types: [opened, synchronize]`; no `pull_request_target`.
- The key only as `${{ secrets.OPENROUTER_API_KEY }}`; checkout `ref: ${{ github.event.pull_request.base.sha }}` with `persist-credentials: false`.
- `actions/checkout`, `setup-node`, `upload-artifact` pinned by 40-hex SHA; job `name: DevDigest Review`; fork PRs get a notice and skip.
- `.devdigest/runner/` = `index.js`, `300.index.js`, `package.json`, blob SHAs equal to `agent-runner/dist`; manifest `skills: []` (the agent has no enabled skills).
- The PR's own run (38920968753): green, notice "DevDigest runner not found on the base branch", review steps skipped. Merged into `main`.

Ruleset `25248737` on the default branch requires the `DevDigest Review` check.

Test PR [#26](https://github.com/equalizer2k9/dev-digest/pull/26) (`server/src/modules/repos/search-routes.ts`, `sql.raw` with the `name` query parameter):
- run [38921296678](https://github.com/equalizer2k9/dev-digest/actions/runs/38921296678): `findings=1 blockers=1 gateTriggered=true posted=github_review`, exit 1 → check red;
- the bot review is CHANGES_REQUESTED with an inline comment on `search-routes.ts:16`; merge state BLOCKED;
- `sk-or-` occurs 0 times in the job log and 0 times in the artifact;
- artifact: 1 critical, $0.00049714, 14.2 s, `pr_number: 26`, agent "Security Reviewer".

Studio: CI Runs on open + Refresh ×2 → one row (repo, #26, Security Reviewer, Failed, 1, cost, 14s, link to the run).

Bug found and fixed (client, one round, with a test): the CI runs table showed this run's $0.00049714 as "$0.000". `formatCost` now keeps 4 decimals below $0.001 (`CiRunsTable.test.tsx` › formats cost without inventing $0.00). Before/after: `09-ci-runs-before-fix.png` → `10-ci-runs.png`.

Gate after merging `feat/homework-7`: server 85 files / 1018 tests (18 `*.it.test.ts`), client 82 / 668 + build, agent-runner 24 tests + build.

