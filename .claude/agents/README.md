# Agents

Project subagents for the spec-driven (SDD) feature pipeline. Each file is Markdown with YAML
frontmatter ([format](https://code.claude.com/docs/en/sub-agents)); the body is the agent's system
prompt.

```
spec-creator → implementation-planner → /run-plan ( implementer → architecture-reviewer → ≤2 fix rounds → plan-verifier )
   spec.md            plan.md                                                    docs/<hw>/plan-verification.md
```

The first two are run by hand, one at a time, and the user approves each artifact before the next
step. [`/run-plan`](../commands/run-plan.md) takes the approved spec and plan and drives the rest.

| Agent | Role | Tools | Model | Input | Output |
|---|---|---|---|---|---|
| [spec-creator](spec-creator.md) | Turns a request into a feature spec; clarifies across 6 categories — blocking questions first, the rest inline as `[NEEDS CLARIFICATION]`; behaviour only, in English | Read, Grep, Glob, Write | opus | Requirements doc or feature request | `specs/<feature>/spec.md`: EARS acceptance criteria `AC-n`, provenance, untrusted inputs, self-check result |
| [implementation-planner](implementation-planner.md) | Turns an approved spec into a plan; never clarifies requirements — an unplannable spec comes back as `BLOCKED` | Read, Grep, Glob | opus | Approved spec | Plan text for `specs/<feature>/plan.md`: tasks `T-n` → AC-ID → test, traceability table, files, skills, risks |
| [implementer](implementer.md) | Executes the approved plan in `server/` and `client/`; loads the matching skills; runs typecheck + tests | Read, Grep, Glob, Edit, Write, Bash | sonnet | Approved spec + plan | Code + tests, and a report: steps, check results, deviations, open items |
| [architecture-reviewer](architecture-reviewer.md) | Reviews layer boundaries, file placement, coupling, leaking abstractions, both `vendor/shared` copies | Read, Grep, Glob | sonnet | Changed-file list (+ plan) | Findings `file:line \| CRITICAL/WARNING/SUGGESTION \| what is wrong \| evidence` + verdict |
| [plan-verifier](plan-verifier.md) | Checks the code against every plan task and AC | Read, Grep, Glob | opus | Spec + plan + requirements | Matrix `requirement \| evidence file:line \| PASS/PARTIAL/MISSING` + gaps |

- Who can write: `spec-creator` — only the spec file (it has `Write`, no `Edit`, no shell);
  `implementer` — code and tests. The other three are read-only by tool list, so the main session
  saves the planner's output as `plan.md` and writes the verification report.
- Cross-package specs and plans live in [`specs/<feature>/`](../../specs/README.md); single-package
  specs stay in `<pkg>/specs/`.
- No agent has the `Agent` tool — no nested delegation. The main session runs the pipeline and
  passes each agent's output to the next.
- `maxTurns`: spec-creator 40 · implementation-planner 50 · implementer 40 ·
  architecture-reviewer 25 · plan-verifier 30.
- The two reviewers have no shell, so they cannot run `git diff`: hand them the changed-file list.
- `/run-plan` severity mapping: `CRITICAL` → CRITICAL, `WARNING` → major, `SUGGESTION` → minor/nit.
  Only CRITICAL and major are fixed (at most 2 rounds); minor/nit are shown to the user.
- There is no `test-writer`: the implementer writes the tests the plan's tasks name.
