# HW5 cost report

**Build cost** — two `/run-plan` runs, measured by `/workflow-retro deep` (`docs/retros/ledger.md`):

| Run | Tokens: fresh in / cache read / out | Tool calls | Agents | Wall / active | Main-session share |
|---|---|---|---|---|---|
| PR Brief, 2026-10-11 | 760k / 13.8M / ≈93k | 191 | 4 | 44 / 28 min | 51%, peak 274k |
| Project Context, 2026-10-14 | 1.07M / 28.8M / ≈169k | 363 | 7 | 32 / 22 min | 30%, peak 189k |

**Applied after the first retro** (shown by the second row):
- fresh session for `/run-plan`;
- one implementer per package, server ∥ client;
- re-review on the fix diff only.

The second feature was larger (16 tasks, 104 files, a security review and two parallel re-reviews), so its token total rose. Even so, the main-session share fell from 51% to 30% and wall time from 44 to 32 min.

**Applied after the second retro** (`29ffbe0`):
- two parallel plan-verifiers;
- implementer `maxTurns` 40 → 60;
- unused MCP servers off for this project.

**Runtime cost.** All features run on `openrouter / deepseek/deepseek-v4-flash` (`risk_brief`, `review_intent` and the agents' own model). Each call is one request.

| Call | When | Measured |
|---|---|---|
| PR Brief | per Generate / Refresh | 903 input tokens on PR #16, 1,165 on PR #19 (with one attached document); budget 8,000 |
| Intent classifier | the first review of a PR with no intent | PR #19: 522 in / 1,144 out, $0.00023 |
| Review with the attached document | per agent run | PR #19, General Reviewer: 2,526 in / 1,659 out, $0.00048; the document added 175 tokens and no extra call |
