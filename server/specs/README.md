# server/specs

One spec per feature, written BEFORE implementation. Create with `/spec server <feature-name>`.
File name: `<feature-name>.md` (kebab-case). A feature spanning packages gets its spec in the
package that owns the core logic; other packages link to it from their own table.

Status: `draft` → `approved` → `implemented`.

| Spec | Status | Summary |
|---|---|---|
| [review-flow](review-flow.md) | implemented | Behaviour contract of the full review cycle: `POST /pulls/:id/review` → validation → background orchestration → context assembly → run lifecycle → SSE → persisted reviews, findings, run row and trace, plus the failure modes the code handles. |
| [run-cost-badge](run-cost-badge.md) | implemented | Persist per-run USD cost on `agent_runs`; surface it across the PR list, the runs timeline, the review-runs accordion, the verdict plaque and the Run Trace sidebar, per the design bundle. |
| [skills-lab](skills-lab.md) | implemented | Skills Lab, server half: `/skills` CRUD + version snapshots + restore, `.md`/`.zip` import with a persist-nothing preview, `agent_count`, and the path that turns an agent's ordered enabled skills into a token-measured block of the assembled prompt + run trace. Criteria 6–37 coverage table lives here. |
| [conventions-extractor](conventions-extractor.md) | implemented | Conventions Extractor, server half: `POST /repos/:id/conventions/extract` — code-only sample selection (configs + `repoIntel.getConventionSamples`), one structured model call resolved from the `conventions` feature model, evidence verified against the clone, accept / reject / edit with persisted rejection, and accepted rows merged into a `repo-conventions` skill (`source = extracted`) optionally linked to an agent. Criteria 38–53 coverage table lives here. |
| [smart-diff](smart-diff.md) | implemented | Smart Diff, server half: pure `classifyFile(path)` with the rule order and patterns in one constants file (three disputed cases pinned by test), `SmartDiffRole` extended to five values in both `@devdigest/shared` copies, and `GET /pulls/:id/smart-diff` — five role groups in display order with `finding_lines` from each agent's latest review, a minimal `split_suggestion`, no model call. Criteria P1-1 … P3-5 coverage table lives here. |
| [blast-radius](blast-radius.md) | approved | Blast Radius, server half: new `blast` module and `GET /pulls/:id/blast` — the PR's changed files → one `repoIntel.getBlastRadius` call → a pure, unit-tested mapping of flat callers into `downstream` grouped by `viaSymbol` with endpoints / crons from `factsByFile`, a summary built from counts, `degraded` + `reason` computed by the facade (which now also caps callers per symbol); the route loads PR files itself; no model call. Criteria P1-1 … P3-7 coverage table lives here. |
