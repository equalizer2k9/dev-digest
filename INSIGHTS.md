# INSIGHTS — repo root

Infra (`scripts/`, `.github/`, docker) and cross-package insights — read before touching them.
Written by the `engineering-insights` skill. Append-only: add to the end of a section, never edit
or delete; cleanup only via `/engineering-insights review root`.

## What Works
<!-- Approaches that worked where the obvious one failed -->

- **2026-09-20** · To read `docs/DevDigest Design (standalone).html`, decode its `__bundler/manifest` blobs — never grep the raw file.
  - Why: the React sources are gzip+base64 per UUID, so a raw grep surfaces only artboard labels, not component markup.
  - Evidence: `<script type="__bundler/manifest">` → `json.loads` → `base64.b64decode` + `gzip.decompress` yields 29 `.jsx` (`primitives.jsx`, `screen_dashboard.jsx`, `prdetail_runs.jsx`, `findings.jsx`, `screen_trace.jsx`)

## What Doesn't Work
<!-- Dead ends and antipatterns, each with what to do instead -->

- **2026-10-14** · NEVER ablate a skill rule for an eval delta by deleting only its numbered line — remove every restatement, including the frontmatter `description`.
  - Why: `skillContent()` injects SKILL.md with frontmatter, and onion-architecture restates each rule in the ring diagram, so the knowledge survives a one-line removal.
  - Evidence: `evals/src/artifacts/load.ts:19` · rule 4 removed → practice 100%→100%; + diagram line → 100%→67%, `container.ts` still named in 2/3 (`docs/hw6/lab/report.md`)
  - Seen again 2026-10-14: removing rule 4 from body, diagram and `description` dropped the practice 100%→33% with controls at 100% (onion-v2c).
- **2026-10-14** · NEVER read `eval:repeat` pass rate for a workflow case as its assertion result — recompute it from the record's `trace`.
  - Why: `record()` gets no verdict for workflow cases, so `outcome = !isError` ("session didn't crash"); wf-1 printed 6/6 while 3/5 cases passed.
  - Evidence: `evals/src/records/record.ts:49` · `evals/src/dsl/case.ts:132`
  - Seen again 2026-10-16: wf-desc printed activation+ 1/2 (skill invoked both runs, run 1 hit maxTurns) and contrast 4/4 (run 2 treatment read nothing).
  - Resolved 2026-10-16: `record()` now stores `workflowPassed(case, trace)` as the outcome (`evals/src/dsl/workflow-pass.ts`), contrast rows aggregate as `[treatment]` / `[control]`; rescored wf-1 and wf-desc match the trace tables.

## Codebase Patterns
<!-- Undocumented conventions and architectural decisions, with the reason -->

- **2026-09-20** · Before building a course feature, run `git log -S "<symbol>" -- <path>` — main ships deliberately unsolved, but the solutions are still in history.
  - Why: `c6af1e4` reset main's tree to starter commit `66727c8` while leaving the three student merges in the log, so reverted implementations remain reachable.
  - Evidence: `7641b48` (severity counters), `97b6edc` (PR-list FINDINGS column), `0953fdc` (timeline severity chips) · full state on branch `integration/all-features` (`376ac49`)

- **2026-10-15** · Project Context documents are ALWAYS read from the clone's working tree (default branch), NEVER from the PR head commit.
  - Why: a PR author could otherwise rewrite the very rules (`docs/`, `specs/`) the reviewer judges that PR by; a PR changing a document still sees the old one (SPEC-02 AC-17, EC-6).
  - Evidence: `server/src/modules/project-context/service.ts:74` (`container.git.readFile` on the clone) · `specs/project-context/spec.md` AC-17
- **2026-10-15** · Inject attached documents only through `wrapUntrusted` (one block per document, path stated) under a separate 8 000-token `## Project context` budget.
  - Why: documents are repo text anyone can commit; the trusted document rule says they cannot lower or remove findings, and the own budget keeps them from crowding the diff — past it a document is dropped whole and traced "over budget".
  - Evidence: `reviewer-core/src/prompt.ts:46-57,79` · `server/src/modules/project-context/constants.ts:24` (`SECTION_TOKEN_BUDGET`) · SPEC-02 AC-18, AC-21, AC-24, AC-25
- **2026-10-15** · Read a symlinked clone file ONLY when its resolved target is itself an allowed document of the same clone — use the shared rule, never a plain `realpath` inside-clone check.
  - Why: a committed `docs/x.md → ../.git/config` passed the inside-clone check and leaked the clone's GitHub token through preview, prompt, brief and trace (CRITICAL, HW5 security review).
  - Evidence: `server/src/modules/_shared/symlink-rule.ts` · fix `7a51b10`, shared by project-context, intent and conventions in `b044bfd`

## Tool & Library Notes
<!-- Dependency and tooling quirks, with the version -->

- **2026-10-14** · To restrict an eval session's tools, pass the Agent SDK `tools` option — `allowedTools` only auto-approves and removes nothing.
  - Why: `evals/src/runtime/run-claude.ts` sets only `allowedTools` + `bypassPermissions`, so "read-only" and "no tools" sessions still get Bash/Write/Edit.
  - Evidence: `@anthropic-ai/claude-agent-sdk` 0.3.198 `sdk.d.ts:1305-1311` · `evals/src/config.ts:28` · `evals/src/tasks.ts:50`
