# Spec: Export to CI
Spec ID: SPEC-05
Status: approved
Supersedes: —

Source: `docs/hw7/requirements.md`, Part B. Its decisions are referenced as `D11` to `D20`; they,
the "Безпека B" paragraph, "Власники файлів", "Що вже є у форку", "Не робимо" and "Спека, план,
перевірки" are final and were not re-asked. Points they do not settle are recorded as assumptions
`A-n` (section at the end), not as open questions. UI reference: `docs/DevDigest Design
(standalone).html` (v7) — agent CI tab, export wizard, CI Runs.

## Problem and user

A review agent tuned in the studio only runs when someone opens the studio and starts it. The
studio can already open pull requests on GitHub and store CI installations and CI runs, but nothing
turns an agent into a CI check, and nothing brings CI results back. The user is the owner of a
workspace repository (here: the fork `equalizer2k9/dev-digest`, base `main`) who wants one agent to
review every same-repo pull request automatically in GitHub Actions — installed through a reviewed
pull request, never by writing to `main` — and who wants to see in the studio what those CI reviews
found and cost, without the studio ever holding the model provider's secret.

## Goals / Non-goals

- G1. From an agent's CI tab, a four-step wizard (Target → Preview → Configure → Install) that
  exports the agent to GitHub Actions on a repository of the workspace (D11, D12).
- G2. A complete, self-contained bundle: the agent manifest, its skills, every file of the built
  agent runner, and a hardened workflow, previewed before install (D13, D15, D16).
- G3. Install only through a pull request from the branch `devdigest/ci`; a repeated install
  updates the same open pull request; one installation record per agent and repository (D14).
- G4. A workflow that never runs pull-request code next to the secret: runner and configuration come
  from the base commit, fork pull requests are skipped, permissions are minimal (D15, Security).
- G5. Pull-based ingest of CI results on opening CI Runs or pressing Refresh, shown on a CI Runs page
  and on the agent's CI tab (D17, D18).
- G6. Clear messages for a missing runner build, a GitHub token without workflow permission, and an
  unreachable GitHub (D13, D17, D19); a hint on making the check required (D20).

Non-goals:

- NG1. CircleCI, Jenkins and generic CLI targets — not shown in the wizard (no generators exist).
- NG2. Zip download from the wizard; a marketplace action; an incoming ingest endpoint (the local
  studio is not reachable from GitHub).
- NG3. Reviewing pull requests from forks.
- NG4. Background polling of GitHub — ingest happens only when CI Runs is opened and on Refresh.
- NG5. Learn / Memory / `memory.jsonl`; an Agent Performance page.
- NG6. Ingesting individual CI findings: a CI run brings back counts, cost, duration and status only
  (the result artifact holds no findings).
- NG7. Any database schema change: every CI table already exists; a need for one stops the work.
- NG8. Setting the required check or the repository secret from the studio: the user does both on
  GitHub (D11, D20).
- NG9. Changing the agent runner's behaviour: it is only touched for build fixes (D16); its known
  weaknesses are recorded as residual risks (Security).
- NG10. Part A (Multi-Agent Review): the multi-agent picker, run page, grouping, disagreements,
  estimates, the multi-agent list, and its schema change.
- NG11. Installing more than one agent into the same repository (A-6).
- NG12. Pixel parity with the design reference.

## User stories

- US-1. As a repository owner on an agent's CI tab, I want "Add to CI" to walk me through target,
  preview, configuration and install, so the agent reviews my pull requests in GitHub Actions.
- US-2. As a repository owner, I want to see every file that will be committed, edit the workflow,
  and see that the secret appears only as a reference, before anything reaches GitHub.
- US-3. As a repository owner, I want the install to arrive as a pull request I review and merge,
  and a repeated install to update that same pull request.
- US-4. As a repository owner, I want CI reviews of my pull requests to show up in the studio — per
  repository, pull request and agent — with status, findings count, cost, duration and a link to the
  job.
