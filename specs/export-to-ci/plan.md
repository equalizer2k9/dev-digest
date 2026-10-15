# Plan: Export to CI
Spec: `specs/export-to-ci/spec.md` (SPEC-05)

## Goal

Add a server module `ci` that does four things:
- builds an agent's CI bundle: manifest, skills, every file of the runner build, and a hardened workflow;
- installs the bundle through a pull request from `devdigest/ci`;
- ingests GitHub Actions results on demand, pulling them from GitHub;
- serves CI installations and CI runs scoped to the workspace.

The studio gets four pieces: a CI tab on the agent (installations, "Fail CI on", the agent's CI runs, "Add to CI"), a four-step export wizard, a `/ci-runs` page with Refresh, and a sidebar item. No schema change, no migration, no new dependency.

## Decisions

| # | Decision | Evidence / reason |
|---|---|---|
| D-1 | **How a CI run gets its agent, workspace and duration without a schema change: the two rows share one id.** Ingest inserts the `agent_runs` row (`source='ci'`) and the `ci_runs` row in one transaction with the same uuid: `ci_runs.id := agent_runs.id`. Both PKs are `uuid … defaultRandom()`, so an explicit value is legal (`runs.ts:9`, `ci.ts:15`).<br>• **Workspace** = `agent_runs.workspace_id`, through an inner join on the id.<br>• **Agent** = `agent_runs.agent_id` → `agents.name` (left join). It is null once the agent is deleted (`on delete set null`, `runs.ts:13`), and the client then shows "—" (EC-11).<br>• **Duration** = `agent_runs.duration_ms`, written from the artifact's `duration_ms` (A-12), served as `duration_s`.<br>• **Repository** = `ci_installations.repo` (left join). When the installation is gone (`on delete set null`, `ci.ts:16-18`), the repo is parsed from `github_url` (`https://github.com/<owner>/<name>/actions/runs/<id>`).<br>• **Run time** = workflow completion time, written into both `ran_at` columns. | `ci_runs` has no workspace, agent or duration column (`server/src/db/schema/ci.ts:14-26`). `agent_runs` has `workspace_id`, `agent_id`, `duration_ms`, `cost_usd`, `findings_count`, `source` (`runs.ts:8-33`). A scope through `ci_installations` alone would lose the runs of a deleted agent (EC-11). No column is added, so NG7 and NFR-8 hold. |
| D-2 | **Dedupe without a unique index.** Each run is recorded in one transaction: `pg_advisory_xact_lock(hashtext(workspaceId \|\| ':' \|\| runUrl))`, then an existence check on `ci_runs.github_url` joined to `agent_runs.workspace_id`. Only if nothing exists are both rows inserted. A run that already exists counts as "already ingested" and is not an error (A-11). Before any artifact is downloaded, one batch query drops the run URLs that are already ingested. | `ci_runs.github_url` has no unique index (`ci.ts:24`), so `onConflictDoNothing` is impossible without a migration. Precedent for a locking transaction: `server/src/modules/eval/repository/case.repo.ts:47-52`. |
| D-3 | **Manifest text is JSON**: `JSON.stringify(manifest, null, 2) + "\n"`, saved as `.devdigest/agents/<slug>.yaml`. JSON is valid YAML 1.2, so the runner's `yaml.parse` (`agent-runner/src/manifest.ts:3,62`) reads it unchanged. The server validates with `AgentManifest.safeParse(JSON.parse(text))`, the same Zod contract the runner uses (`server/src/vendor/shared/contracts/eval-ci.ts:262-279`). | The server has no YAML library (`server/package.json:17-42`). Adding one would change `server/package.json` and the lock file, which are outside Part B's file ownership. D13 requires the same Zod schema, not the same parser. |
| D-4 | **Skills in the bundle = every skill linked to the agent, in link order** (`container.agentsRepo.linkedSkills`, `agents/repository.ts:192-200`). Disabled skills are included, because AC-1 says "per skill linked". | AC-1 wording. A local review drops disabled skills (`reviews/run-executor.ts:461-462`); recorded under Risks. |
| D-5 | **New contracts live in a new file** `contracts/ci.ts`, byte-identical in both copies. Each barrel `index.ts` gets one appended line. `eval-ci.ts` is not edited. | `server/test/eval-contracts.test.ts:169-178,238-248` pins the set of files that differ between the copies and the outside-region diff of `eval-ci.ts`. A new identical file plus an identical line keeps both pins. `adapters.ts` is identical today (it is not in the pinned list), so it must stay byte-identical. |
| D-6 | **Runner build directory.** The default is `fileURLToPath(new URL('../../../../agent-runner/dist/', import.meta.url))` from `server/src/modules/ci/runner-build.ts`. It is overridable through the `CiService` constructor deps; tests use a temp dir. All regular files are read recursively, with paths relative to `dist/`, as UTF-8. | D13/D16; `agent-runner/package.json:9` (`ncc build … -o dist`); today's dist holds `index.js`, `300.index.js`, `package.json`. |
| D-7 | **Install sequence:**<br>1. Agent (404).<br>2. Repo by `repo_id` in the workspace (404).<br>3. A different agent already installed into this repo → 409 `ci_repo_taken` (EC-12).<br>4. Bundle; a missing runner build → 409 `ci_runner_missing`.<br>5. Manifest validation → 422 `ci_manifest_invalid`.<br>6. `container.github()` (a missing token → the existing `ConfigError`, EC-16).<br>7. `commitFiles({branch:'devdigest/ci', base:'main', message:'Add DevDigest CI review', files})`.<br>8. `findOpenPr('devdigest/ci')`: when one exists, reuse its URL; otherwise `openPullRequest({title:'Add DevDigest CI review', head:'devdigest/ci', base:'main', body})`.<br>9. Upsert the installation (update `installed_at`, A-12).<br>Every rejection happens before step 7, so nothing is written to GitHub. The installation is written only after step 8, so AC-8 records nothing. | `GitHubClient` `vendor/shared/adapters.ts:155-163`; `ConfigError` at `platform/container.ts:176`. |
| D-8 | **Workflow-permission error.** In `OctokitGitHubClient.commitFiles`, an error from `createTree` / `createCommit` / `createRef` / `updateRef` with status 403, or with a message matching `/workflow/i`, is rethrown as `GitHubWorkflowPermissionError` (`code: 'WORKFLOW_PERMISSION'`). This follows `adapters/file-too-large.ts:5-14`. The service maps it to `AppError('ci_workflow_permission', <message naming the "workflow" scope (classic) and Workflows: write (fine-grained)>, 403)`. | AC-8, D19. `withRetry` does not retry 403 (`platform/resilience.ts:40`). |
| D-9 | **Ingest errors.** A 404 from listing `devdigest-review.yml` runs is "no runs" (EC-17): before the install PR is merged, the workflow does not exist on the default branch. Any other listing or download error stops that installation and is collected. The other installations still run. The response is `200 { runs, error }` (AC-11). A missing token on a refresh with at least one installation throws the existing `ConfigError` (EC-16). With zero installations, `github()` is never called. | AC-11, EC-16, EC-17. |
| D-10 | **Optional edited workflow.** Install sends `workflow` only when the user edited it in Preview. Otherwise the server regenerates the workflow from `triggers` and `post_as`. Every other file is always regenerated on the server (A-5). | Order Target → Preview → Configure (D12): Configure may change triggers after Preview. With an edited workflow, Configure shows a note that the edit wins. |

### API (module `ci`; every route workspace-scoped; a foreign id → 404 `not_found`)

| Route | Body / query | 200 | Errors |
|---|---|---|---|
| `GET /agents/:id/ci/installations` | — | `CiInstallation[]` | 404 |
| `POST /agents/:id/ci/preview` | `CiBundleInput` | `CiPreview` | 404 · 409 `ci_runner_missing` · 422 `ci_manifest_invalid` |
| `POST /agents/:id/ci/install` | `CiInstallInput` | `CiInstallResult` | 404 · 409 `ci_runner_missing` / `ci_repo_taken` · 422 · 403 `ci_workflow_permission` · 500 `config_error` |
| `GET /ci/runs` | `?agent_id=<uuid>` optional | `CiRunsResponse` | — |
| `POST /ci/runs/refresh` | — | `CiRefreshResult` | 500 `config_error` (EC-16) |

### Contract shapes (`contracts/ci.ts`, identical in both copies; reuses `CiFile`, `CiInstallation` from `eval-ci.ts`)

```ts
CiTrigger       = 'opened' | 'synchronize' | 'reopened'
CiPostAs        = 'github_review' | 'pr_comment' | 'none'
CiBundleInput   = { repo_id: uuid, triggers: CiTrigger[] (min 1, unique), post_as: CiPostAs }
CiInstallInput  = CiBundleInput & { workflow?: string (min 1) }
CiPreview       = { files: CiFile[] }
CiInstallResult = { installation: CiInstallation, pr_url: string, reused_pr: boolean, paths: string[] }
CiRunRow        = { id, repo: string|null, pr_number: int|null, agent_id: string|null, agent: string|null,
                    status: string|null, findings_count: int|null, cost_usd: number|null,
                    duration_s: number|null, ran_at: string|null, github_url: string|null }
CiRunsResponse  = { runs: CiRunRow[] }                       // newest first
CiRefreshResult = { runs: CiRunRow[], error: string|null, ingested: int, skipped: int }
```

`adapters.ts` additions (both copies, byte-identical):

```ts
WorkflowRunInfo  = { id: number; html_url: string; conclusion: string|null; pr_number: number|null; head_repo: string|null; completed_at: string }
ArtifactDownload = { kind: 'ok'; zip: Uint8Array } | { kind: 'missing' } | { kind: 'expired' }
GitHubClient.listWorkflowRuns(repo, workflowFile: string, limit: number): Promise<WorkflowRunInfo[]>   // completed only
GitHubClient.downloadArtifact(repo, runId: number, name: string): Promise<ArtifactDownload>
```

## Files

| path | new/modify | what changes | AC |
|---|---|---|---|
| `server/src/vendor/shared/contracts/ci.ts` | new | shapes above | AC-1–AC-12 |
| `client/src/vendor/shared/contracts/ci.ts` | new | byte-identical copy | AC-12 |
| `server/src/vendor/shared/index.ts`, `client/src/vendor/shared/index.ts` | modify | append `export * from './contracts/ci.js';` (one line, identical) | — |
| `server/src/vendor/shared/adapters.ts`, `client/src/vendor/shared/adapters.ts` | modify | `WorkflowRunInfo`, `ArtifactDownload`, two `GitHubClient` methods (identical) | AC-9–AC-11 |
| `server/test/ci-contracts.test.ts` | new | parse cases + byte-identity of `ci.ts`, `adapters.ts`, `index.ts` | AC-12 |
| `server/src/adapters/github/errors.ts` | new | `GitHubWorkflowPermissionError`, `isWorkflowPermission` | AC-8 |
| `server/src/adapters/github/octokit.ts` | modify | `listWorkflowRuns`, `downloadArtifact`, permission mapping in `commitFiles` (`:265-331`) | AC-8–AC-11 |
| `server/src/adapters/mocks.ts` | modify | `MockGitHubClient` options `workflowRuns`, `artifacts`, `listRunsError`, `downloadError`, `commitError`; records `downloads` | AC-6–AC-11 |
| `server/test/octokit-actions.test.ts` | new | Octokit stubbed as in `test/octokit-file-content.test.ts:4-20` | AC-8–AC-11 |
| `server/src/modules/ci/constants.ts` | new | branch, PR title, workflow name and file, artifact name, retention, timeout, Node version, pinned action SHAs, runs limit 30, error codes, artifact size cap | AC-4–AC-11 |
| `server/src/modules/ci/workflow.ts` + `workflow.test.ts` | new | pure `buildWorkflow(triggers, postAs): string` | AC-4, AC-5 |
| `server/src/modules/ci/manifest.ts` | new | `ciSlug`, `uniqueSlugs`, `buildManifest`, `manifestText`, `validateManifestText` | AC-1, AC-2 |
| `server/src/modules/ci/bundle.ts` + `bundle.test.ts` | new | pure `buildBundle(...)`, `prBody(paths)` | AC-1, AC-2, AC-6 |
| `server/src/modules/ci/runner-build.ts` + `runner-build.test.ts` | new | `readRunnerBuild(dir)` | AC-1, AC-3 |
| `server/src/modules/ci/artifact.ts` + `artifact.test.ts` | new | `readResultArtifact`, `checkArtifact`, `ciStatusFor`, `repoFromRunUrl`, `toCiRunRow`, `newestFirst` | AC-9, AC-10, AC-12 |
| `server/src/modules/ci/repository.ts` | new | installations, run listing, ingested-URL lookup, `recordCiRun` (D-1, D-2) | AC-6, AC-7, AC-9, AC-12 |
| `server/src/modules/ci/service.ts` + `service.test.ts` | new | `CiService`: `installations`, `preview`, `install`, `listRuns`, `refresh` | AC-2, AC-3, AC-6–AC-12 |
| `server/src/modules/ci/routes.ts` + `routes.test.ts` | new | the five routes; no-DB route test | AC-3, AC-8, AC-11, AC-12 |
| `server/src/modules/index.ts` | modify | one import + one entry `ci` | — |
| `client/src/lib/hooks/ci.ts` + `ci.test.ts` | new | `useCiInstallations`, `useCiRuns`, `useRefreshCiRuns`, `usePreviewCi`, `useInstallCi` | AC-6, AC-9, AC-12 |
| `client/src/lib/hooks/index.ts` | modify | `export * from "./ci";` | — |
| `client/messages/en/ci.json` | modify | new keys (existing keys stay) | NFR-9 |
| `client/src/components/ci/CiRunsTable/{CiRunsTable.tsx,index.ts,helpers.ts,styles.ts,CiRunsTable.test.tsx}` | new | table shared by `/ci-runs` and the CI tab | AC-12 |
| `client/src/components/showcase/Showcase.tsx`, `constants.ts` | modify | `CiRunsTable` group with a fixture | — |
| `client/src/app/ci-runs/page.tsx` | new | thin page | AC-9, AC-11 |
| `client/src/app/ci-runs/_components/CiRunsView/{CiRunsView.tsx,index.ts,styles.ts,CiRunsView.test.tsx}` | new | ingest on open + Refresh, busy, notice, empty/loading | AC-9, AC-11 |
| `client/src/vendor/ui/nav.ts` | modify | one item `{ key: "ci-runs", … href: "/ci-runs" }` (`activeKeyFor` already maps it, `components/app-shell/helpers.ts:38`) | NFR-4 |
| `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` | modify | add `{ key: "ci", … }` to `TABS` (`:11-16`) | NFR-3 |
| `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` | modify | `tab === "ci"` branch (`:27-35`) | NFR-3 |
| `.../AgentEditor/_components/CiTab/{CiTab.tsx,index.ts,constants.ts,styles.ts,CiTab.test.tsx}` | new | installations, Fail CI on, runs, Add to CI | AC-12, NFR-3 |
| `.../CiTab/_components/ExportWizard/{ExportWizard.tsx,index.ts,constants.ts,helpers.ts,styles.ts,ExportWizard.test.tsx,helpers.test.ts}` | new | four-step wizard on `ExportWizardSteps` (`client/src/vendor/ui/ExportWizardSteps.tsx:6`) | AC-1, AC-3, AC-6, AC-8, NFR-1, NFR-2 |

Not touched: `server/src/db/schema/**`, `server/src/db/migrations/**`, every lock file, every `package.json`, `contracts/eval-ci.ts` (both copies), `agent-runner/**` (only a build fix, if the gate needs one), `reviewer-core/**`.

## Hand-off between groups

The client group waits only for **T-S1** (contracts in both copies). After that the groups run in parallel. No client test needs the API, because every hook test mocks `../api` as `client/src/lib/hooks/reviews.test.ts:7-18` does.

## Tasks — group SERVER

### T-S1 — Contracts and the GitHubClient port (both copies)
AC: AC-9, AC-10, AC-11, AC-12
Files: `server/src/vendor/shared/contracts/ci.ts`, `client/src/vendor/shared/contracts/ci.ts`, both `index.ts`, both `adapters.ts`, `server/test/ci-contracts.test.ts`
Test: `server/test/ci-contracts.test.ts` —
- `CiBundleInput` rejects empty `triggers`, an unknown trigger and a non-uuid `repo_id`.
- `CiInstallInput` accepts a missing `workflow` and rejects `""`.
- `CiRunRow` accepts `agent: null, repo: null, duration_s: null`.
- `CiRefreshResult` requires `error` (nullable).
- `contracts/ci.ts`, `adapters.ts` and `index.ts` are byte-identical in the server and client copies.
- The existing `test/eval-contracts.test.ts` › "the set of differing files equals the pinned list" stays green.
Verify: `pnpm typecheck && pnpm exec vitest run test/ci-contracts.test.ts test/eval-contracts.test.ts` in `server/`; `pnpm typecheck` in `client/` (implementing the new port fails until T-S2, so T-S1 and T-S2 are committed together if typecheck is the gate)
Skills: zod, typescript-expert
Depends on: —

### T-S2 — Octokit and mock: workflow runs, artifact download, permission error
AC: AC-8, AC-9, AC-10, AC-11
Files: `server/src/adapters/github/errors.ts`, `server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts`, `server/test/octokit-actions.test.ts`
Shape:
- `listWorkflowRuns` → `octokit.rest.actions.listWorkflowRuns({ workflow_id, status: 'completed', per_page: limit })`, mapped to `WorkflowRunInfo` (`pr_number` = `pull_requests[0]?.number ?? null`, `head_repo` = `head_repository?.full_name ?? null`, `completed_at` = `updated_at`). A 404 → `[]` (D-9).
- `downloadArtifact` → `listWorkflowRunArtifacts({ run_id, name })`; none → `missing`; `expired` → `expired`; else `downloadArtifact({ artifact_id, archive_format: 'zip' })` → `Uint8Array`.
- Both use `withRetry(withTimeout(…))` like `octokit.ts:333-350`.
- `commitFiles` applies the D-8 mapping.
Test: `server/test/octokit-actions.test.ts` —
- A listed run is mapped (PR number, conclusion, URL); an empty `pull_requests` → `pr_number: null`.
- A 404 on listing → `[]`; a 500 → rejects.
- No artifact → `missing`; `expired: true` → `expired`; otherwise the bytes are returned.
- A 403 from `createRef` → `isWorkflowPermission(err)`.
- A 422 whose message mentions `workflow` → `isWorkflowPermission(err)`.
- A 404 on the first `getRef` of the branch still falls back to the base (`octokit.ts:279-286` unchanged).
Verify: `pnpm typecheck && pnpm exec vitest run test/octokit-actions.test.ts test/adapters.test.ts` in `server/`
Skills: onion-architecture, typescript-expert, security
Depends on: T-S1

### T-S3 — Workflow generator (pure)
AC: AC-4, AC-5
Files: `server/src/modules/ci/constants.ts`, `server/src/modules/ci/workflow.ts`, `server/src/modules/ci/workflow.test.ts`
Signature: `buildWorkflow(triggers: CiTrigger[], postAs: CiPostAs): string`
Shape:
- `name: DevDigest Review`.
- `on.pull_request.types` = the given triggers.
- `permissions: { contents: read, pull-requests: write }`.
- `concurrency: { group: devdigest-review-${{ github.event.pull_request.number }}, cancel-in-progress: true }`.
- One job, `runs-on: ubuntu-latest`, `timeout-minutes: 10`. Steps:
  1. fork notice: `if: head.repo.full_name != github.repository`, `run: echo "::notice::…"`;
  2. checkout (same-repo `if`) at `actions/checkout@<sha>` with `ref: ${{ github.event.pull_request.base.sha }}` and `persist-credentials: false`;
  3. runner probe: `id: runner`, `if [ -f .devdigest/runner/index.js ]` → output `present=true`, else a notice + `present=false`, exit 0;
  4. `actions/setup-node@<sha>` with `node-version: 22`, `if: steps.runner.outputs.present == 'true'`;
  5. run `node .devdigest/runner/index.js` with env `OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}`, `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, `PR_NUMBER: ${{ github.event.pull_request.number }}`, `DEVDIGEST_POST_AS: <postAs>`;
  6. `actions/upload-artifact@<sha>` with `if: ${{ always() && steps.runner.outputs.present == 'true' }}`, `name: devdigest-result`, `path: devdigest-result.json`, `retention-days: 7`, `if-no-files-found: ignore`.
- No `${{ … }}` inside any `run:` command; values reach commands only through `env:` and step outputs.
- SHAs come from `constants.ts`. Candidates, **to be confirmed with `git ls-remote` before the live check**: checkout v4.2.2 `11bd71901bbe5b1630ceea73d27597364c9af683`, setup-node v4.4.0 `49933ea5288caeca8642d1e84afbd3f7d6820020`, upload-artifact v4.6.2 `ea165f8d65b6e75b540449e92b4886f43607fa02`.
- The text is emitted by string templates (no YAML library).
Test: `workflow.test.ts`, a line/regex-level assertion per property —
- AC-4: name; `types: [opened, synchronize]` for those triggers and `[opened, synchronize, reopened]` when reopened is given; the permissions block has exactly two entries; concurrency group contains `pull_request.number` and `cancel-in-progress: true`; `timeout-minutes: 10`; `node-version: 22`; the run line; the four env keys with `DEVDIGEST_POST_AS: pr_comment` for that mode; artifact name, path, `retention-days: 7`, `always()` in the upload `if`.
- AC-5: `ref: ${{ github.event.pull_request.base.sha }}` and `persist-credentials: false`; no `pull_request_target`; every `uses:` matches `@[0-9a-f]{40}`; only `actions/` owners (no marketplace action); a fork step gated on `head.repo.full_name != github.repository` with `::notice::`, and the checkout/runner steps gated on equality or on the probe output; the probe emits a notice and no `exit 1`; the set of `secrets.X` names is exactly {`OPENROUTER_API_KEY`, `GITHUB_TOKEN`}; no `run:` line or block contains `${{`; for each pull-request text expression (`github.event.pull_request.title|body|head.ref|head.label`, `github.head_ref`, `github.event.head_commit.message`, `github.actor`) the workflow contains none.
- S-1: the only appearance of `OPENROUTER_API_KEY` is the `secrets.` reference.
Verify: `pnpm exec vitest run src/modules/ci/workflow.test.ts` in `server/`
Skills: security, typescript-expert
Depends on: —

### T-S4 — Slugs, manifest, bundle, runner build (pure + fs)
AC: AC-1, AC-2, AC-3
Files: `server/src/modules/ci/manifest.ts`, `bundle.ts`, `bundle.test.ts`, `runner-build.ts`, `runner-build.test.ts`
Signatures:
- `ciSlug(name, fallback: 'agent'|'skill'): string`, per A-1, with no NFKD (do not import `skills/helpers.ts:95` — onion rule 10, and the rule differs).
- `uniqueSlugs(names): string[]` (`-2`, `-3`, …).
- `buildManifest(agent, skillSlugs): AgentManifestInput` (`name`, `provider`, `model`, `system_prompt`, `skills`, `strategy`, `ci_fail_on`).
- `manifestText(m): string` (D-3).
- `validateManifestText(text): AgentManifest | null`.
- `readRunnerBuild(dir): Promise<{ name: string; contents: string }[] | null>` (null when the directory is missing or has no `index.js`).
- `buildBundle({ agent, skills, runner, workflow }): CiFile[]` (order: manifest, skills, runner files, workflow; only the workflow has `editable: true`).
- `prBody(paths): string` (lists every path, names `OPENROUTER_API_KEY`, explains the ruleset on `main` requiring the `DevDigest Review` check).
Test: `bundle.test.ts` —
- AC-1: an agent with 2 skills + a 3-file runner → exactly `.devdigest/agents/<slug>.yaml`, two `.devdigest/skills/<slug>.md` holding the skill bodies, `.devdigest/runner/index.js|300.index.js|package.json` with identical contents, and `.github/workflows/devdigest-review.yml`; only the workflow is editable.
- EC-2: no skills → no skills files.
- EC-3: two skills with the same name → `x`, `x-2`.
- EC-4: name `"!!!"` → `agent` / `skill`; slugs match `^[a-z0-9-]+$` (R-2).
- AC-2: `validateManifestText(manifestText(...))` yields name, provider, model, system prompt, skills in link order and `ci_fail_on`; a system prompt with quotes, newlines and `: #` round-trips; a manifest with an empty `model` → null.
- S-2: no file contains the configured GitHub token string passed in the fixture.
- `prBody` contains every path, `OPENROUTER_API_KEY` and `DevDigest Review`.

Test: `runner-build.test.ts` (temp dir via `mkdtempSync`) —
- AC-3: a missing directory → null; a directory without `index.js` → null.
- Three files → three entries with identical contents; a nested file keeps its relative path.
Verify: `pnpm exec vitest run src/modules/ci/bundle.test.ts src/modules/ci/runner-build.test.ts` in `server/`
Skills: zod, typescript-expert, security
Depends on: T-S1, T-S3

### T-S5 — Artifact reading and run mapping (pure)
AC: AC-9, AC-10, AC-12
Files: `server/src/modules/ci/artifact.ts`, `artifact.test.ts`
Signatures:
- `readResultArtifact(zip: Uint8Array): { ok: true; data: CiResultArtifact } | { ok: false; reason: 'bad_archive' | 'invalid_result' }`. It uses fflate: enumerate with `filter` first, inflate only `devdigest-result.json`, cap it at `ARTIFACT_MAX_BYTES` and re-check the decoded length (server INSIGHTS 2026-09-20, `skills/helpers.ts:240,291,296`).
- `checkArtifact(data, run: WorkflowRunInfo, agentName): null | 'no_pull_request' | 'pr_mismatch' | 'agent_mismatch'`.
- `ciStatusFor(conclusion, findings)`: `success` + 0 → `no_findings`; `success` → `succeeded`; anything else → `failed` (A-12).
- `repoFromRunUrl(url): string | null`.
- `toCiRunRow(dbRow): CiRunRow`.
- `newestFirst(rows)`: stable, by `ran_at` descending, nulls last.
Test: `artifact.test.ts` (zips built with `fflate.zipSync`, as in `skills/import.test.ts:2`) —
- AC-9: a valid artifact → ok with the counts.
- AC-10: random bytes → `bad_archive`; a zip without the entry → `bad_archive`; non-JSON or a missing `agent` → `invalid_result`; an oversized entry → `bad_archive`; `pr_number` 7 vs run 8 → `pr_mismatch`; `pr_number: null` → `pr_mismatch`; another agent name → `agent_mismatch`; a run without a PR → `no_pull_request`.
- A-12: the status mapping table, including `cancelled` → `failed`.
- AC-12: `toCiRunRow` gives `duration_s = duration_ms / 1000`; a null installation repo → repo parsed from the URL; a null agent stays null; `newestFirst` order.
Verify: `pnpm exec vitest run src/modules/ci/artifact.test.ts` in `server/`
Skills: zod, security, typescript-expert
Depends on: T-S1

### T-S6 — CI repository
AC: AC-6, AC-7, AC-9, AC-12 (logic proved in T-S7 with a fake repository; SQL proved by the live check)
Files: `server/src/modules/ci/repository.ts`
Methods (all workspace-scoped):
- `repoById(ws, repoId)`: `repos` with `owner`, `name`, `fullName` (`schema/repos.ts:12-14`).
- `installationsForAgent(ws, agentId)`.
- `installationForRepo(ws, fullName)`: joined to `agents` for the workspace.
- `ghaInstallations(ws)`: joined to `agents`; returns agent id, name, provider, model, repo.
- `upsertInstallation(ws, agentId, fullName)`: a transaction with `pg_advisory_xact_lock(hashtext(ws||':'||repo))`. It re-checks EC-12, then updates `installed_at = now()` or inserts `target_type 'gha'`.
- `ingestedUrls(ws, urls)`.
- `prIdFor(ws, fullName, number)`: `pull_requests` join `repos` (`schema/pulls.ts:12-15`).
- `recordCiRun(ws, values): Promise<boolean>`: D-1 + D-2. It inserts `agent_runs` (`source 'ci'`, `status 'done'`, `tokens` null, `durationMs`, `costUsd`, `findingsCount`, `provider`, `model`, `prId`, `ranAt`) and `ci_runs` with the same id (`source 'gha'`, A-13). It returns false when the URL was already present.
- `listRuns(ws, agentId?)`: `ci_runs ⋈ agent_runs` (inner, workspace) ⟕ `ci_installations` ⟕ `agents` on `agent_runs.agent_id`, `orderBy desc(ci_runs.ran_at)`.
Test: covered through T-S7 (fake repository) and the T-S8 route test; manual: the live B check (two refreshes → one row; delete the agent → the row stays with agent "—").
Verify: `pnpm typecheck` in `server/`
Skills: drizzle-orm-patterns, onion-architecture
Depends on: T-S1

### T-S7 — CiService: preview, install, list, refresh
AC: AC-2, AC-3, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12
Files: `server/src/modules/ci/service.ts`, `server/src/modules/ci/service.test.ts`
Signature: `new CiService(container, deps?: { repo?: CiRepository; runnerDir?: string })`. Methods:
- `installations(ws, agentId)`;
- `preview(ws, agentId, input): Promise<CiPreview>`;
- `install(ws, agentId, input): Promise<CiInstallResult>`;
- `listRuns(ws, agentId?)`;
- `refresh(ws, log: { info; warn }): Promise<CiRefreshResult>`.

Agent and skills come from `container.agentsRepo.getById` / `.linkedSkills` (onion rule 10). Preview never calls `container.github()` (A-3).

Refresh, per installation:
1. `listWorkflowRuns(repo, 'devdigest-review.yml', 30)`.
2. Drop the URLs that are already ingested.
3. Per run: `downloadArtifact` → `readResultArtifact` → `checkArtifact`.
4. Skip → `log.warn({ runUrl, reason }, 'ci ingest: run skipped')`.
5. Otherwise `recordCiRun`.

A GitHub error on an installation → collect `error` (a fixed prefix + the GitHub message, plain text, ≤ 300 chars) and continue (D-9). The method ends with `listRuns`.

Test: `service.test.ts` (fake repository object, `MockGitHubClient`, temp runner dir, stub `container.agentsRepo`) —
- AC-3: preview and install with no runner dir → `AppError` 409 whose message contains `pnpm --dir agent-runner build`; `github()` never resolved; `committed` and `openedPrs` empty.
- AC-2: an agent whose model is `""` → 422 `ci_manifest_invalid`; nothing committed.
- AC-6: a first install → one `commitFiles` with `branch 'devdigest/ci'` and `base 'main'`, and its file paths equal the preview's; one `openPullRequest` titled "Add DevDigest CI review", `head 'devdigest/ci'`, `base 'main'`, whose body lists the files and names `OPENROUTER_API_KEY`; the returned `pr_url`; `upsertInstallation` called once; no other write method called.
- AC-7: install twice → `openedPrs.length === 1`, both results carry the same `pr_url`, the second has `reused_pr: true`, two commits, `upsertInstallation` called with the same agent and repo.
- A-5: `workflow` given → the committed workflow equals it byte for byte, and the other files are regenerated.
- AC-8: `commitError: new GitHubWorkflowPermissionError(...)` → 403 `ci_workflow_permission` whose message contains `workflow` and `Workflows: write`; `upsertInstallation` not called.
- EC-12: an installation of another agent for the repo → 409 `ci_repo_taken`, nothing committed.
- EC-16: `container.github` rejecting with `ConfigError` → install rethrows and records nothing.
- AC-9: two completed runs, one valid → `recordCiRun` called once with `source 'ci'`, status mapped, `findingsCount`, `costUsd`, `prNumber`, URL, `durationMs` and agent = the installation's agent; `prId` from `prIdFor`, or null when it is not imported (EC-9); an already-ingested URL → not downloaded and not recorded; `limit === 30` (NFR-5).
- AC-10: missing, expired, bad zip, invalid, `pr_mismatch` and `agent_mismatch` runs → each skipped with exactly one `warn` whose payload keys are `{ runUrl, reason }`; the valid run after them is still recorded.
- S-2: the serialized log calls contain no token value and no artifact body.
- AC-11: `listRunsError` (500) → resolves with the runs from `listRuns` and a non-null `error`; nothing is deleted (the fake repository has no delete method called); a `downloadError` on one installation does not stop the next.
- EC-17: a 404-style empty list → no records, `error: null`.
- Zero installations → `github()` not called.
- AC-12: `listRuns(ws, agentId)` forwards `agentId`, and rows come back through `toCiRunRow` + `newestFirst`.
- NFR-6: a foreign agent, or a `repo_id` not in the workspace → `NotFoundError`.
Verify: `pnpm typecheck && pnpm exec vitest run src/modules/ci/service.test.ts` in `server/`
Skills: onion-architecture, zod, security
Depends on: T-S2, T-S4, T-S5, T-S6

### T-S8 — Routes and registration
AC: AC-3, AC-8, AC-11, AC-12
Files: `server/src/modules/ci/routes.ts`, `server/src/modules/ci/routes.test.ts`, `server/src/modules/index.ts`
Routes as in the API table. Shape follows `server/src/modules/eval/routes.ts:29-83` (`getContext`, `IdParams`, `schema.body`, `schema.querystring` = `{ agent_id: uuid.optional() }`, response schemas). Refresh passes `req.log`.
Test: `routes.test.ts` (no DB): `buildApp({ config, overrides: { auth: new MockAuthProvider() } })` as `test/routes-smoke.test.ts:11-20`, with `vi.mock('./service.js')` stubbing `CiService`.
- AC-3: a service throwing 409 `ci_runner_missing` → 409 envelope with the message.
- AC-8: 403 `ci_workflow_permission` → the 403 envelope.
- 422 on an empty `triggers` and on `agent_id=not-a-uuid`.
- AC-12: `GET /ci/runs?agent_id=<uuid>` → the service is called with (`w1`, uuid), and 200 passes `CiRunsResponse`.
- AC-11: `POST /ci/runs/refresh` → 200 with `error` text.
Verify: `pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` in `server/`
Skills: fastify-best-practices, onion-architecture, zod
Depends on: T-S7

### T-S9 — Server group gate
AC: — (enables every server task)
Verify:
- `pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` in `server/`
- `pnpm --dir agent-runner typecheck && pnpm --dir agent-runner test && pnpm --dir agent-runner build` from the repo root. The runner aliases `@devdigest/shared` to the server copy, so T-S1 reaches it.
- Then `ls agent-runner/dist` shows `index.js`, a chunk and `package.json`.
A runner failure is fixed only in `agent-runner/**` and only as a build fix (NG9).
Depends on: T-S8

## Tasks — group CLIENT (starts after T-S1)

### T-C1 — CI hooks
AC: AC-6, AC-9, AC-12
Files: `client/src/lib/hooks/ci.ts`, `client/src/lib/hooks/ci.test.ts`, `client/src/lib/hooks/index.ts`
Signatures:
- `useCiInstallations(agentId)` → `["ci-installations", agentId]`.
- `useCiRuns(agentId?)` → `["ci-runs", agentId ?? "all"]`, GET `/ci/runs` (+ `?agent_id=`).
- `useRefreshCiRuns()` → POST `/ci/runs/refresh`; on success it writes `runs` into `["ci-runs","all"]` and invalidates `["ci-runs"]`.
- `usePreviewCi(agentId)` → mutation POST `/agents/:id/ci/preview`.
- `useInstallCi(agentId)` → mutation; on success it invalidates `["ci-installations", agentId]`.
Contract types are `import type` only. Pattern: `client/src/lib/hooks/evals.ts`.
Test: `ci.test.ts` (`../api` mocked as `reviews.test.ts:7-18`) —
- `useCiRuns("a1")` GETs `/ci/runs?agent_id=a1`; `useCiRuns()` GETs `/ci/runs`; mounting issues no POST (NFR-5).
- Refresh posts once, and the cache then holds the returned runs without a refetch.
- `useInstallCi` posts the body as given, including `workflow`.
Verify: `pnpm typecheck && pnpm test` in `client/`
Skills: frontend-architecture, react-best-practices, react-testing-library
Depends on: T-S1

### T-C2 — Messages
AC: — (enables T-C3…T-C6; NFR-9)
Files: `client/messages/en/ci.json`
New keys (existing keys untouched):
- `runs.table.repo|agent|duration|when|link`, `runs.loading`, `runs.ingestError`, `runs.agentNone` (= `—`), `runs.openRun`;
- `exportWizard.addToCi`, `exportWizard.onlyGha`, `exportWizard.selectRepo`, `exportWizard.previewError`, `exportWizard.buildHint` (contains `pnpm --dir agent-runner build`), `exportWizard.readOnly`, `exportWizard.secretRef`, `exportWizard.triggers.opened|synchronize|reopened`, `exportWizard.triggerRequired`, `exportWizard.requiredCheckHint`, `exportWizard.editedNote`, `exportWizard.openPr`, `exportWizard.prOpened`, `exportWizard.viewPr`, `exportWizard.installError`;
- `ciTab.tab`, `ciTab.installations`, `ciTab.noInstallations`, `ciTab.failOn`, `ciTab.failOnOptions.never|critical|warning|any`, `ciTab.failOnNote`, `ciTab.runs`, `ciTab.noRuns`.
Test: every component test in T-C3…T-C6 reads its labels from this imported file.
Verify: `pnpm test` in `client/`
Depends on: —

### T-C3 — Shared CiRunsTable
AC: AC-12
Files: `client/src/components/ci/CiRunsTable/*`, `client/src/components/showcase/Showcase.tsx`, `client/src/components/showcase/constants.ts`
Props: `{ runs: CiRunRow[] }` (presentational). `helpers.ts`: `formatDuration`, `formatCost`, `statusKey` (→ `runs.status.*`).
Test: `CiRunsTable.test.tsx` —
- A row shows repo, `#<pr>`, agent, status label, findings, cost, duration, time, and a link with `href = github_url`, `target="_blank"`, `rel` containing `noopener`.
- `agent: null` → `runs.agentNone`.
- A repo or agent name containing `<img src=x onerror=…>` renders as text, and `queryByRole("img")` is null.
- Rows keep the given order.
- The smoke test `client/src/test/smoke.test.tsx` still mounts the gallery (no QueryClient needed).
Verify: `pnpm typecheck && pnpm test` in `client/`
Skills: frontend-architecture, react-best-practices, react-testing-library, security
Depends on: T-C1, T-C2

### T-C4 — /ci-runs page and sidebar item
AC: AC-9, AC-11, AC-12
Files: `client/src/app/ci-runs/page.tsx`, `client/src/app/ci-runs/_components/CiRunsView/*`, `client/src/vendor/ui/nav.ts`
Behaviour:
- On mount, `refresh.mutate()` exactly once (a `useRef` guard, so StrictMode's double mount does not ingest twice).
- The list shows `useCiRuns()` data.
- The Refresh button is disabled with `runs.refreshing` while the mutation is pending.
- A response `error` or a mutation error → a non-blocking notice above the table (plain text), rows kept.
- Explicit loading (`runs.loading`) and empty (`runs.emptyTitle`) states.
- Nav: append one item, using an existing `IconName` (check `src/vendor/ui/icons`).
Test: `CiRunsView.test.tsx` (hooks mocked) —
- The refresh mutation is called once on mount; clicking Refresh calls it again; pending → the button is disabled with the busy label.
- A refresh result with `error: "GitHub down"` → the notice text shown and the existing rows still rendered (AC-11).
- Empty list → the empty copy; loading → the loading copy.
- Assert on copy, never on `role="alert"` (client INSIGHTS 2026-09-22).
Verify: `pnpm typecheck && pnpm test` in `client/`
Skills: frontend-architecture, next-best-practices, react-best-practices, react-testing-library
Depends on: T-C3

### T-C5 — Export wizard
AC: AC-1, AC-3, AC-6, AC-8 (UI side), NFR-1, NFR-2
Files: `.../AgentEditor/_components/CiTab/_components/ExportWizard/*`
Props: `{ agent: Agent; onClose(): void }`. Data from `useRepos()` (`client/src/lib/hooks/core.ts:65`), `usePreviewCi`, `useInstallCi`. Steps through `ExportWizardSteps` with labels from `exportWizard.steps.*`.
`helpers.ts` (pure):
- `canContinue(step, state)`: Target needs a repo; Preview needs files and no error; Configure needs ≥ 1 trigger (A-4).
- `installBody(state)`: adds `workflow` only when it was edited (D-10).
Behaviour:
- **Target**: one GitHub Actions card only + the workspace repos.
- **Preview**: requests the preview with the current triggers/post_as (defaults: opened + synchronize, `github_review`) and lists every file. The workflow is a textarea; every other file is read-only text, runner files collapsed by default. A 409 shows the server message + `buildHint`, and Continue/Install cannot be reached (EC-1).
- **Configure**: trigger checkboxes, publication radios, the `requiredCheckHint`, and `editedNote` when the workflow was edited.
- **Install**: only "Open PR"; on success the PR link (`target="_blank"`); on error the server message as plain text.
Test: `ExportWizard.test.tsx` (hooks mocked) —
- NFR-1: Target shows `targets.gha` and no CircleCI/Jenkins/CLI labels; the repos listed are those from `useRepos`.
- AC-1 / S-1: Preview lists the four fixture paths; only the workflow path has an editable textbox; the rendered workflow contains `${{ secrets.OPENROUTER_API_KEY }}`.
- AC-3 / EC-1: a 409 preview error → the message containing `pnpm --dir agent-runner build` is shown, and no enabled Continue or Install button exists.
- A-4 / NFR-2: Configure defaults (opened and synchronize checked, reopened unchecked); unticking both disables Continue; the hint text is shown.
- AC-6 / A-5: Open PR calls install with `workflow` equal to the edited text (and without `workflow` when unedited); success → a link with the returned `pr_url`.
- AC-8: an install error with code `ci_workflow_permission` → its message shown.

Test: `helpers.test.ts` — `canContinue` table; `installBody` with and without edits.
Verify: `pnpm typecheck && pnpm test` in `client/`
Skills: frontend-architecture, react-best-practices, react-testing-library, security
Depends on: T-C1, T-C2

### T-C6 — Agent CI tab
AC: AC-12, NFR-3
Files: `.../AgentEditor/constants.ts`, `.../AgentEditor/AgentEditor.tsx`, `.../AgentEditor/_components/CiTab/*`
Behaviour:
- Installations from `useCiInstallations(agent.id)`: repo + installed at.
- "Fail CI on" select over `ciTab.failOnOptions.*` saves through `useUpdateAgent().mutate({ id, patch: { ci_fail_on } })` (`client/src/lib/hooks/agents.ts:61-70`), with `failOnNote` beside it.
- The agent's runs via `useCiRuns(agent.id)` → `CiRunsTable` (no ingest here, NFR-5).
- "Add to CI" opens `ExportWizard`.
- `TABS` gains `{ key: "ci", labelKey: "ci.ciTab.tab" … }`; the label is resolved from the `ci` namespace. AgentEditor uses `t("agents")`, so add a key `editor.tabs.ci` to `agents.json` if cross-namespace lookup is awkward; one line.
Test: `CiTab.test.tsx` (hooks mocked) —
- Installations are listed, or `noInstallations` when there are none.
- Changing the select to `warning` calls the update mutation with `{ ci_fail_on: "warning" }`, and the note is visible.
- `useCiRuns` is called with `agent.id`, and its rows are rendered.
- Clicking "Add to CI" shows the wizard's first step.
- The existing `AgentEditor.test.tsx` stays green with the new tab.
Verify: `pnpm typecheck && pnpm test && pnpm build` in `client/`
Skills: frontend-architecture, next-best-practices, react-best-practices, react-testing-library
Depends on: T-C3, T-C5

## Traceability

| AC | task(s) | test (file › case) |
|---|---|---|
| AC-1 | T-S4, T-C5 | `server/src/modules/ci/bundle.test.ts` › exact file set, identical runner contents, only the workflow editable; `ExportWizard.test.tsx` › Preview lists files, only the workflow is editable |
| AC-2 | T-S4, T-S7 | `bundle.test.ts` › manifest round-trip through `AgentManifest`, invalid → null; `service.test.ts` › invalid manifest → 422, nothing committed |
| AC-3 | T-S4, T-S7, T-S8, T-C5 | `runner-build.test.ts` › missing dir / no `index.js` → null; `service.test.ts` › 409 with build hint, no GitHub call; `routes.test.ts` › 409 envelope; `ExportWizard.test.tsx` › 409 hint, Install unreachable |
| AC-4 | T-S3 | `workflow.test.ts` › name, types, permissions, concurrency, timeout, Node 22, run + env, artifact upload `always()` / 7 days |
| AC-5 | T-S3 | `workflow.test.ts` › base-SHA checkout, `persist-credentials: false`, no `pull_request_target`, 40-hex pins, fork skip notice, absent-runner notice + success, only two secrets, no `${{` in `run:` |
| AC-6 | T-S7, T-C1, T-C5 | `service.test.ts` › first install: one commit to `devdigest/ci` from `main`, PR title/body, URL, installation recorded, nothing else written; `ci.test.ts` › install body; `ExportWizard.test.tsx` › PR link shown |
| AC-7 | T-S7 | `service.test.ts` › second install: no new PR, same URL, same installation upserted |
| AC-8 | T-S2, T-S7, T-S8, T-C5 | `octokit-actions.test.ts` › 403/`workflow` → permission error; `service.test.ts` › 403 `ci_workflow_permission`, no installation; `routes.test.ts` › 403 envelope; `ExportWizard.test.tsx` › message shown |
| AC-9 | T-S2, T-S5, T-S7, T-C1, T-C4 | `artifact.test.ts` › valid artifact; `service.test.ts` › one `recordCiRun` with source `ci`, already-ingested URL skipped, limit 30; `ci.test.ts` › refresh posts once; `CiRunsView.test.tsx` › one ingest on open, one per Refresh; manual: double refresh on the live stack records one row |
| AC-10 | T-S5, T-S7 | `artifact.test.ts` › bad archive / invalid / pr / agent mismatch; `service.test.ts` › each skipped with one `{runUrl, reason}` warn, next run still recorded |
| AC-11 | T-S2, T-S7, T-S8, T-C4 | `service.test.ts` › list error → runs + error, nothing deleted, other installations continue; `routes.test.ts` › 200 with error; `CiRunsView.test.tsx` › notice above existing rows |
| AC-12 | T-S1, T-S5, T-S7, T-S8, T-C3, T-C6 | `ci-contracts.test.ts` › `CiRunRow` shape, copies identical; `artifact.test.ts` › `toCiRunRow` + `newestFirst`; `service.test.ts` › agent filter forwarded, foreign agent 404; `routes.test.ts` › `agent_id` query; `CiRunsTable.test.tsx` › all columns, link new tab, agent "—"; `CiTab.test.tsx` › runs for this agent; manual: workspace scoping and SQL order on the live stack |

Security mapping:

| item | where it is covered |
|---|---|
| S-1 | `workflow.test.ts` › only the `secrets.` reference; `ExportWizard.test.tsx` › reference shown |
| S-2 | `bundle.test.ts` › no token in files; `service.test.ts` › logs carry only `runUrl` / `reason`, no token |
| S-3 | AC-5's no-`${{`-in-`run:` case; plain-text rendering case in `CiRunsTable.test.tsx` |
| S-4 | AC-4 / AC-5 tests |
| S-5 | AC-6 test: only `devdigest/ci` is written |
| S-6 | AC-8 tests |

## Skills for the implementer

| skill | task(s) | why |
|---|---|---|
| onion-architecture | T-S2, T-S6, T-S7, T-S8 | adapter at the edge, `container.agentsRepo` for cross-module reads, route → service → repository |
| fastify-best-practices | T-S8 | zod params/body/querystring, response schemas, error envelope |
| drizzle-orm-patterns | T-S6 | joins, transaction + advisory lock, explicit-id inserts, no schema change |
| zod | T-S1, T-S4, T-S5, T-S7, T-S8 | new contracts, `AgentManifest` / `CiResultArtifact` `safeParse` |
| typescript-expert | T-S1–T-S5 | port typing, discriminated unions |
| security | T-S2–T-S5, T-S7, T-C3, T-C5 | workflow hardening, untrusted artifact, zip guards, no secrets in logs, plain-text rendering |
| frontend-architecture | T-C1–T-C6 | `_components` layout, shared `src/components/ci/`, hooks-only data, i18n, showcase |
| react-best-practices | T-C1, T-C3–T-C6 | mount-once ingest guard, derived wizard state, mutation state |
| next-best-practices | T-C4, T-C6 | client page in the App Router, `?tab=` routing |
| react-testing-library | T-C1, T-C3–T-C6 | hook and component tests, copy-based assertions |
| engineering-insights | any | record non-obvious findings (GitHub workflow-scope error shape, artifact API) |

## Risks

| risk | where (file:line) | mitigation |
|---|---|---|
| `ci_runs` has no workspace, agent or duration column; a schema change is forbidden | `server/src/db/schema/ci.ts:14-26` | D-1: shared id with `agent_runs`. Documented here; no migration |
| No unique index on `github_url`, so concurrent refreshes could double-insert | `ci.ts:24` | D-2: advisory transaction lock + existence check (A-11) |
| Repository SQL (joins, scoping, order) has no automated DB test: `.it` tests are not run in `/run-plan` | `server/AGENTS.md` (integration needs Docker) | logic proved with a fake repository; order also enforced by the pure `newestFirst`; manual checks in the live B verification |
| The parity test pins which shared files may differ | `server/test/eval-contracts.test.ts:169-178,238-248` | `ci.ts`, `adapters.ts` and `index.ts` edited byte-identically; `eval-ci.ts` untouched; T-S1 runs that test |
| Part A also appends to both `index.ts` copies, so a merge conflict is expected | `vendor/shared/index.ts:25-29` | one appended line each; resolve by keeping both lines |
| The manifest is JSON, not block YAML; the server cannot run the runner's YAML parser | `server/package.json` (no yaml); `agent-runner/src/manifest.ts:62` | JSON is valid YAML 1.2; the same Zod schema validates it (D-3); the live check runs the real runner |
| Action SHAs come from the planner's memory, not verified in this repo | `server/src/modules/ci/constants.ts` (new) | the test enforces 40-hex format only; confirm with `git ls-remote https://github.com/actions/<name> refs/tags/<tag>` before the live check |
| `upload-artifact` runs only when the runner ran; a fork or install PR produces no artifact | workflow step 6 | expected (EC-5, EC-6); ingest skips with `missing` |
| Listing runs of a workflow absent on the default branch returns 404 | GitHub Actions API | treated as "no runs" (D-9) |
| The 1.4 MB runner `index.js` goes through `createTree` inline content and the Preview response | `octokit.ts:290-300` | accepted; runner files collapsed in Preview; a GitHub size refusal surfaces as the install error |
| A token without workflow permission may answer 403, 404 or 422 depending on the token type | `octokit.ts:265-331` | D-8 maps 403 or a `/workflow/i` message on the write steps; the base-ref 404 fallback stays |
| Disabled linked skills are exported, unlike a local review | `reviews/run-executor.ts:461-462` | literal AC-1 (D-4); noted for the user |
| Agent provider `openai` / `anthropic` is written into the manifest, but the runner uses OpenRouter only | `agent-runner/src/index.ts:39` | out of scope (NG9); the manifest is faithful to AC-2 |
| A zip bomb or oversized artifact | server INSIGHTS 2026-09-20 (fflate) | enumerate first, inflate one entry, cap and re-check its size |
| GitHub error text could leak into logs or the UI | `server/src/app.ts:142-160` | only the message, cut to 300 chars; no headers or token; rendered as text |
| React StrictMode double-mount would ingest twice on page open | `CiRunsView` | `useRef` guard; the server dedupes anyway |
| `role="alert"` and duplicate button names in RTL | client INSIGHTS 2026-09-22 | assert on copy; distinct labels (Refresh / Open PR / Continue) |
| Showcase without a QueryClient | client INSIGHTS 2026-09-22 | `CiRunsTable` is presentational |
| A client runtime import from `@devdigest/shared` breaks the build | `client/src/lib/feature-models.ts:6-11` | `import type` only |
| `agent-runner` resolves `@devdigest/shared` from the server copy, so T-S1 changes its build input | `agent-runner/CLAUDE.md` (tsconfig aliases) | T-S9 runs runner typecheck, test and build; only build fixes allowed |
| Do not touch: migrations, lock files, `package.json`, `docker compose down -v`, `server/clones/` | root `CLAUDE.md` | none planned |

## Out of scope

- `.it.test.ts` integration tests for the `ci` module: Docker/DB is not run during `/run-plan`. They are worth a follow-up.
- A unique index on `ci_runs.github_url` or `ci_runs.workspace_id` (NG7). This is the clean long-term fix.
- Verifying action SHAs in code, or fetching them automatically.
- Updating `server/README.md`, `client/specs/pages.md` and the AGENTS.md line (shared file, an append only, done at merge time).
- Rendering per-severity counts from the artifact (critical/warning) — no AC uses them.
- Repairing runner weaknesses R-1 / R-2 (NG9).
