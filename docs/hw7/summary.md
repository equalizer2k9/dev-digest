# HW7 summary — Multi-Agent Review (A) and Export to CI (B)

| | A · Multi-Agent Review | B · Export to CI |
|---|---|---|
| Tokens: fresh in / cache read / out | 830k / 12.6M / ≈108k | 732k / 10.9M / ≈109k |
| `/run-plan` wall-clock | 24.9 min (11:19:07–11:44:02) | 20.2 min (11:19:15–11:39:25) |
| Runs overlapped | 20.2 min — B ran entirely inside A | |
| Commits (feature + review fixes + live-check fixes + docs) | 7 | 7 + merge with A |
| Review: CRITICAL / major → closed | arch 2 / 3 → 5 closed; security 0 | arch 1 / 4 → 5 closed; security 0 |
| Live-check bugs (fixed, a test each) | 4 (trace drawer without findings, originals without author, section title, column cost "$0.000" — [#29](https://github.com/equalizer2k9/dev-digest/pull/29)) | 1 (cost < $0.001 shown as "$0.000") |
| PR | [#24](https://github.com/equalizer2k9/dev-digest/pull/24) | [#27](https://github.com/equalizer2k9/dev-digest/pull/27) |

**What went wrong.** The worktree fan-out never happened: both `/run-plan` sessions wrote to the main working copy, which breaks the single-writer rule. The sessions stepped around each other's files and committed in turns, so 7 commits interleaved on one local branch. B's gate even ran over A's uncommitted code. I split the commits with cherry-pick: conflicts in 4 files on A, 2 on B, and the 6 expected shared files when B merged with A. Every resolution was checked line by line (mixed version = base + A lines + B lines). Next time: `git worktree add` per feature before `/run-plan`, and `run-plan` refuses a copy with another session's uncommitted changes.

| 1 vs 3 agents, PR #21 (PR #24) | General alone | General + Security + Performance |
|---|---|---|
| Wall-clock | 39.9 s | 76.9 s (slowest agent; sum 155.5 s) |
| Tokens in / out | 5 007 / 2 429 | 16 886 / 9 707 |
| Cost | $0.00138 | $0.00245 |

CI run on test PR #26 (PR #27): $0.00049714, 14.2 s, 1 critical, check red, merge blocked by the ruleset; the key is in neither the log nor the artifact.

**Track C** ([#28](https://github.com/equalizer2k9/dev-digest/pull/28)): the mentor's follow-ups (case modal, per-case Run/Edit, dashboard link). Dispatch 0/2 → 2/2 after rewording `architecture-reviewer`. The `eval:repeat` summary counted `!isError` instead of the case assertion, so it showed HW6 dispatch as 2/2 when the real result was 0/2; fixed, and rescoring the stored records matches the traces.

Час рев'ю людини: ≈ 74 хв (оцінка з логів сесій: проміжки між відповіддю агента й наступним промтом, без перерв > 30 хв; включає читання звітів і PR та координацію паралельних треків — за фічами не розкладається)

**Takeaways.**
1. Three agents cost 1.8× one, not 3×, and take 1.9× the time: wall-clock is set by the slowest agent (Security, 76.9 s), and provider-side cost per run varied 2× at similar token counts.
2. The parallel runs cost nothing in tokens (A + B ≈ 1.56M fresh vs 1.07M for one HW5 run), but merging them cost a split, 12 conflicted file resolutions and a re-run of every gate. Isolation is cheaper than reconciliation.
3. Live checks found 5 bugs that 1 018 + 668 green tests missed, all in the UI wiring. One was the same "$0.000" in two features, because three copies of the cost formatter existed; #29 merges them into `lib/cost.ts`. Each bug now has a test.
