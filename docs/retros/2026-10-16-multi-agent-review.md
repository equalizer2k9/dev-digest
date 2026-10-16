# Retro — `/run-plan` Multi-Agent Review (HW7, part A), 2026-10-16

Mode **deep**, session `2d601210`, window 11:19:07–11:44:02 UTC (the whole session: one `/run-plan`).
Output marked ≈ is a lower bound (79 of 158 requests had no final usage record).

| | |
|---|---|
| Tokens: fresh in / cache read / out | 830k / 12.6M / ≈108k (158 requests, peak context 158k) |
| Tool calls | 247 |
| Wall / main active / agents busy | 24.9 min / 10.8 min / 21.7 min (parallelism factor 1.64) |
| Agents (order) | implementer (server) → implementer (client) → architecture-reviewer → security-reviewer → architecture-reviewer (re-review) → plan-verifier ∥ plan-verifier |

| Agent | Duration | Requests | Fresh in / cache read / out | Share | Peak ctx |
|---|---|---|---|---|---|
| implementer (server, resumed for the fix round) | 19.3 min (8.4 active) | 34 | 255k / 2.71M / ≈26k | 22% | 135k |
| implementer (client) | 10.5 min | 42 | 154k / 4.23M / ≈30k | 33% | 158k |
| architecture-reviewer | 0.6 min | 6 | 39k / 153k / 4k | 1% | 43k |
| security-reviewer | 0.8 min | 6 | 42k / 147k / 4k | 1% | 45k |
| architecture-reviewer (re-review) | 0.4 min | 4 | 16k / 52k / 2k | 1% | 21k |
| plan-verifier (server) ∥ (client) | 1.8 / 2.0 min | 17 / 17 | 100k / 1.15M / 9k · 104k / 1.21M / 8k | 9% / 10% | 104k / 108k |
| main | — | 32 | 119k / 2.95M / 25k | 23% | 142k |

## Findings

- **Single writer broken (outside the JSON, from git).** Part B's `/run-plan` (session `bfebf839`) ran in the same working copy at the same time: 11:19:15–11:39:25, fully inside this run's 11:19:07–11:44:02, so the two overlapped for 20.2 min. Both sessions avoided each other's files and committed in turns. Seven commits interleaved on one local branch, and splitting them took cherry-picks with conflicts in 4 shared files on A's side.
- **Overloaded role.** The client implementer took 33% of all tokens at a 158k peak context in 42 requests (signal: ≥ 40 requests).
- **Missed parallelism.** The client group started at 11:27:55, after the server group, because it needed the server's contract copy. B split contracts into a short first step and ran server ∥ client.
- **Duplicated context.** `plan.md` (≈11.7k tokens) was read 6 times by 4 actors (42.8k tokens repeated); `spec.md` 3 times. 80k tokens repeated in all.

## Actions

1. `run-plan`: refuse to start when the working copy has another session's uncommitted changes, and tell the user to start the run in `git worktree add ../<feature>`. Moves: overlapping writers 2 → 1, cherry-pick conflicts 4 → 0.
2. Plan a "contracts" task first (both `vendor/shared` copies), then run server ∥ client implementers. Moves: agents-busy time of the implementers (19.3 + 10.5 min sequential → max of the two).
3. Hand each implementer only its own task rows of `plan.md` plus the traceability table, not the whole plan. Moves: `plan.md` repeated reads (42.8k tokens) and the client implementer's 158k peak.
