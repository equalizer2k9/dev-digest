# specs

Cross-package feature specs, one folder per feature: `specs/<feature>/spec.md` (written by the
`spec-creator` agent — behaviour and EARS acceptance criteria `AC-n`, no implementation detail) and
next to it `specs/<feature>/plan.md` (produced by the `implementation-planner` agent — tasks
`T-n`, each traced to its AC and its test). A feature that lives in one package keeps its spec in
`<pkg>/specs/` instead. Every spec carries a `Spec ID: SPEC-NN` and a `Status`: `draft` (written,
may still hold `[NEEDS CLARIFICATION]`) → `approved` (the user reviewed it and every clarification
is closed; only now may it be planned and passed to `/run-plan`) → `implemented` (the plan-verifier
matrix has no open row).
