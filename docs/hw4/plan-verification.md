# HW4 plan verification — Blast Radius + devdigest-mcp

Branch `feat/homework-4`, uncommitted tree. Static read only: no test, typecheck, server, MCP client or browser was run, and I had no `git diff`.
All paths are relative to `/home/oles/Projects/dev-digest/`. `PRC/` stands for `client/src/app/repos/[repoId]/pulls/[number]/_components/`.
My fixed output format puts the matrix first; the verdict paragraph you asked for is the **Summary** directly below it.

| Id | Requirement (short) | Evidence file:line | Status | Note |
|---|---|---|---|---|
| P1-1 | Blast radius block on Overview | `PRC/OverviewTab/OverviewTab.tsx:30-39`; `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:139-141`; test `PRC/OverviewTab/OverviewTab.test.tsx:60-66` | PASS | Block is mounted full width under the description. |
| P1-2 | Summary: symbols, callers, endpoints, crons | server `server/src/modules/blast/helpers.ts:14-21,73-82`; client `PRC/BlastRadius/BlastRadius.tsx:30-35`, `PRC/BlastRadius/helpers.ts:11-26` | PASS | The client derives the four numbers from the response and does not render the `summary` string. |
| P1-3 | Per symbol: callers `file:line`, then its endpoints | server `server/src/modules/blast/helpers.ts:49-66`; client `PRC/BlastRadius/BlastRadius.tsx:49-90` | PASS | Caller function name sits on the right of each row (`:72`). |
| P1-4 | Test PR shows ≥2 real callers and ≥1 endpoint | — | NOT VERIFIABLE | Stand item. Evidence needed: `GET /pulls/<id>/blast` body for the test PR with ≥2 callers and non-empty `endpoints_affected`, plus `index-state` = `full`. |
| P1-5 | Click `file:line` opens the line on GitHub | `PRC/BlastRadius/BlastRadius.tsx:60-68`; `client/src/lib/github-urls.ts:24-36`; test `PRC/BlastRadius/BlastRadius.test.tsx:77-84` | PASS | Pinned to head sha, `target="_blank" rel="noreferrer"`. |
| P1-6 | No callers → clear text; incomplete index → separate marker with reason | `PRC/BlastRadius/BlastRadius.tsx:37-47`; `client/messages/en/blast.json:5-14,26`; server `server/src/modules/blast/service.ts:58-62` | PASS | Marker and `noDownstream` are independent elements; tests `BlastRadius.test.tsx:105-114,135-154`. |
| P1-7 | `get_blast_radius` works in Claude Code and gives the same map as the UI | `devdigest-mcp/src/tools/get-blast-radius.ts:9-12`; `devdigest-mcp/src/format.ts:55-65`; `.mcp.json:4-5` | PARTIAL | Static side is complete: same route, keeps summary / degraded / reason / symbols / callers / endpoints / crons. needs runtime check: Claude Code `/mcp` shows `devdigest` connected; call `get_blast_radius` for the test PR and compare with the Overview block. |
| P1-8 | Open PR with description + demo video | — | NOT VERIFIABLE | Delivery item. Evidence needed: PR URL in the fork and the video file or link. |
| P2-1 | Logs show a read of the ready index, no AST / import-graph rebuild | `server/src/modules/blast/service.ts:53-56,82-85`; `server/src/modules/repo-intel/service.ts:322-394`; test `server/test/blast.it.test.ts:145-148` | PARTIAL | Code makes one facade call, reads Postgres only on the index path, and writes `blast: served {…}`. No test asserts the log line. needs runtime check: hit the route on an indexed repo and read the API log. |
| P2-2 | Route response validates as `BlastRadius` | `server/src/modules/blast/routes.ts:20`; `server/test/blast.it.test.ts:130-131`; `server/test/contracts.test.ts:297-311` | PASS | Both `brief.ts` copies are identical at `:46-55`. The integration suite is Docker-gated (`blast.it.test.ts:19-20`). |
| P2-3 | `callers` → `downstream` mapping unit-tested | `server/src/modules/blast/helpers.ts:31-83`; `server/src/modules/blast/helpers.test.ts:17-197` | PASS | Covers grouping, facts per group, `factsByFile` absent, and summary. |
| P2-4 | Main scenario without LLM (optional text summary) | `server/src/modules/blast/service.ts:27-72`; `server/test/blast.it.test.ts:149-150` | PASS | No LLM or embedder reference in `modules/blast/` or in `repo-intel/service.ts:220-409`. Optional model summary: OUT OF SCOPE, not built. |
| P2-5 | Declaring file never among its own callers | `server/src/modules/blast/helpers.ts:34-43`; `server/src/modules/repo-intel/service.ts:276`; tests `helpers.test.ts:110-126`, `blast.it.test.ts:62,136-143` | PASS | |
| P2-6 | Limits 20 / 2 come from `constants.ts` | `server/src/modules/repo-intel/constants.ts:30,49`; `server/src/modules/repo-intel/service.ts:383-389`; test `server/test/repo-intel-blast-reasons.test.ts:115-139` | PASS | No numeric limit in `modules/blast/*`, `PRC/BlastRadius/*` or `client/src/lib/hooks/blast.ts`. `BFS_DEPTH` is used only at `service.ts:704`, not by blast. |
| P2-7 | `degraded` + reason reach the UI | `server/src/modules/blast/service.ts:60-61`; `PRC/BlastRadius/BlastRadius.tsx:24,37-42`; `PRC/BlastRadius/constants.ts:4-13` | PASS | All five enum values have a string (`blast.json:8-12`); test `BlastRadius.test.tsx:135-143`. |
| P2-8 | `get_blast_radius` follows the lab rules | `devdigest-mcp/src/tools/get-blast-radius.ts:18-21`; `devdigest-mcp/src/errors.ts:14-17`; test `devdigest-mcp/src/tools/get-blast-radius.test.ts:38-44` | PASS | "When to call" description, flat `pr_number` / `repo?`, whitelisted output, unknown-PR hint, `readOnlyHint: true`. |
| P2-9 | PR description says which subagent did what | — | NOT VERIFIABLE | Delivery item. Evidence needed: the PR body text. |
| P3-1 | Collapsible tree | — | OUT OF SCOPE | Not built, as decided. |
| P3-2 | Graph view + Tree/Graph switch | — | OUT OF SCOPE | `view.*` / `graph.*` keys left unused (`blast.json:21-30`). |
| P3-3 | Prior PRs touching these files | — | OUT OF SCOPE | |
| P3-4 | Crons separate from HTTP endpoints | server `server/src/modules/blast/helpers.ts:51-63`; client `PRC/BlastRadius/BlastRadius.tsx:34,77-90`, `PRC/BlastRadius/styles.ts:71-86` | PASS | Tests `helpers.test.ts:90-100`, `BlastRadius.test.tsx:92-103`. |
| P3-5 | Symbols sorted by `rank` | `server/src/modules/blast/helpers.ts:23-24,50,67`; test `helpers.test.ts:128-149` | PASS | Client keeps response order, no sort (`BlastRadius.tsx:49,56`). |
| P3-6 | Resync button next to the marker | — | OUT OF SCOPE | |
| P3-7 | Labels from `blast.json`, not hard-coded | `PRC/BlastRadius/BlastRadius.tsx:28-53`; `client/messages/en/blast.json:2-26` | PASS | Every string in the block goes through `t()`. `OverviewTab.tsx:25` has a literal `Description` label outside the block. |
| L04-1 | Exactly five tools, no `list_prs` / `list_repos` | `devdigest-mcp/src/index.ts:13-17`; `tools/list-agents.ts:13`, `run-agent-on-pr.ts:57`, `get-findings.ts:31`, `get-conventions.ts:19`, `get-blast-radius.ts:16` | PASS | Five `registerTool` calls in `src/`, no others. |
| L04-2 | Four read tools `readOnlyHint: true`; write tool not | `tools/list-agents.ts:17`, `get-findings.ts:40`, `get-conventions.ts:24`, `get-blast-radius.ts:21`, `run-agent-on-pr.ts:66` | PASS | `run_agent_on_pr` sets `readOnlyHint: false`. |
| L04-3 | `run_agent_on_pr` blocks up to 120 s, returns findings; timeout → "still running" + next step | `devdigest-mcp/src/tools/run-agent-on-pr.ts:22-52`; `devdigest-mcp/src/constants.ts:3-4`; tests `run-agent-on-pr.test.ts:21-51` | PASS | The 120 s is counted as the sum of sleep intervals, not wall clock (`:50-51`); see deviation 3. |
| L04-4 | Every §3 failure is `isError: true` with its hint | `devdigest-mcp/src/errors.ts:11-33,42-59`; test `devdigest-mcp/src/errors.test.ts:16-50` | PASS | All eight messages match the spec text. |
| L04-5 | No import from server / client / reviewer-core; HTTP only; package files created by npm | `devdigest-mcp/src/api-client.ts:16-19,32`; `devdigest-mcp/tsconfig.json:1-17`; `devdigest-mcp/package-lock.json:1-20` | PARTIAL | Import and HTTP part holds: no match for `@devdigest/shared`, `server/src`, `client/src`, `reviewer-core` in `src/**`, `tsconfig.json`, `package.json`. Missing: proof that npm produced the two files. needs runtime check: `npm ci` in `devdigest-mcp/` succeeds against the lockfile. |
| L04-6 | In root `.mcp.json`; own start command; absent from `scripts/dev.sh` | `.mcp.json:2-7`; `devdigest-mcp/package.json:7` | PASS | Searched `scripts/` for `mcp`, case-insensitive: no match. |
| L04-7 | Only protocol frames on stdout | `devdigest-mcp/src/index.ts:10,20`; `devdigest-mcp/src/errors.ts:57` | PARTIAL | No `console.log` or `process.stdout` in `src/**`; both logs use `console.error`. needs runtime check: start `devdigest-mcp/node_modules/.bin/tsx devdigest-mcp/src/index.ts` and confirm stdout is empty before the first request. |
| L04-8 | Root `AGENTS.md` has the row and ≤ 80 lines; package `AGENTS.md` ≤ 60 | `AGENTS.md:14` (file ends at line 80); `devdigest-mcp/AGENTS.md:1-44` | PASS | Root is exactly at the 80-line budget, not the 78 the spec planned. |
| L04-9 | README from-zero run guide | `devdigest-mcp/README.md:19-72` | PASS | Prerequisites `:21`, install `:24-29`, API `:31-36`, start `:38-43`, Inspector `:45-52`, `.mcp.json` / Claude Code `:54-64`. |
| S-1 | Route loads PR files itself through the function `GET /pulls/:id` uses; `GET /pulls/:id` as before | `server/src/modules/blast/service.ts:34-46`; `server/src/modules/_shared/pull-detail.ts:15-60`; `server/src/modules/pulls/routes.ts:8,243-244`; test `blast.it.test.ts:161-171` | PARTIAL | One shared function, both callers use it, GitHub untouched when rows exist (`blast.it.test.ts:148`). Missing: confirmation that `GET /pulls/:id` is unchanged. needs runtime check: `git diff server/src/modules/pulls/routes.ts` and the existing pulls tests. |
| S-2 | No rows and no way to load → 200, empty, `degraded: true`, `no_data` | `server/src/modules/blast/service.ts:8-14,43-51`; test `blast.it.test.ts:173-186` | PASS | |
| S-3 | Each reachable reason (`flag_off`, `index_partial`, `no_data`) and `full` unit-tested | `server/src/modules/repo-intel/service.ts:223-237,325-328`; `server/test/repo-intel-blast-reasons.test.ts:67-112` | PASS | No test claims `index_failed` or `repo_too_large` occur. |
| S-4 | Cap-per-symbol test reads the constant, not `20` | `server/test/repo-intel-blast-reasons.test.ts:3,117-138` | PASS | A keeps the cap, B keeps both; facts come only from kept files (`:136-138`). |
| S-5 | Module layout; registered in `modules/index.ts`; no `repository.ts` | `server/src/modules/index.ts:12,38`; `server/src/modules/blast/routes.ts:13-26` | PASS | `modules/blast/` holds exactly `routes.ts`, `service.ts`, `helpers.ts`, `helpers.test.ts`. |
| S-6 | `BlastDegradedReason` + `BlastRadiusResponse` in both copies, identical; `BlastRadius` / `PrBrief` untouched | `server/src/vendor/shared/contracts/brief.ts:46-55`; `client/src/vendor/shared/contracts/brief.ts:46-55` | PASS | The two files are line-for-line identical (134 lines each). |
| S-7 | 404 unknown PR, 422 malformed id | `server/src/modules/blast/service.ts:31-32`; `server/src/modules/blast/routes.ts:20`; tests `blast.it.test.ts:188-196` | PASS | |
| S-8 | `toBlastRadius` test list of the spec is complete | `server/src/modules/blast/helpers.test.ts:18-43,56-69,71-88,102-108,110-126,128-157,159-178,181-197` | PASS | Includes `BlastRadius.parse` (`:42,168`) and `buildSummary` zero / singular / plural. |
| S-9 | One log line `blast: served { prId, repoId, degraded, reason, symbols, callers, ms }` | `server/src/modules/blast/service.ts:82-85` | PASS | All seven fields present; not asserted by any test. |
| C-1 | Counted strings are ICU plurals | `client/messages/en/blast.json:16-19,25-26` | PASS | No `(s)` form remains. |
| C-2 | States table: loading, error, no symbols, no callers, map, marker above the applicable row | `PRC/OverviewTab/OverviewTab.tsx:30-39`; `PRC/BlastRadius/BlastRadius.tsx:30-47` | PARTIAL | All six states render. Missing: the marker is placed below the stats row (`:37` after `:30-35`), while the spec puts it above the row, which includes the stats row. |
| C-3 | Hook key `["blast", prId]`; `BlastRadius` holds no data hook | `client/src/lib/hooks/blast.ts:9-15`; `client/src/lib/hooks/index.ts:11`; `PRC/BlastRadius/BlastRadius.tsx:21-24` | PASS | |
| C-4 | `REASON_KEYS` total over five reasons; `degraded` with null reason falls back to `no_data` | `PRC/BlastRadius/constants.ts:4-13`; `PRC/BlastRadius/BlastRadius.tsx:24`; test `BlastRadius.test.tsx:145-148` | PASS | |
| C-5 | Client tests assert strings from the imported JSON, never typed | `PRC/BlastRadius/BlastRadius.test.tsx:5,41-47,60-64` | PARTIAL | Missing in one test: `BlastRadius.test.tsx:171-173` types `"1 caller"`, `"1 symbol"`, `"1 cron"` literally. |
| C-6 | Showcase fixture; `pages.md` Overview row | `client/src/components/showcase/constants.ts:90-115`; `client/src/components/showcase/Showcase.tsx:382-396`; `client/specs/pages.md:297,318` | PASS | |
| M-1 | `get_conventions` returns accepted only, no skill fallback | `devdigest-mcp/src/tools/get-conventions.ts:9-15`; `devdigest-mcp/src/format.ts:46-53`; test `get-conventions.test.ts:13-28` | PASS | `/skills` is asserted never called. |
| M-2 | `get_blast_radius` makes one call, to the blast route | `devdigest-mcp/src/tools/get-blast-radius.ts:10-11`; test `get-blast-radius.test.ts:22-26` | PASS | Call log is exactly `GET /repos`, `GET /repos/r1/pulls`, `GET /pulls/p-uuid/blast`. |
| M-3 | Package layout of spec §1, incl. `CLAUDE.md` → `AGENTS.md` | `devdigest-mcp/package.json:5-22`; `devdigest-mcp/tsconfig.json:2-16`; `devdigest-mcp/src/index.ts:1-20` | PARTIAL | Scripts, deps, ESM / strict / noEmit and all listed source files are present. Missing: I could not confirm `CLAUDE.md` is a symlink (Glob does not list it, git status does). needs runtime check: `ls -l devdigest-mcp/CLAUDE.md`. |
| M-4 | Agent id always from `GET /agents`; path segments URL-encoded | `devdigest-mcp/src/tools/run-agent-on-pr.ts:25-27`; `devdigest-mcp/src/api-client.ts:22`; tests `run-agent-on-pr.test.ts:33-34,53-58` | PASS | |
| M-5 | Tool input schemas as specified | `tools/get-blast-radius.ts:20`; `tools/run-agent-on-pr.ts:61-65`; `tools/get-findings.ts:35-39`; `tools/get-conventions.ts:23` | PASS | |
| M-6 | Root `AGENTS.md` edits and `/spec` package list | `AGENTS.md:3,14,24,72`; `.claude/commands/spec.md:3,8` | PASS | |
| M-7 | MCP test files of the spec list exist and assert the cases | `devdigest-mcp/src/api-client.test.ts:9-21`; `resolve.test.ts:7-58`; `errors.test.ts:15-50`; `format.test.ts:7-34`; `tools/run-agent-on-pr.test.ts:20-51`; `tools/get-blast-radius.test.ts:21-44`; `tools/get-conventions.test.ts:12-28` | PASS | |
| M-8 | No CI workflow for `devdigest-mcp` (decision) | `.github/workflows/` holds `client.yml`, `e2e-web.yml`, `server-integration.yml`, `server-unit.yml`, `reviewer-core.yml` only | PASS | Matches the decision. |

