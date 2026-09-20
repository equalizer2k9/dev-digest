# server/specs

One spec per feature, written BEFORE implementation. Create with `/spec server <feature-name>`.
File name: `<feature-name>.md` (kebab-case). A feature spanning packages gets its spec in the
package that owns the core logic; other packages link to it from their own table.

Status: `draft` → `approved` → `implemented`.

| Spec | Status | Summary |
|---|---|---|
| [review-flow](review-flow.md) | implemented | Behaviour contract of the full review cycle: `POST /pulls/:id/review` → validation → background orchestration → context assembly → run lifecycle → SSE → persisted reviews, findings, run row and trace, plus the failure modes the code handles. |
| [run-cost-badge](run-cost-badge.md) | implemented | Persist per-run USD cost on `agent_runs`; surface it across the PR list, the runs timeline, the review-runs accordion, the verdict plaque and the Run Trace sidebar, per the design bundle. |
| [skills-lab](skills-lab.md) | draft | Skills Lab, server half: `/skills` CRUD + version snapshots + restore, `.md`/`.zip` import with a persist-nothing preview, `agent_count`, and the path that turns an agent's ordered enabled skills into a token-measured block of the assembled prompt + run trace. Criteria 6–37 coverage table lives here. |
