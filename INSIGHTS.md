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

## Recurring Errors & Fixes
<!-- Exact error text → real cause → fix -->

- **2026-09-20** · Studio on :3000 shows `Could not load skills.` and `net::ERR_CONNECTION_REFUSED` on `localhost:3101`
  - Cause: `scripts/e2e.sh` runs `next dev -p 3100` from the same `client/` dir, so its `NEXT_PUBLIC_API_BASE=http://localhost:3101` is compiled into the shared `client/.next` the dev server keeps serving.
  - Fix: kill the dev client BY PID, `rm -rf client/.next`, restart `./scripts/dev.sh`.
  - Evidence: `scripts/e2e.sh:42` · `scripts/e2e.sh:148`
  - Seen again 2026-10-07: killing only the client ends `dev.sh` but orphans the API (`tsx watch` child) on :3001 — kill it by PID too before restarting.

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
