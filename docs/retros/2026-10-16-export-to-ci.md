# Retro — `/run-plan` Export to CI (HW7, part B), 2026-10-16

Mode **deep**, session `bfebf839`, window 11:19:15–11:39:25 UTC (the whole session: one `/run-plan`).
Output marked ≈ is a lower bound (88 of 169 requests had no final usage record).

| | |
|---|---|
| Tokens: fresh in / cache read / out | 732k / 10.9M / ≈109k (169 requests, peak context 138k) |
| Tool calls | 272 |
| Wall / main active / agents busy | 20.2 min / 14.5 min / 14.8 min (parallelism factor 1.57) |
| Agents (order) | implementer (T-S1 contracts) → implementer (server) ∥ implementer (client) → architecture-reviewer → security-reviewer → implementer (fix, server) ∥ implementer (fix, client) → architecture-reviewer (re-review) → plan-verifier ∥ plan-verifier |

| Agent | Duration | Requests | Fresh in / cache read / out | Share | Peak ctx |
|---|---|---|---|---|---|
| implementer (contracts) | 1.3 min | 8 | 27k / 165k / ≈3k | 2% | 31k |
| implementer (server) | 7.0 min | 35 | 131k / 3.05M / ≈26k | 27% | 135k |
| implementer (client) | 5.7 min | 32 | 103k / 2.02M / ≈20k | 18% | 108k |
| architecture-reviewer | 0.9 min | 7 | 52k / 193k / 6k | 2% | 52k |
| security-reviewer | 1.1 min | 10 | 47k / 283k / 6k | 3% | 50k |
| implementer fix (server) ∥ (client) | 0.9 / 0.7 min | 6 / 5 | 24k / 109k / ≈2k · 14k / 64k / ≈1k | 1% / 1% | 29k / 19k |
| architecture-reviewer (re-review) | 0.5 min | 5 | 21k / 72k / 2k | 1% | 25k |
| plan-verifier (server) ∥ (client) | 3.2 / 2.0 min | 16 / 12 | 112k / 1.17M / 12k · 88k / 739k / 7k | 11% / 7% | 112k / 88k |
| main | — | 33 | 112k / 3.06M / 25k | 27% | 138k |

## Findings

- **Single writer broken.** This run shared the working copy with part A (session `2d601210`) for its whole 20.2 min. The report notes that the server checks "ran on a working tree that also held the parallel Part A session's uncommitted edits", and the client test count after the fix round (80 files / 659 tests) included Part A's tests. Splitting the commits needed conflict resolution in 2 shared files on B's side, and 6 more on the final merge.
- **Heavy main thread.** Main was active for 14.5 of 20.2 min (27% of tokens, 138k peak). It read `spec.md` itself, and so did 3 agents (`spec.md` ≈7.1k tokens × 4).
- **Duplicated context.** `plan.md` (≈14k tokens) was read by 4 actors (30.8k repeated); `ci/service.ts` by 5. 79k tokens repeated in all.
- Parallelism was already used where the plan allowed (contracts first, then server ∥ client, fix ∥ fix, verifier ∥ verifier). Security after architecture is sequential by design.

## Actions

1. Same as part A: one worktree per `/run-plan`; `run-plan` refuses a working copy with foreign uncommitted changes. Moves: gate results that include the other feature's code → 0.
2. The main thread passes AC IDs and file lists to reviewers and verifiers instead of reading `spec.md` itself. Moves: main share 27% → < 20%, `spec.md` reads 4 → 3.
3. Verifiers get the plan's traceability table and their AC slice, not `plan.md` whole. Moves: `plan.md` repeated reads (30.8k tokens).