## Summary

**The implementation matches the specs with no missing criterion, but 8 of the 56 items are only partly confirmed, so not every P1 is PASS yet.** Counts: 41 PASS, 8 PARTIAL, 0 MISSING, 4 OUT OF SCOPE, 3 NOT VERIFIABLE. Of the P1 items, P1-1, P1-2, P1-3, P1-5 and P1-6 are PASS; P1-7 is PARTIAL because it needs a live Claude Code check; P1-4 and P1-8 are stand and delivery items. Five of the eight PARTIALs (P1-7, P2-1, L04-5, L04-7, M-3) have their code in place and wait only on a runtime check. One (S-1) needs a diff of `pulls/routes.ts` to confirm the extraction changed nothing. Two (C-2, C-5) are real, small gaps between spec and code.

## Gaps

- **P1-7** — connect `devdigest` in Claude Code, call `get_blast_radius` on the test PR, and compare the output with the Overview block.
- **P2-1** — call `GET /pulls/:id/blast` on an indexed repo and show the `blast: served` log line with no indexer, git or ast-grep lines around it.
- **L04-5** — show that `npm ci` in `devdigest-mcp/` succeeds against the committed lockfile.
- **L04-7** — start the server by the `.mcp.json` command and show stdout is empty outside protocol frames.
- **S-1** — show via `git diff server/src/modules/pulls/routes.ts` and the existing pulls tests that `GET /pulls/:id` behaves as before.
- **C-2** — render the degraded marker above the stats row in `PRC/BlastRadius/BlastRadius.tsx` (it is now at `:37`, after `:30-35`).
- **C-5** — in `PRC/BlastRadius/BlastRadius.test.tsx:171-173`, build the three expected strings from `messages` as the rest of the file does.
- **M-3** — show `devdigest-mcp/CLAUDE.md` is a symlink to `AGENTS.md`.