- US-5. As a repository owner, I want to set when the CI check fails ("Fail CI on") on the agent's CI
  tab and to be told how to make the check required.

## Acceptance criteria (EARS)

Definitions.
- The **runner build** is the content of the agent runner's build output directory (the result of
  `pnpm --dir agent-runner build`): every file in it, today `index.js`, one chunk file and a
  `package.json` that declares ES modules (D13, D16).
- The **bundle** of an agent for a repository is the list of files with path, contents and an
  editable flag that the export would commit.
- An agent's **slug** and a skill's **slug** are derived from their names (A-1).
- A **CI installation** is the record tying one agent to one repository with target GitHub Actions.
- A workflow run is **ingested** when a CI run with its URL exists in the studio.
- A **pull-request text** is any of: title, body, head branch name, head repository name, commit
  message, author login.

Bundle (D13, D16)
- AC-1 (D13). WHEN the bundle of an agent is generated with an available runner build, the system
  shall return exactly these files: `.devdigest/agents/<agent slug>.yaml`, one
  `.devdigest/skills/<skill slug>.md` per skill linked to the agent holding that skill's text, one
  `.devdigest/runner/<file name>` per file of the runner build with identical contents, and
  `.github/workflows/devdigest-review.yml`; only the workflow shall be marked editable.
- AC-2 (D13). The system shall generate the agent manifest so that the YAML, parsed and validated by
  the same shared agent manifest contract the runner uses, yields the agent's name, provider, model,
  system prompt, skill slugs in link order and its "Fail CI on" value; IF that validation fails THEN
  the export shall be rejected and nothing shall be written to GitHub.
- AC-3 (D13). IF the runner build is missing or contains no `index.js` THEN a preview or install
  request shall be answered with a conflict (HTTP 409) whose message contains
  `pnpm --dir agent-runner build`, and nothing shall be written to GitHub.

Workflow (D15)
- AC-4 (D15). WHEN the workflow is generated from a set of triggers and a publication mode, the system
  shall produce a workflow named `DevDigest Review` that runs on `pull_request` for exactly those
  types, has `permissions` of exactly `contents: read` and `pull-requests: write`, a concurrency group
  per pull request with cancel-in-progress, `timeout-minutes: 10`, sets up Node 22, runs
  `node .devdigest/runner/index.js` with env `OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}`,
  `GITHUB_TOKEN`, `PR_NUMBER` and `DEVDIGEST_POST_AS` set to the publication mode, and uploads
  `devdigest-result.json` as artifact `devdigest-result` with `if: always()` and 7 days of retention.
- AC-5 (D15, Security). The generated workflow shall: check out
  `${{ github.event.pull_request.base.sha }}` with `persist-credentials: false`; contain no
  `pull_request_target`; reference every action by a full 40-character commit SHA; for a pull request
  whose head repository differs from `github.repository`, skip checkout and runner and emit a notice;
  when `.devdigest/runner/index.js` is absent on the checked-out base, emit a notice and end the job
  successfully without running the runner; reference no secret other than `OPENROUTER_API_KEY` and the
  workflow token; and interpolate no pull-request text expression into any `run:` command.

Install (D14, D19)
- AC-6 (D14). WHEN the user installs an agent into a repository with no open pull request from
  `devdigest/ci`, the system shall commit the whole bundle as one commit to the branch `devdigest/ci`
  created from `main`, open a pull request titled "Add DevDigest CI review" from it into `main` whose
  description lists the files, names the required secret `OPENROUTER_API_KEY` and explains how to make
  the check required, return its URL, record the CI installation, and write nothing to `main`.
- AC-7 (D14). WHEN the user installs again an agent into a repository where an open pull request from
  `devdigest/ci` exists, the system shall commit the regenerated bundle to that branch, open no new
  pull request, return the existing pull request's URL, and keep exactly one CI installation for that
  agent and repository.
