# Agents

Project subagents for the feature pipeline. Each file is Markdown with YAML frontmatter
([format](https://code.claude.com/docs/en/sub-agents)); the body is the agent's system prompt.

```
researcher → planner → implementer → ( architecture-reviewer ∥ test-writer )
           → security-reviewer → plan-verifier → doc-writer
```

| Agent | Role | Tools | Model | Input | Output |
|---|---|---|---|---|---|
| [researcher](researcher.md) | Answers a question with evidence before planning — repo research or external sources; asks first when the question is vague | Read, Grep, Glob, WebSearch, WebFetch | sonnet | A question about the code or about outside sources | Report: findings → evidence (`file:line` or URL) → what was not found |
| [planner](planner.md) | Turns requirements into a Development Plan; asks clarifying questions first when the task is vague | Read, Grep, Glob | opus | Requirements doc or feature request (+ researcher's report) | Development Plan: goal, numbered AC, files, ordered steps, skills for the implementer, risks |
| [implementer](implementer.md) | Executes the approved plan in `server/` and `client/`; loads the matching skills; runs typecheck + tests | Read, Grep, Glob, Edit, Write, Bash | sonnet | Approved Development Plan | Code + tests, and a report: steps, check results, deviations, open items |
| [architecture-reviewer](architecture-reviewer.md) | Reviews layer boundaries, file placement, coupling, leaking abstractions, both `vendor/shared` copies | Read, Grep, Glob | sonnet | Changed-file list (+ plan) | Findings `file:line \| CRITICAL/WARNING/SUGGESTION \| what is wrong \| evidence` + verdict |
| [test-writer](test-writer.md) | Writes tests from the spec's acceptance criteria, not from the implementer's code; test paths only | Read, Grep, Glob, Edit, Write, Bash | sonnet | Spec or plan with numbered AC + changed-file list | Test files, and a report: `AC \| test file:line \| PASS/FAIL/NOT COVERED`, failures, blocked AC, checks |
| [security-reviewer](security-reviewer.md) | Reports only exploitable problems: untrusted input in prompts, secrets in logs, SSRF on link fetching, excess permissions | Read, Grep, Glob | sonnet | Changed-file list (+ spec or plan) | Findings `file:line \| severity \| what is wrong \| evidence \| how to exploit` + verdict |
| [plan-verifier](plan-verifier.md) | Checks the code against every plan step and AC | Read, Grep, Glob | opus | Development Plan + requirements | Matrix `requirement \| evidence file:line \| PASS/PARTIAL/MISSING` + gaps |
| [doc-writer](doc-writer.md) | Turns the spec and plan of a finished feature into documentation with a Mermaid diagram; `docs/` only | Read, Grep, Glob, Edit, Write | sonnet | Spec + plan + changed-file list | A page under `docs/` or `<pkg>/docs/`, and a report: files, spec-vs-code differences |

- Writers: implementer (anywhere it is planned to), test-writer (test paths), doc-writer
  (`docs/`). The other five are read-only by tool list — no Edit, Write or Bash.
- test-writer and doc-writer are confined by a `PreToolUse` hook in their frontmatter:
  [`../hooks/restrict-write-paths.mjs`](../hooks/restrict-write-paths.mjs) rejects `Edit` /
  `Write` outside `*.test.ts(x)`, `__tests__/`, `e2e/specs/*.flow.json` (mode `tests`) or outside
  `*.md` / `*.mmd` in `docs/`, `<pkg>/docs/` (mode `docs`). It is an allowlist, resolves symlinks
  before matching, and refuses manifests, lock files, configs, dot-folders, `node_modules` and
  `server/clones/`. The hook does
  not see `Bash`: for the test-writer's shell the path rule is a prompt rule only.
- No agent has the `Agent` tool — no nested delegation. The main session runs the pipeline and
  passes each agent's output to the next.
- `maxTurns`: researcher 30 · planner 50 · implementer 40 · architecture-reviewer 25 ·
  test-writer 40 · security-reviewer 25 · plan-verifier 30 · doc-writer 25.
- The reviewers and the verifier have no shell, so they cannot run `git diff`: hand them the
  changed-file list.
- researcher is the only agent with network access (WebSearch, WebFetch); it does not use
  `/deep-research`.
