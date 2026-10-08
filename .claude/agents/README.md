# Agents

Project subagents for the feature pipeline. Each file is Markdown with YAML frontmatter
([format](https://code.claude.com/docs/en/sub-agents)); the body is the agent's system prompt.

```
planner → implementer → ( architecture-reviewer ∥ plan-verifier )
```

| Agent | Role | Tools | Model | Input | Output |
|---|---|---|---|---|---|
| [planner](planner.md) | Turns requirements into a Development Plan; asks clarifying questions first when the task is vague | Read, Grep, Glob | opus | Requirements doc or feature request | Development Plan: goal, numbered AC, files, ordered steps, skills for the implementer, risks |
| [implementer](implementer.md) | Executes the approved plan in `server/` and `client/`; loads the matching skills; runs typecheck + tests | Read, Grep, Glob, Edit, Write, Bash | sonnet | Approved Development Plan | Code + tests, and a report: steps, check results, deviations, open items |
| [architecture-reviewer](architecture-reviewer.md) | Reviews layer boundaries, file placement, coupling, leaking abstractions, both `vendor/shared` copies | Read, Grep, Glob | sonnet | Changed-file list (+ plan) | Findings `file:line \| CRITICAL/WARNING/SUGGESTION \| what is wrong \| evidence` + verdict |
| [plan-verifier](plan-verifier.md) | Checks the code against every plan step and AC | Read, Grep, Glob | opus | Development Plan + requirements | Matrix `requirement \| evidence file:line \| PASS/PARTIAL/MISSING` + gaps |

- Only the implementer can write or run anything; the other three are read-only by tool list.
- No agent has the `Agent` tool — no nested delegation. The main session runs the pipeline and
  passes each agent's output to the next.
- `maxTurns`: planner 30 · implementer 40 · architecture-reviewer 25 · plan-verifier 30.
- The two reviewers have no shell, so they cannot run `git diff`: hand them the changed-file list.