- AC-8 (D19). IF GitHub refuses the install because the studio's token lacks permission to write
  workflow files THEN the system shall answer with an error that says the token needs the `workflow`
  scope (classic) or Workflows: write (fine-grained), and shall record no CI installation.

Ingest (D17)
- AC-9 (D17). WHEN CI runs are refreshed, the system shall, for every GitHub Actions installation of
  the workspace, list the completed runs of `devdigest-review.yml` and, for each one not yet ingested
  whose `devdigest-result` artifact passes the shared CI result contract with a `pr_number` equal to
  the run's pull request and an `agent` equal to the installation's agent name, record one agent run
  with source `ci` and one CI run (status, findings count, cost, pull request number, run URL); a run
  already ingested shall not be recorded again.
- AC-10 (D17). IF a completed run's artifact is missing, expired, not a readable archive, fails the
  shared CI result contract, or names another pull request or agent THEN the system shall skip that
  run, write a log entry naming the run URL and the reason, record nothing for it, and continue with
  the other runs.
- AC-11 (D17, D19). IF GitHub cannot be reached or refuses to list runs or download artifacts during a
  refresh THEN the system shall answer with the CI runs already recorded plus an error message, and
  shall keep every previously recorded CI run.

Display (D18)
- AC-12 (D18). WHEN the caller requests CI runs, optionally for one agent, the system shall return the
  CI runs of the caller's workspace (of that agent only, when given), newest first, each with
  repository, pull request number, agent, status, findings count, cost, duration, run time and run URL.

## Edge cases

- EC-1. Runner not built in the studio's checkout → AC-3; the wizard shows the hint on the Preview
  step and does not allow Install.
- EC-2. Agent with no linked skills → no `.devdigest/skills/` files; the manifest's skill list is
  empty (AC-1, AC-2).
- EC-3. Two skills with the same slug → the second gets a numeric suffix so paths stay unique (A-1).
- EC-4. Agent or skill name with no letter or digit → a fixed fallback slug (A-1).
- EC-5. The install pull request itself → its base has no runner yet, so the workflow emits a notice
  and passes (AC-5); after merge, later pull requests are reviewed.
- EC-6. A pull request from a fork → the job emits a notice and does not run the runner (AC-5, NG3);
  no artifact is produced; ingest skips that run with a log entry (AC-10).
- EC-7. A workflow run that was cancelled or timed out, or whose runner crashed before writing the
  result → no valid artifact → skipped with a log entry (AC-10); it is attempted again on each
  refresh until its artifact expires (A-10).
- EC-8. An artifact older than its 7-day retention → expired → skipped (AC-10).
- EC-9. The pull request of a CI run is not imported into the studio → the CI run is still recorded
  with its pull request number; the agent run has no link to a pull request (A-8).
- EC-10. Refresh pressed twice, or CI Runs opened while a refresh is running → no CI run is recorded
  twice (AC-9, A-11).
- EC-11. An installation's agent is deleted → its installation is removed with it; already recorded
  CI runs remain with an empty installation and are shown with agent "—".
- EC-12. A second, different agent is installed into a repository that already has an installation →
  the install is refused with a message (A-6, NG11).
- EC-13. The user edits the workflow in Preview → the edited text is committed as is (A-5); its
  security is then the user's responsibility (Security, residual risk R-3).
- EC-14. The install pull request was merged or closed and the agent is installed again → a new
  pull request is opened from `devdigest/ci` (AC-6); the installation record is reused (AC-7).
- EC-15. "Fail CI on" changed after install → takes effect only after the next install, because the
  value is carried in the committed manifest (A-7, NFR-3).
- EC-16. GitHub token missing altogether → install and refresh answer with the existing "GitHub not
  connected" error; nothing is recorded.
- EC-17. A repository with installations but no workflow runs yet → refresh records nothing; the page
  shows its empty state.

## Non-functional requirements

