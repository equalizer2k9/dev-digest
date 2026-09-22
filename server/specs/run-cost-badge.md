# Run Cost Badge

**Status:** implemented · **Package:** server (+ client) · **Date:** 2026-09-20

Cross-package feature; core logic (capture + persist + serve) is owned by `server`, so the spec
lives here. `client/specs/README.md` links to it.

**Design source of truth:** `docs/DevDigest Design (standalone).html` — a bundled React design
canvas. The relevant artboards are `dashboard` ("Pull Requests · Run Review + auto-status + Cost"),
`pr-runs` ("PR Detail · Agent runs") and `trace-hist` ("Run Trace · completed"). Their sources are
gzip+base64 resources inside the bundle's `__bundler/manifest` script tag; decoded, the files that
matter are `primitives.jsx` (`CostBadge`), `screen_dashboard.jsx`, `prdetail_runs.jsx`,
`findings.jsx` (`VerdictBanner`) and `screen_trace.jsx`. Every markup detail below is quoted from
them.

## Problem

A review run costs real money, but nothing in the UI says how much. A user kicks off runs on a PR,
re-runs them after a push, compares two agents — and has no idea whether that cost $0.002 or $0.40.
The number already exists: every LLM adapter returns `costUsd` on each call and
`ReviewOutcome.costUsd` carries it back to the server. It is discarded at exactly one line
(`server/src/modules/reviews/run-executor.ts:213`, which destructures `tokensIn, tokensOut,
grounding` and drops `costUsd`).

This is a re-instatement, not a new capability: cost was removed end-to-end by commit `d45ab0d`
("feat(reviews): remove per-PR/run cost, keep model pricing"), which also dropped the
`agent_runs.cost_usd` column in migration `0009`. Everything below that cut — adapters,
`pricing.ts`, `price-book.ts`, DI wiring, `mocks.ts`, reviewer-core — was left intact. The removed
drawer stat matched the design exactly, so step 6 of the trace surface is a literal restore.

## Goals / non-goals

**Goals**
- Persist the USD cost of every completed run on `agent_runs`.
- Surface it on **four** places across the three design artboards, each with the design's own
  markup (they are deliberately not identical):
  1. PR list — `COST` column;
  2. PR detail → Agent runs → Timeline — `N tok · $0.0013` line under the timestamp;
  3. PR detail → Agent runs → Review runs — cost badge in the accordion header;
  4. PR detail verdict plaque — cost under the score ring; and the Run Trace sidebar — `COST` stat.
- One reusable primitive, `RunCostBadge`, ported 1:1 from the design's `CostBadge`.
- Zero extra model calls — the value rides along with the existing review request.

**Non-goals**
- Budgets, caps, alerts, or a spend dashboard.
- Back-filling cost for runs that already exist (they stay `null` → render `—`).
- The other things the `dashboard` artboard shows that the client does not have yet — the
  `Findings` column, the per-row `RunReviewDropdown`, `AutoTriggerStatus on={true}`. They sit next
  to the `Cost` column in the design but are separate features.
- The Compose Review drawer's "this review cost $X" line (`screen_pr_detail.jsx:86`) — a fifth cost
  surface in the design, on a screen the client does not have.
- Touching the model-pricing catalog (`ModelInfo.pricing`, the `$/1M` labels in model pickers) or
  the eval/CI cost paths.

## Behaviour

**Capture.** When a run finishes, `run-executor` takes `outcome.costUsd` and writes it via
`completeAgentRun`. OpenRouter reports the real generation cost (`usage.cost`, already requested
via `usage: { include: true }`); OpenAI/Anthropic fall back to `estimateCost` from the static
pricing table or the live `PriceBook`. An unknown model yields `null` — not `0`.
`ReviewOutcome.costUsd` is null-poisoned by design: if any chunk of a multi-chunk review has no
price, the whole run's cost is `null`.

Failed and cancelled runs write `cost_usd: null`.

### The primitive — `RunCostBadge`

