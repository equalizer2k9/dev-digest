# INSIGHTS — e2e/

Non-obvious knowledge from past sessions — read before a non-trivial change here.
Written by the `engineering-insights` skill. Append-only: add to the end of a section, never edit
or delete; cleanup only via `/engineering-insights review e2e`.

## What Works
<!-- Approaches that worked where the obvious one failed -->

## What Doesn't Work
<!-- Dead ends and antipatterns, each with what to do instead -->

- **2026-10-07** · NEVER `find text … click` a PR-list row without a `wait --text` on that row first.
  - Why: `wait --url /pulls` resolves before the rows render — the list request first attempts a GitHub sync.
  - Evidence: `04-pr-findings` then `05-pr-diff` failed at `open the PR row` (7/8) · `specs/02-repo-pulls-detail.flow.json:7` has the wait

## Codebase Patterns
<!-- Undocumented conventions and architectural decisions, with the reason -->

## Tool & Library Notes
<!-- Dependency and tooling quirks, with the version -->

## Recurring Errors & Fixes
<!-- Exact error text → real cause → fix -->

- **2026-09-20** · `sh: 1: tsx: not found` from `./scripts/e2e.sh`, and the script still exits 0.
  - Cause: `e2e/node_modules` is missing (no workspace — each package installs its own), so no flow ever runs while the stack-up logs all look green.
  - Fix: `cd e2e && npm ci`, then re-run `./scripts/e2e.sh`.
  - Evidence: `scripts/e2e.sh` runs `npm test` → `tsx run.ts`; the log's last lines are `running e2e flows` then straight to `tearing down`
  - Seen again 2026-09-20: `npm ci` clears this one and uncovers the next gate — `spawn agent-browser ENOENT`, 0/7 flows, because the CLI is a GLOBAL one-time install (`npm i -g agent-browser && agent-browser install`, downloads Chrome for Testing) that `npm ci` cannot provide. Both failures exit 0.

- **2026-10-07** · `spawn agent-browser ENOENT` on every step, 0/8 flows, although `agent-browser` is installed.
  - Cause: the global CLI sits in the bin of the nvm Node it was installed under (`v24.3.0`), not the active one (`v24.21.0`).
  - Fix: `AGENT_BROWSER_BIN=~/.nvm/versions/node/v24.3.0/bin/agent-browser ./scripts/e2e.sh`
  - Evidence: `run.ts:40` · `ls -d ~/.nvm/versions/node/*/bin/agent-browser`

## Session Notes
<!-- ### YYYY-MM-DD — task: outcome, sections that got entries, what stayed open -->

### 2026-09-20 — verifying Run Cost Badge in a browser
- Done: found `./scripts/e2e.sh` reports success without running a single flow when `e2e/node_modules` is absent.
- Added: Recurring Errors & Fixes.
- Open: the script should fail loudly instead of exiting 0 — not fixed here. Browser flows stayed unrun on this machine (no `agent-browser` binary).

### 2026-10-07 — hermetic e2e green for the HW2 PR
- Done: `./scripts/e2e.sh` 8/8 after adding the row wait to flows 04 and 05.
- Added: What Doesn't Work, Recurring Errors & Fixes.

## Open Questions
<!-- Unverified hypotheses and unanswered questions; close with a "Resolved" sub-bullet -->
