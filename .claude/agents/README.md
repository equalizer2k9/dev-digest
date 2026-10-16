# Agents

Project subagents. Each file is Markdown with YAML frontmatter
([format](https://code.claude.com/docs/en/sub-agents)); the body is the agent's system prompt.
Nine agents, two ways to run them.

**Feature pipeline (L03)** — every step is started by the main session:

```
researcher → implementation-planner → implementer → ( architecture-reviewer ∥ test-writer )
           → security-reviewer → plan-verifier → doc-writer
```

**Spec-driven pipeline (SDD)** — the spec and the plan are written and approved one at a time,
then [`/run-plan`](../commands/run-plan.md) drives the rest:

```
spec-creator → implementation-planner → /run-plan ( implementer per package → architecture-reviewer → security-reviewer → ≤2 fix rounds → plan-verifier )
   spec.md            plan.md                                                                       docs/<hw>/plan-verification.md
```

The two share the planner, the implementer, both reviewers and the verifier. In the SDD pipeline
the implementer writes the tests the plan's tasks name; `researcher`, `test-writer` and
`doc-writer` are not part of `/run-plan` and are added by hand when the feature calls for them —
tests derived from the acceptance criteria rather than from the code, a page under `docs/`.

How `/run-plan` runs them, after the retro of its first run
([`docs/retros/ledger.md`](../../docs/retros/ledger.md)):

- **Two implementers, by package** — `server/` + `reviewer-core/` and `client/` — in parallel when
  the plan's tasks do not depend on each other across the groups. One agent for the whole plan hit
  its turn limit at a 192k context.
- **`security-reviewer` after `architecture-reviewer`**; CRITICAL and WARNING of both go into the
  same fix rounds (at most 2).
- **A re-review reads the fix**: the reviewer's own findings plus the files and line ranges of the
  fix commit, not the feature again.
- **The main session never reads the plan whole** — only the section the current step needs.

| Agent | Role | Tools | Model | Input | Output |
|---|---|---|---|---|---|
| [spec-creator](spec-creator.md) | Turns a request into a feature spec; clarifies across 6 categories — blocking questions first, the rest inline as `[NEEDS CLARIFICATION]`; behaviour only, in English | Read, Grep, Glob, Write | opus | Requirements doc or feature request | `specs/<feature>/spec.md`: EARS acceptance criteria `AC-n`, provenance, untrusted inputs, self-check result |
| [researcher](researcher.md) | Answers a question with evidence before planning — repo research or external sources; asks first when the question is vague | Read, Grep, Glob, WebSearch, WebFetch | sonnet | A question about the code or about outside sources | Report: findings → evidence (`file:line` or URL) → what was not found |
| [implementation-planner](implementation-planner.md) | Turns an approved spec into a plan; never clarifies requirements — an unplannable spec comes back as `BLOCKED` | Read, Grep, Glob | opus | Approved spec (+ researcher's report) | Plan text for `specs/<feature>/plan.md`: tasks `T-n` → AC-ID → test, traceability table, files, skills, risks |
| [implementer](implementer.md) | Executes the approved plan in `server/` and `client/`; loads the matching skills; runs typecheck + tests | Read, Grep, Glob, Edit, Write, Bash | sonnet | Approved spec + plan | Code + tests, and a report: steps, check results, deviations, open items |
| [architecture-reviewer](architecture-reviewer.md) | Reviews layer boundaries, file placement, coupling, leaking abstractions, both `vendor/shared` copies | Read, Grep, Glob | sonnet | Changed-file list (+ plan), or a plan / design before code | Findings `file:line \| CRITICAL/WARNING/SUGGESTION \| what is wrong \| evidence` + verdict |
| [test-writer](test-writer.md) | Writes tests from the spec's acceptance criteria, not from the implementer's code; test paths only | Read, Grep, Glob, Edit, Write, Bash | sonnet | Spec or plan with numbered AC + changed-file list | Test files, and a report: `AC \| test file:line \| PASS/FAIL/NOT COVERED`, failures, blocked AC, checks |
| [security-reviewer](security-reviewer.md) | Reports only exploitable problems: untrusted input in prompts, secrets in logs, SSRF on link fetching, excess permissions | Read, Grep, Glob | sonnet | Changed-file list (+ spec or plan) | Findings `file:line \| severity \| what is wrong \| evidence \| how to exploit` + verdict |
| [plan-verifier](plan-verifier.md) | Checks the code against every plan task and AC | Read, Grep, Glob | opus | Spec + plan + requirements | Matrix `requirement \| evidence file:line \| PASS/PARTIAL/MISSING` + gaps |
| [doc-writer](doc-writer.md) | Turns the spec and plan of a finished feature into documentation with a Mermaid diagram; `docs/` only | Read, Grep, Glob, Edit, Write | sonnet | Spec + plan + changed-file list | A page under `docs/` or `<pkg>/docs/`, and a report: files, spec-vs-code differences |

- Who can write: `spec-creator` — only the spec file (it has `Write`, no `Edit`, no shell);
  `implementer` — code and tests; `test-writer` — test paths; `doc-writer` — `docs/`. The other
  five are read-only by tool list, so the main session saves the planner's output as `plan.md` and
  writes the review and verification reports.
- `test-writer` and `doc-writer` are confined by a `PreToolUse` hook in their frontmatter:
  [`../hooks/restrict-write-paths.mjs`](../hooks/restrict-write-paths.mjs) rejects `Edit` /
  `Write` outside `*.test.ts(x)`, `__tests__/`, `e2e/specs/*.flow.json` (mode `tests`) or outside
  `*.md` / `*.mmd` in `docs/`, `<pkg>/docs/` (mode `docs`). It is an allowlist, resolves symlinks
  before matching, and refuses manifests, lock files, configs, dot-folders, `node_modules` and
  `server/clones/`. The hook does not see `Bash`: for the test-writer's shell the path rule is a
  prompt rule only.
- Cross-package specs and plans live in [`specs/<feature>/`](../../specs/README.md); single-package
  specs stay in `<pkg>/specs/`.
- No agent has the `Agent` tool — no nested delegation. The main session runs the pipeline and
  passes each agent's output to the next.
- `maxTurns`: spec-creator 40 · researcher 30 · implementation-planner 50 · implementer 60 ·
  architecture-reviewer 25 · test-writer 40 · security-reviewer 25 · plan-verifier 30 ·
  doc-writer 25.
- The reviewers and the verifier have no shell, so they cannot run `git diff`: hand them the
  changed-file list.
- `/run-plan` severity mapping, both reviewers: `CRITICAL` → CRITICAL, `WARNING` → major,
  `SUGGESTION` / `INFO` → minor/nit.
  Only CRITICAL and major are fixed (at most 2 rounds); minor/nit are shown to the user.
- `researcher` is the only agent with network access (WebSearch, WebFetch); it does not use
  `/deep-research`.