- NFR-1 (D12). Wizard: "Add to CI" on the agent's CI tab opens the existing four-step wizard
  component. Target lists only GitHub Actions and the repositories of the workspace. Preview lists
  every bundle file with its contents; the workflow is editable, every other file is read-only.
  Configure offers triggers opened and synchronize (on by default) and reopened (optional, A-4), and
  publication github_review (default), pr_comment or none. Install offers only "Open PR" and, after
  success, shows the pull request link.
- NFR-2 (D20). The Configure step shows a hint, as in the design, that the check is made required by
  the user with a ruleset on `main` requiring the `DevDigest Review` check; the studio sets no
  ruleset.
- NFR-3 (D18). Agent CI tab: the agent's CI installations (repository, installed at), the "Fail CI on"
  setting (never / critical / warning / any) saved on the agent through the existing agent update,
  with a note that a change applies after the next install, the agent's CI runs (AC-12 for that agent)
  and the "Add to CI" button.
- NFR-4 (D18). CI Runs page: a "CI Runs" sidebar item opens `/ci-runs`, a table with repository, pull
  request, agent, status, findings count, cost, duration, when, and a link opening the GitHub run in a
  new tab; a Refresh button. Opening the page and pressing Refresh each trigger one ingest (AC-9) and
  then show the list; while an ingest runs the button shows a busy state and cannot be pressed again;
  an ingest error (AC-11) is shown as a non-blocking notice above the existing rows. Explicit loading
  and empty states.
- NFR-5 (D17). Ingest runs only on page open and Refresh, never on a timer or in the background (NG4).
  It reads at most the 30 most recent completed workflow runs per installation per refresh (A-9).
- NFR-6. Every CI read and write is scoped to the caller's workspace: an agent, repository,
  installation or CI run of another workspace answers "not found".
- NFR-7 (D17). External access only through the studio's GitHub client, which gains listing workflow
  runs and downloading an artifact; tests use its mock — no network, no real token.
- NFR-8. No schema change (NG7). Values the CI tables do not hold (agent, duration) are derived from
  existing records (A-12).
- NFR-9. Every caption, label and static text of the CI tab, wizard and CI Runs page comes from the
  studio's message files; repository names, agent names and error texts are shown as plain text.
- NFR-10. Cost: export, preview, install and ingest make no model call. A CI review costs what one
  local review of the same agent on the same pull request costs, paid with the repository's own key.
- NFR-11 (D16). The gate of this feature includes the agent runner's own tests and build; the runner
  is changed only to make them pass.

## Inputs and provenance

The studio makes no model call in this feature. The CI run makes the agent's existing review call
inside the runner, with the reviewer engine's existing input budget and the same exclusions; this
feature does not change them.

| Input | Used by | Tag | Source |
|---|---|---|---|
| Agent name, provider, model, system prompt, "Fail CI on", linked skills in order | AC-1, AC-2, NFR-3 | `[reused: agents and their skill links]` | `server/src/db/schema/agents.ts` |
| Skill texts | AC-1 | `[reused: skills of the agent]` | studio skills |
| Agent and skill slugs | AC-1, AC-2 | `[deterministic: from names, A-1]` | — |
| Agent manifest contract | AC-2, runner | `[reused: shared agent manifest contract]` | `server/src/vendor/shared/contracts/eval-ci.ts` |
| Runner build (`index.js`, chunk, `package.json`) | AC-1, AC-3 | `[reused: agent-runner build output, upstream `lesson-7-lab/agent-runner` with the skill mapping of D16]` | `agent-runner/` (`pnpm build` → `dist/`, git-ignored) |
| Workflow text | AC-4, AC-5 | `[deterministic: pure function of triggers and publication mode]` | — |
| Workspace repositories | NFR-1 | `[reused: imported repositories]` | studio repos |
| GitHub token of the studio | AC-6 to AC-11 | `[reused: secrets provider]` | studio secrets |
| Commit to branch, open pull request, find open pull request | AC-6, AC-7 | `[reused: GitHub client]` | `server/src/vendor/shared/adapters.ts` |
| Workflow runs of `devdigest-review.yml` (URL, status, conclusion, pull request, times) | AC-9 to AC-11 | `[deterministic: new GitHub client read, listing workflow runs]` | GitHub Actions API |
| `devdigest-result` artifact (zip of `devdigest-result.json`) | AC-9, AC-10 | `[deterministic: new GitHub client read, downloading an artifact; unzipped and validated]` | GitHub Actions API |
| CI result contract | AC-9, AC-10 | `[reused: shared CI result contract, also used by the runner when writing]` | `eval-ci.ts` |
| CI installations, CI runs, agent runs with source | AC-6, AC-7, AC-9, AC-12 | `[reused: existing tables, no schema change]` | `server/src/db/schema/ci.ts`, `runs.ts` |
| Repository secret `OPENROUTER_API_KEY` | workflow only | `[reused: repository secret set in HW6; never read by the studio]` | GitHub |

