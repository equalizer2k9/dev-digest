# client/specs

One spec per feature, written BEFORE implementation. Create with `/spec client <feature-name>`.
File name: `<feature-name>.md` (kebab-case). A feature spanning packages gets its spec in the
package that owns the core logic; other packages link to it from their own table.

Status: `draft` → `approved` → `implemented`.

| Spec | Status | Summary |
|---|---|---|
| run-cost-badge → [`server/specs/run-cost-badge.md`](../../server/specs/run-cost-badge.md) | implemented | Client half: `RunCostBadge` primitive ported from the design's `CostBadge`; `COST` column after `STATUS` in the PR list, `N tok · $0.0013` in the runs timeline, badge in the review-runs accordion, cost under the score ring on the verdict plaque, `COST` stat in the Run Trace sidebar. |
| [`findings-severity-counters.md`](findings-severity-counters.md) | implemented | Two rows in each review run's `FindingsPanel` toolbar: read-only per-severity counter pills above, three always-present filter chips below. Clicking a chip filters that run's findings to that severity, clicking it again clears. Client-side derivation, no API change. |
| [`pages.md`](pages.md) | implemented | Route-by-route contract for every page under `src/app`: server vs. client, params read, the hook each route uses and the API endpoint + method behind it, and its loading / empty / error behaviour. |