Ported verbatim from `primitives.jsx:137-146` (there named `CostBadge`, exported from the
design's primitive barrel next to `ConfidenceNum`). The lab brief calls it `RunCostBadge` with
"2 види"; those two kinds are the design's two call shapes — with and without `tokens`.

```jsx
function RunCostBadge({ usd, tokens, size = "sm", muted }) {
  if (usd == null)
    return <span className="mono" style={{ fontSize: size === "lg" ? 13 : 12, color: "var(--text-muted)" }}>—</span>;
  const fs = size === "lg" ? 13 : 11.5;
  const fmt = usd < 1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
  return (
    <span className="mono tnum" title="Cost of this review"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: fs,
               color: muted ? "var(--text-muted)" : "var(--text-secondary)", fontWeight: 500 }}>
      {fmt}
      {tokens && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>{tokens}</span>}
    </span>
  );
}
```

Notes that matter:
- It is **not** built on `Badge` — it is a bare `<span className="mono tnum">`. No border, no pill.
- `tokens` is a **pre-formatted string**, produced at the call site as
  `` `${(tokens_in/1000).toFixed(1)}K→${(tokens_out/1000).toFixed(1)}K` `` (`findings.jsx:99`).
- The two parts are separated by `gap: 6`, **not** by a `·`. The lab slide writes
  "$0.014 · 8.2K→1.3K" as shorthand; the design renders `$0.014  8.2K→1.3K`.
- `usd == null` → `—`. Never `$0.00` for missing data.

### Screen 1 — PR list (`/repos/:repoId/pulls`)

`screen_dashboard.jsx:101-117`. The design's header row is
`["Pull request", "Author", "Size", "Score", "Findings", "Status", "Cost", "", "Updated"]` over
`gridTemplateColumns: "1fr 116px 78px 54px 116px 100px 76px 118px 72px"`.

So **`COST` comes after `STATUS`**, not after `SCORE`. Its track is `76px`, left-aligned (only the
last column, `Updated`, is right-aligned: `textAlign: i === 8 ? "right" : "left"`).

The client has no `Findings` column and no per-row Run-Review cell, so it keeps its own widths and
only inserts the cost track in the same relative position:
`COLUMN_KEYS = [pullRequest, author, size, score, status, cost, updated]`,
`GRID = "1fr 132px 92px 60px 118px 76px 78px"`.

Cell content: `<RunCostBadge usd={pr.cost_usd} />` (`screen_dashboard.jsx:82` —
`React.createElement("div", null, React.createElement(window.CostBadge, { usd: pr.cost }))`, no
wrapper style). Design mock values `0.014 / 0.041 / 0.003` render as `$0.014 / $0.041 / $0.003`.

Data: the **latest** run's cost — the most recent `agent_runs` row for that PR with a non-null
`cost_usd`, `ran_at desc`. Mirrors the existing latest-review `score` lookup in
`pulls/routes.ts:114-155`: computed on read, one extra `IN`-query, no denormalisation.

### Screen 2 — PR detail → Agent runs → Timeline

`prdetail_runs.jsx:79-95` (`TimelineRun`). The design does **not** use the badge here. The
right-hand meta column is:

```jsx
<div style={{ textAlign: "right", flexShrink: 0 }}>
  <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{r.time}</div>
  {!r.error && (
    <div className="mono tnum" style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>
      {r.tokens.toLocaleString()} tok · ${r.cost.toFixed(4)}
    </div>
  )}
</div>
```

So: a second line under the timestamp, `9,119 tok · $0.0013` — thousands-separated token count,
the literal ` tok · `, and cost at **four** decimals. Error runs render the timestamp only.

The design's mock `tokens` is a single number that happens to equal `tokens_in`. We render
`tokens_in + tokens_out`, which is what "N tok" means for a real run. Runs with a null cost render
the token count and `—` in place of the dollar figure; runs with neither render the timestamp only.

### Screen 3 — PR detail → Agent runs → Review runs

`prdetail_runs.jsx:117-131` (`ReviewRunCard` header). The right-hand cluster, in order:

`score (mono tnum, colour-coded)` → **`<CostBadge usd={run.cost} />`** → `time` → `trace` link →
delete → chevron.

The client's `ReviewRunAccordion` header already has that cluster minus the badge; the badge goes
between the score badge and the timestamp. Design mock `0.0013` → `$0.001`.

### Screen 4a — the verdict plaque

`findings.jsx:86-100` (`VerdictBanner`). The cost is **not** in the title row — it hangs under the
score ring, in the right-hand score column, behind a divider:

```jsx
<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
  <CircularScore score={score} size={52} stroke={5} />
  <span style={{ fontSize: 10.5, color: "var(--text-muted)", letterSpacing: "0.04em" }}>PR SCORE</span>
  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5, paddingTop: 6,
                borderTop: "1px solid var(--border)" }}>
    <Icon.DollarSign size={11} style={{ color: "var(--text-muted)" }} />
    <RunCostBadge usd={costUsd} tokens={`${(tokensIn/1000).toFixed(1)}K→${(tokensOut/1000).toFixed(1)}K`} />
  </div>
</div>
```

With the design's `VERDICT` data (`cost 0.014`, `tokens_in 8200`, `tokens_out 1300`) that reads
`$0.014  8.2K→1.3K` — the slide's headline example.

In the design this is the PR-level plaque on the Overview tab; in the client `VerdictBanner` is
rendered per review run by `ReviewRunAccordion`, which is the closest faithful mapping (every
review has a run behind it). The plaque nested *inside* the design's `ReviewRunCard`
(`prdetail_runs.jsx:135-146`) has no cost — only a score — so if the client ever grows a second
plaque, cost belongs on the outer one.

### Screen 4b — Run Trace sidebar

`screen_trace.jsx:95-97`: the Stats section renders
`stat("DURATION", …), stat("TOKENS", …), stat("COST", "$" + T.stats.cost.toFixed(2)), stat("FINDINGS", …)`.

`COST` is the **third** tile, between TOKENS and FINDINGS, using the drawer's own `Stat` tile (not
the badge). This is a literal restore of what `d45ab0d` deleted from `TraceBody.tsx:66` and
`formatCost` from `RunTraceDrawer/helpers.ts`, both of which already matched the design.