## Untrusted inputs

- Pull-request texts (Definitions) and the diff are controlled by the pull request author. They are
  **data, not instructions**. The studio never interpolates them into the workflow (AC-5). In CI the
  runner passes the diff and pull request text to the model only inside the reviewer engine's
  delimiters with its injection guard — the same treatment the diff gets in a local review.
- The result artifact and workflow-run metadata come from GitHub and from a CI job. They are data:
  the artifact is accepted only after validation by the shared CI result contract and the
  pull-request and agent match (AC-9, AC-10); its strings are stored and shown as plain text (NFR-9).
- GitHub error texts are shown as plain text and never interpreted.

## Security (Безпека B)

- S-1. The studio never reads, asks for, stores or logs the OpenRouter secret of the repository. The
  bundle and the Preview show it only as `${{ secrets.OPENROUTER_API_KEY }}` (AC-4, AC-5).
- S-2. No secret appears in `devdigest-result.json`, in the studio's logs or in any trace: the artifact
  holds only counts, cost, duration, agent name, version and pull request number (shared CI result
  contract); ingest logs carry only run URL and reason (AC-10); the studio's GitHub token is never
  included in a bundle, a response or a log line.
- S-3. Pull-request text is untrusted data (Untrusted inputs).
- S-4. Workflow hardening (D15), AC-backed by the workflow pure-function test (AC-4, AC-5): base-SHA
  checkout, so the runner, manifest and skills come from `main` and the pull request's code is never
  executed next to the secret nor able to replace the runner or prompt; `persist-credentials: false`;
  no `pull_request_target`; every action pinned by full commit SHA; no marketplace action; fork pull
  requests skipped; no pull-request text in any `run:` command; minimal permissions
  `contents: read`, `pull-requests: write`; a 10-minute timeout.
- S-5. The studio never writes to `main` directly: installs go only to `devdigest/ci` and through a
  pull request the user reviews (AC-6, AC-7).
- S-6. A token without workflow permission yields a clear error and no partial installation record
  (AC-8). Ingest needs only Actions: read (D19).
- Residual risks (out of scope; the runner is touched only for build fixes, NG9):
  - R-1. The runner's diff parsing treats `+++ ` / `--- ` lines as file headers even inside a hunk, and
    strips ignored paths (`.devdigest/`, `.github/workflows/`) by a loose header pattern, so a crafted
    pull request could hide changes from the reviewer.
  - R-2. The runner joins manifest skill slugs into a file path without validation. Mitigated: the
    manifest and skills are read from the base commit (S-4), and studio-generated slugs contain only
    lower-case letters, digits and hyphens (A-1).
  - R-3. A workflow edited in Preview is committed as is (A-5) and may drop any S-4 property; the
    install pull request is the user's review point.
  - R-4. `agent-runner/src/run.ts` puts the PR title into the engine's `task` line unwrapped, while
    the PR body goes through `<untrusted source="pr-description">`; a crafted title is a prompt
    injection path into the review. Out of scope here (runner touched only for build fixes); fix
    candidate: fixed `task` literal and the title inside the wrapped description.

## Open questions