- **2026-10-14** · To keep a `settingSources: ["project"]` eval session off the DevDigest MCP, pass `strictMcpConfig: true` — `tools` does not filter MCP tools.
  - Why: the session loads `.mcp.json`, so `mcp__devdigest__run_agent_on_pr` (a paid review via the API on :3001) stays callable under bypassPermissions.
  - Evidence: init probe tools list · `sdk.d.ts:1895` · a fresh worktree is safe only because `devdigest-mcp/node_modules` is missing

## Recurring Errors & Fixes
<!-- Exact error text → real cause → fix -->

- **2026-09-20** · Studio on :3000 shows `Could not load skills.` and `net::ERR_CONNECTION_REFUSED` on `localhost:3101`
  - Cause: `scripts/e2e.sh` runs `next dev -p 3100` from the same `client/` dir, so its `NEXT_PUBLIC_API_BASE=http://localhost:3101` is compiled into the shared `client/.next` the dev server keeps serving.
  - Fix: kill the dev client BY PID, `rm -rf client/.next`, restart `./scripts/dev.sh`.
  - Evidence: `scripts/e2e.sh:42` · `scripts/e2e.sh:148`
  - Seen again 2026-10-07: killing only the client ends `dev.sh` but orphans the API (`tsx watch` child) on :3001 — kill it by PID too before restarting.
- **2026-10-14** · `ERR_PNPM_IGNORED_BUILDS ... Ignored build scripts: esbuild@0.21.5, esbuild@0.28.1` on `pnpm install` in `evals/`
  - Cause: pnpm 12 ignores `pnpm.onlyBuiltDependencies` in `evals/package.json`; build approval now lives in `allowBuilds` of `pnpm-workspace.yaml`.
  - Fix: keep `evals/pnpm-workspace.yaml` (`allowBuilds: esbuild: true`) — it is settings for one package, not a workspace; regenerate via `pnpm install --allow-build=esbuild`.
  - Evidence: pnpm v12.10.1 · `evals/pnpm-workspace.yaml`
- **2026-10-14** · Contrast case `[treatment]` output in `evals/results/outputs/` shows the control's text
  - Cause: `slugify()` cuts the label to 80 chars before the `[treatment]`/`[control]` suffix, so both write one file and control wins.
  - Fix: keep contrast case names ≤ 65 chars, or slug the suffix separately in `record()`.
  - Evidence: `evals/src/records/record.ts:26`
- **2026-10-14** · `UnsafeMasterKeyError: LiteLLM proxy refused to start: no master key is set` on `docker compose -f evals/proxy/docker-compose.yml up`
  - Cause: the unpinned `ghcr.io/berriai/litellm:main-stable` image now refuses no-auth mode, which `evals/proxy/litellm.config.yaml` uses on purpose.
  - Fix: not applied yet — pin the image, or set a per-run `LITELLM_MASTER_KEY` and send it as the bearer (`evals/src/runtime/env.ts` sends `OPENROUTER_API_KEY` today).
  - Evidence: CI run 38626992479, jobs `agents` and `workflow`, step `LiteLLM proxy up`
  - Superseded 2026-10-15: fix applied — image pinned to `v1.105.1@sha256:b7b9e2c3…`, per-run `LITELLM_MASTER_KEY` sent as the bearer by `evals/src/runtime/env.ts`.

## Session Notes
<!-- ### YYYY-MM-DD — task: outcome, sections that got entries, what stayed open -->

### 2026-09-20 — Run Cost Badge spec + plan
- Done: `server/specs/run-cost-badge.md` written against the decoded design bundle; a first pass that specced from the lab slide alone was wrong in 5 places (badge base element, PR-list column position, plaque placement, timeline markup, a missed 4th surface).
- Added: What Works.
- Open: spec is `draft`, not yet approved or implemented.

### 2026-09-20 — HW2 Skills Lab verification on the live stack
- Done: criteria 6-16, 19-20, 22-37 verified against the running stack (API+psql+browser); added `e2e/specs/08-skills-lab.flow.json`, hermetic suite 8/8.
- Added: Recurring Errors & Fixes.

### 2026-09-20 — severity counters on the findings panel
- Done: implemented fresh in `client/` after surfacing that a reverted reference commit existed; user chose not to restore it.
- Added: Codebase Patterns.

### 2026-10-15 — Project Context decisions after HW5 mentor review
- Done: recorded why documents come from the clone, how they are injected, and the symlink rule.
- Added: Codebase Patterns.

## Open Questions
<!-- Unverified hypotheses and unanswered questions; close with a "Resolved" sub-bullet -->

- **2026-10-14** · Why does an Agent SDK session report `cache_read_input_tokens` far above its visible context?
  - Known: architecture-reviewer, 3 turns, ~8k context → second request alone reports 137,430 cache-read tokens; `modelUsage` also shows a hidden ~800-token haiku side call per session (SDK 0.3.198).
  - Matters because: eval token totals in `evals/results/records.jsonl` are dominated by this figure, so prompt-token cost is an upper bound.
