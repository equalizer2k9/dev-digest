# server/specs

One spec per feature, written BEFORE implementation. Create with `/spec server <feature-name>`.
File name: `<feature-name>.md` (kebab-case). A feature spanning packages gets its spec in the
package that owns the core logic; other packages link to it from their own table.

Status: `draft` → `approved` → `implemented`.

| Spec | Status | Summary |
|---|---|---|
| [run-cost-badge](run-cost-badge.md) | implemented | Persist per-run USD cost on `agent_runs`; surface it across the PR list, the runs timeline, the review-runs accordion, the verdict plaque and the Run Trace sidebar, per the design bundle. |