None. The user set the run to fast mode: decisions D11 to D20 are final, and every point they do not
settle is recorded below as an assumption, to be overridden by the user if wrong.

## Assumptions

- A-1. Slug = name lower-cased, every run of characters other than `a-z` and `0-9` replaced by one
  hyphen, leading and trailing hyphens removed; empty result → `agent` / `skill`; a duplicate skill
  slug within one agent gets `-2`, `-3`, ….
- A-2. The repository's base branch is `main` (D11); the wizard does not ask for it.
- A-3. Preview and Install use the same bundle generation; Preview writes nothing to GitHub and
  records nothing.
- A-4. Default triggers are opened and synchronize; reopened is off until ticked. At least one
  trigger must be ticked to continue.
- A-5. The install request carries the edited workflow text; every other file is regenerated by the
  server at install time, never taken from the client. The edited workflow is committed unchanged.
- A-6. The runner accepts exactly one agent manifest per repository, and the workflow file name is
  fixed, so one repository holds at most one installed agent: installing a different agent into a
  repository that already has an installation is refused with a message. Re-installing the same agent
  is allowed (AC-7).
- A-7. "Fail CI on" is read from the agent at export time and written into the manifest; the runner's
  exit code (and so the check) follows it. A later change needs a new install.
- A-8. A CI agent run is linked to the studio's pull request when that repository and number are
  imported; otherwise it has no pull request link. Its model and provider are the agent's at ingest
  time; its tokens are unknown.
- A-9. The latest 30 completed workflow runs per installation are examined per refresh; older ones are
  not ingested.
- A-10. Skipped runs are not remembered; they are re-examined (and logged again) on later refreshes
  until their artifact expires or they fall outside A-9.
- A-11. Concurrent refreshes may race; the run URL stays the dedupe key, and a duplicate insert is
  ignored rather than failing the refresh.
- A-12. CI run status: workflow conclusion failure → `failed`; success with 0 findings →
  `no_findings`; success otherwise → `succeeded`. The agent run's status is `done`. Run time = workflow
  run completion time; duration = the artifact's duration; agent = the installation's agent. The
  installation record's install time is updated on each install.
- A-13. The CI source recorded on a CI run is `gha`.

## Traceability

| Decision | Covered by |
|---|---|
| D11 target fork, base `main`, same-repo pull requests only | AC-5, AC-6, A-2, NG3, NG8 |
| D12 wizard Target → Preview → Configure → Install, only GHA, workflow editable, "Open PR" only | AC-1, NFR-1, A-3, A-4, A-5, NG1 |
| D13 file set, all runner build files, manifest validated by same contract, 409 + build hint, no `memory.jsonl` | AC-1, AC-2, AC-3, NG5 |
| D14 branch `devdigest/ci`, PR "Add DevDigest CI review" with description, reuse open PR + same URL, one installation per agent + repo, never write to base | AC-6, AC-7, S-5, A-6 |
| D15 workflow pure function and every listed property | AC-4, AC-5, S-4 |
| D16 runner provenance, skill mapping, build | Inputs and provenance, NFR-11, NG9 |
| D17 pull-based ingest, dedupe by run URL, artifact validation, pr/agent match, `agent_runs` ci + `ci_runs`, skip with log, GitHub down → message and old rows kept, new GitHub client reads + mocks | AC-9, AC-10, AC-11, NFR-5, NFR-7, NG2, NG4 |
| D18 `/ci-runs` page and agent CI tab with "Fail CI on", history, "Add to CI" | AC-12, NFR-3, NFR-4 |
| D19 token `workflow` scope / Workflows: write error; Actions: read for ingest | AC-8, AC-11, S-6 |
| D20 required check set by the user; hint on Configure | NFR-2, NG8 |
| Безпека B: secret never read or stored; Preview shows only the reference; no secrets in artifact, logs, trace; PR text untrusted | S-1, S-2, S-3, AC-4, AC-5, Untrusted inputs |
| No schema change | NG7, NFR-8 |