## Spec-vs-code deviations

1. **Zero-file PR skips the facade.** When the refresh succeeds but the PR has no files, the service returns `no_data` without calling `getBlastRadius` (`server/src/modules/blast/service.ts:48-51`). Spec §2 step 3 says the facade is called exactly once; with the flag off the reason would then be `flag_off`.
2. **Fallback path is uncapped.** The ripgrep path used for `flag_off` and for `no_data` with a clone applies no `MAX_CALLERS_PER_SYMBOL` (`server/src/modules/repo-intel/service.ts:263-306`). The cap exists only on the persistent path (`:383-389`). The spec wording ties the cap to "after the rank sort", so this is consistent but not stated.
3. **120 s is not wall clock.** `run_agent_on_pr` adds up sleep intervals only (`devdigest-mcp/src/tools/run-agent-on-pr.ts:43-51`); each poll can itself take up to `REQUEST_TIMEOUT_MS` = 15 s (`devdigest-mcp/src/constants.ts:6`), so real blocking can exceed 120 s.
4. **MCP review and run schemas are stricter than the API contract.**
   - `ReviewRow` requires `agent_id` and `agent_name` as strings (`devdigest-mcp/src/schemas.ts:47-48`); the API allows null (`server/src/vendor/shared/contracts/review-api.ts:26,28`).
   - `RunRow.status` is a required string (`schemas.ts:31`); the API allows null (`server/src/vendor/shared/contracts/trace.ts:120`).
   - One such row makes the whole list fail as `bad_response` (`devdigest-mcp/src/api-client.ts:58-61`) in `get_findings` and `run_agent_on_pr`.