**Deviation from the design, agreed with the user.** The design's `toFixed(2)` renders a real
`$0.0013` run as `$0.00` — the one thing the lab brief forbids, and every design mock sits in the
`$0.001…$0.04` range where it fires. The restored `formatCost` therefore uses the badge's rule:

```ts
/** USD cost or "—". */
export function formatCost(usd: number | null | undefined): string {
  return usd == null ? "—" : usd < 1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
}
```

Two changes from the `d45ab0d` original: 3 decimals under $1, and `—` instead of `n/a` for null
(the design's own null rendering).

## Contracts & data

Every contract below lives in **two diverged copies** — `server/src/vendor/shared/` and
`client/src/vendor/shared/` — and must be edited in both (root CLAUDE.md).

| Where | Change |
|---|---|
| `contracts/trace.ts` → `RunStats` | `+ cost_usd: z.number().nullable()` (restores `d45ab0d`) |
| `contracts/trace.ts` → `RunSummary` | `+ cost_usd: z.number().nullable()` (restores `d45ab0d`) |
| `contracts/review-api.ts` → `ReviewRecord` | `+ cost_usd`, `+ tokens_in`, `+ tokens_out`, all `.nullable()` — new; feeds the accordion header and the plaque |
| `contracts/platform.ts` → `PrMeta` | `+ cost_usd: z.number().nullish()` — PR total across successful priced runs, list endpoint only |

`RunSummary` already carries `tokens_in` / `tokens_out`, so the timeline needs no new field beyond
`cost_usd`.

**DB.** New migration `0010_*` re-adds the column dropped by `0009`:
`ALTER TABLE "agent_runs" ADD COLUMN "cost_usd" double precision;`
Generated with `pnpm db:generate` after adding `costUsd: doublePrecision('cost_usd')` to
`src/db/schema/runs.ts` — never hand-write the SQL, the snapshot, or `meta/_journal.json`
(server/CLAUDE.md "Do not touch"). Type precedent: `eval_runs.cost_usd`, `ci_runs.cost_usd`.

**Server code.**
- `run-executor.ts` — restore `costUsd` in the destructure at `:213`, in all **three**
  `completeAgentRun` call sites (`:243` success, `:297` per-agent failure, `:76` `failAll`) and in
  both `RunTrace` builders (`:264` success stats, `:424` `traceFromBuffer`).
- `repository.ts:155` + `repository/run.repo.ts:146` — `costUsd: number | null` back in the
  `completeAgentRun` signature and `.set()`.
- `repository/run.repo.ts:59` — `cost_usd: run.costUsd` back in the `listRunsForPull` mapping.
- `repository/review.repo.ts:58 reviewsForPull` — `leftJoin` `agent_runs` on
  `agentRuns.id = reviews.runId` (`reviews.run_id` has **no FK** and is nullable → a review with no
  matching run must yield nulls, not vanish). Thread `costUsd`/`tokensIn`/`tokensOut` through
  `service.ts:160` → `helpers.ts:55 reviewToDto` → `ReviewDto`.
- `modules/pulls/routes.ts` — after the latest-review `score` block (`:114-131`), a sibling
  latest-priced-run lookup; emit `cost_usd` in the row mapping at `:133-157`.

**Client code.**
- New primitive `client/src/vendor/ui/primitives/RunCostBadge.tsx`, exported from the
  `@devdigest/ui` barrel, markup exactly as above. Colours only via CSS vars. Must be added to
  `src/components/showcase/Showcase.tsx` (both kinds — with and without `tokens`, plus the `null`
  case) per client/CLAUDE.md.
- PR list: `pulls/constants.ts` — `"cost"` into `COLUMN_KEYS` after `"status"`, `GRID` →
  `"1fr 132px 92px 60px 118px 76px 78px"`; `PRRow.tsx` — a bare cell with the badge.
- `RunHistory.tsx:198` — the `tok · $` second line in the existing right-aligned meta column.
- `ReviewRunAccordion.tsx:101-108` — the badge between the score badge and `formatWhen(...)`.
- `VerdictBanner.tsx` — optional `costUsd` / `tokensIn` / `tokensOut` props; the divider + icon +
  badge block appended to `s.scoreCol`. `ReviewRunAccordion.tsx:140` passes them from the
  `ReviewRecord`. The whole score column currently renders only when `score != null`; the cost
  block must survive a null score, so that guard needs splitting.
- `TraceBody.tsx:66` — restore the `COST` `Stat` as the third tile, and `formatCost` in
  `RunTraceDrawer/helpers.ts`.
- The existing `formatTokens` (`helpers.ts:26`, lowercase `12k→1.5k`) stays as the TOKENS stat's
  formatter — the design's trace row uses exactly that. The plaque's `8.2K→1.3K` is a different
  formatter and lives with the badge.

**i18n.**
- `client/messages/en/runs.json` — restore `trace.stat.cost: "COST"`.
- `client/messages/en/prReview.json` — add `list.columns.cost: "COST"`.
- The badge's `title="Cost of this review"` also becomes a message key.

**reviewer-core:** no changes.

## Acceptance criteria

- [ ] `agent_runs.cost_usd` exists again; `pnpm db:migrate` on a fresh DB runs `0000…0010` clean.
- [ ] A completed run persists a non-null `cost_usd` when the model is priced, `null` when not.
- [ ] `GET /pulls/:id/runs` returns `cost_usd`; `GET /runs/:id/trace` returns `stats.cost_usd`;
      `GET /pulls/:id/reviews` returns `cost_usd`/`tokens_in`/`tokens_out`; `GET /repos/:id/pulls`
      returns the SUM of `cost_usd` over that PR's successful (`status = 'done'`) priced runs,
      and `null` when the PR has none.
- [ ] PR list: `COST` column sits **after** `STATUS`, renders `$0.014`, and `—` when unpriced.
- [ ] Timeline row: `9,119 tok · $0.0013` under the timestamp, four decimals; error runs show the
      timestamp only.
- [ ] Review-runs accordion header: badge between the score and the timestamp, `$0.001`.
- [ ] Verdict plaque: divider + `DollarSign` icon + `$0.014  8.2K→1.3K` under `PR SCORE`.
- [ ] Run Trace drawer: `COST` is the third stat tile and a `$0.0013` run reads `$0.001`, not
      `$0.00`.
- [ ] Nothing renders `$0.00` in place of missing data; `null` → `—` everywhere.
- [ ] No additional LLM call anywhere in the feature.
- [ ] Both `vendor/shared` copies carry identical contract edits.

## Tests

- **server unit** — `test/contracts.test.ts`: restore `cost_usd: 0.06` in the `RunStats` fixture
  (`:160`); add the new `ReviewRecord` and `PrMeta` fields.
- **server integration** (`test/reviews.it.test.ts`, Docker; `*.it.test.ts` naming is mandatory) —
  after `waitForPrRuns`, assert the `agent_runs` row carries a non-null `costUsd` (MockLLMProvider
  gives `0.001`) and that runs / trace / reviews / pulls-list all return it. Add a null-cost case.
- **client** — new `RunCostBadge.test.tsx` (with tokens, without, `null` → `—`, `usd >= 1` →
  2 decimals); update the `RunSummary` factory in `RunHistory.test.tsx:16` and the `RunTrace`
  fixture in `RunTraceDrawer.test.tsx:8`; a cost case in `VerdictBanner.test.tsx`; a new
  `ReviewRunAccordion` test (none today) and a `PRRow` test for the cost cell.
- **e2e** — optional; an assertion on the PR-list `COST` cell in an existing flow JSON.

## Open questions

- Resolved: the Run Trace drawer deviates from the design's `toFixed(2)` and uses the badge's
  `< 1 → toFixed(3)` rule, so sub-cent runs never print `$0.00`. This is the feature's only
  intentional departure from the design — flag it in the PR description.
- Resolved: the PR-list column shows the **PR total** — every successful priced run summed, not
  the latest run. (Superseded the first pass, which showed the latest run; the homework criteria
  require the total.) Failed runs and unpriced models contribute nothing; a PR with no priced
  successful run renders `—`, never `$0.00`.
- Resolved: the plaque and the accordion header read **new `ReviewRecord` fields** (server-side
  join), not a client-side join on `run_id`.
- Resolved: cost is **stored** on `agent_runs` at run time, not recomputed on read.
- TBD: whether `reviews.run_id` should gain a real FK to `agent_runs.id`. Out of scope; the
  `leftJoin` tolerates its absence.
