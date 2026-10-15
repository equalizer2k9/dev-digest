# specs

Cross-package feature specs, one folder per feature: `specs/<feature>/spec.md` (written by the
`spec-creator` agent — behaviour and EARS acceptance criteria `AC-n`, no implementation detail) and
next to it `specs/<feature>/plan.md` (produced by the `implementation-planner` agent — tasks
`T-n`, each traced to its AC and its test). A feature that lives in one package keeps its spec in
`<pkg>/specs/` instead. Every spec carries a `Spec ID: SPEC-NN` and a `Status`: `draft` (written,
may still hold `[NEEDS CLARIFICATION]`) → `approved` (the user reviewed it and every clarification
is closed; only now may it be planned and passed to `/run-plan`) → `implemented` (the plan-verifier
matrix has no MISSING row, and every PARTIAL row has its decision recorded under Deviations in the
plan).

| Spec | ID | Status | Summary |
|---|---|---|---|
| [pr-brief](pr-brief/spec.md) | SPEC-01 | approved | PR Why + Risk Brief: one grounded model call over computed PR facts — including the PR intent when the Intent Layer has stored one (AC-31 to AC-33, added 2026-10-12) — stored per PR with the head SHA; a brief block on Overview whose entries open the file and line on Files changed. [Plan](pr-brief/plan.md) · [verification](../docs/hw5/plan-verification.md) — AC-13 and AC-22 are PARTIAL, with reasons. Amended 2026-10-13 by SPEC-02 (AC-34 to AC-36: attached project-context documents), not yet implemented. |
| [project-context](project-context/spec.md) | SPEC-02 | approved | Project Context Folder: `.md` documents under `specs/`, `docs/`, `insights/` of a repository's clone, attached by hand to agents and skills (an agent inherits its skills'), given to the reviewer as untrusted data in `## Project context` within 8 000 tokens and to the PR Brief within its budget; documents read and skipped are recorded in the run trace. |
