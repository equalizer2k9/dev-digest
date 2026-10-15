# Workflow retro ledger

One row per multi-agent run, appended by `/workflow-retro` (never rewritten — this is a trend).
Tokens: fresh in = input + cache write; cache read = context re-read on every request.
`≈` = part of the output was estimated from the logged content (a lower bound).

| Date | Feature | Mode | Tokens: fresh in / cache read / out | Tool calls | Agents (order) | Duration: wall / active | Actions |
|---|---|---|---|---|---|---|---|
| 2026-10-11 | PR Brief (HW5), `/run-plan` | deep | 760k / 13.8M / ≈93k | 191 | 4: implementer → architecture-reviewer → architecture-reviewer → plan-verifier | 44 min / 28 min | 1. Start `/run-plan` in a fresh session: the main thread ran at a 274k context and took 51% of all tokens (7.1M cache read in 31 requests). 2. Split the implementer by package (server, client): one agent carried all tasks, hit its turn limit at a 192k context and took 41%. 3. Review round 2 reads the fix diff, not the 15 files again, and the main thread checks the plan's traceability table instead of reading the plan whole (the plan, 12.8k tokens, was read in full by three actors). |
| 2026-10-14 | Project Context Folder (HW5), `/run-plan` | deep | 1.07M / 28.8M / ≈169k | 363 | 7: implementer (server) ∥ implementer (client, bg) → architecture-reviewer → security-reviewer → architecture-reviewer (bg) ∥ security-reviewer (bg) → plan-verifier | 32 min / 22 min | 1. Split `plan-verifier` into two parallel runs, server ACs and client ACs (`run-plan.md` step 4): one verifier reached a 208k peak context in 45 requests (20% of tokens), hit its 30-turn limit and its resume took 4.1 min. 2. Raise `implementer` `maxTurns` 40 → 60: both group implementers hit the 40-turn limit (server: 213k peak, 69 requests, 28%; client: 163k peak, 49 requests, 18%). 3. Disable the MCP servers and plugins the pipeline never calls for this project: the main thread (30%) started at 57k context on request 0 and re-read it across 69 requests. |