5. **Root `AGENTS.md` is 80 lines**, not the 78 the spec planned; the lock-file sentence is wrapped over `:71-75`.
6. **Facade tests live in `server/test/`** (`server/test/repo-intel-blast-reasons.test.ts`), not under `modules/repo-intel/` as the spec's Tests section names.
7. **README step 2 path.** It tells the reader to run `./scripts/dev.sh` right after `cd devdigest-mcp` in step 1 (`devdigest-mcp/README.md:27,34`); that path only resolves from the repo root.
8. **`get_blast_radius` drops `changed_symbols`.** Output lists only symbols that have callers (`devdigest-mcp/src/format.ts:59`); the rest appear only in the `summary` count. This matches the spec's return shape.

## Unplanned changes

- `devdigest-mcp/src/schemas.ts:1-82` | API response shapes file, not in the spec §1 layout (the package's own `AGENTS.md` documents it).
- `devdigest-mcp/src/mock-api.ts:1-39` | fetch stub for tests, not in the spec layout.
- `devdigest-mcp/src/constants.ts:6` | `REQUEST_TIMEOUT_MS`, a per-request timeout the spec does not list.
- `devdigest-mcp/src/errors.ts:55,58` | two extra generic error messages (other API error, unexpected exception).
- `devdigest-mcp/src/tools/get-findings.test.ts`, `devdigest-mcp/src/tools/list-agents.test.ts` | tests beyond the spec list (not opened).
- `devdigest-mcp/docs/api-map.md` | extra doc (not opened).
- `server/README.md:79` | blast node added to the module diagram.
- `server/src/modules/blast/service.ts:44` | warn log `blast: PR files refresh skipped`, a second log line beyond the one in §2.5.
- `client/src/components/showcase/Showcase.tsx:388-394` | a second showcase instance (degraded variant); the spec asks for one fixture.
