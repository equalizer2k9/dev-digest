---
name: workflow-retro
description: "Retrospective of one multi-agent workflow run (e.g. /run-plan): tokens, tool calls, duration, agent order, parallelism, nested subagents, duplicated context, overloaded roles, extra rounds — then one row in docs/retros/ledger.md. Invoke ONLY when the user runs /workflow-retro. Never invoke it on your own initiative."
argument-hint: "[deep] [session=<id>] [from=<ISO>] [to=<ISO>] [feature=<name>]"
version: 1.0.0
disable-model-invocation: true
allowed-tools: Bash, Read, Edit, Write
---

# Workflow retro

Measures a finished multi-agent run from the session logs Claude Code keeps on disk and turns the
numbers into three concrete changes. The numbers come from `scripts/collect.mjs` (Node, no
dependencies, read-only) — never estimate them from memory of the conversation.

Arguments: `$ARGUMENTS`

| Argument | Meaning |
|---|---|
| `deep` | Also read `<session>/subagents/agent-*.jsonl`, nested agents included. Without it only the parent log is read |
| `session=<id>` | Session to analyse. Default: the newest one of this project (the current session) |
| `from=` / `to=` | ISO timestamps bounding the run inside the session. Default: the whole session |
| `feature=<name>` | Name for the ledger row. Default: taken from the run's first prompt |

**Why `deep` exists.** The parent log knows a subagent only through the result of its `Agent`
call, and that result carries the usage of ONE request — the agent's final context size, not what
it spent. A background agent reports nothing at all. Without `deep`, agent tokens are therefore
missing from the totals; say so in the output and do not present the parent-only total as the cost
of the run.

## Steps

1. **Find the run.** All commands run from the repo root.

   ```bash
   node .claude/skills/workflow-retro/scripts/collect.mjs --list
   node .claude/skills/workflow-retro/scripts/collect.mjs --session <id> --prompts
   ```

   A session usually holds more than the run (spec work before, fixes after). Bound the run with
   `--from` = the timestamp of the prompt that started it (e.g. the `/run-plan` command) and
   `--to` = the timestamp of the next user prompt. If the user gave no window and the session has
   several prompts, pick the window of the workflow command and state which one you picked.

2. **Collect.**

   ```bash
   node .claude/skills/workflow-retro/scripts/collect.mjs --session <id> --from <ISO> --to <ISO> [--deep]
   ```

   The JSON has: `totals` (tokens, tool calls, agents, nested agents), `main`, `agents[]` in start
   order (type, depth, background, duration, active time, hand-backs, tokens, tools, share of all
   tokens, and `reportedTokens` — what the parent log claimed), `order`, `rounds`, `parallelism`,
   `duplicatedContext` (deep only).

   Token fields: `input` + `cache_write` = fresh input; `cache_read` = context re-read on every
   request; `output`; `peak_context` = the largest single request. `output_estimated_requests` > 0
   means some messages have no final usage record in the log and their output was estimated from
   the logged content — report output as "≈, lower bound" then.

3. **Look for waste.** Check each of these against the JSON and keep only what the numbers show:

   | Pattern | Signal in the JSON |
   |---|---|
   | Duplicated context | `duplicatedContext.files`: the same file read by 2+ actors, or 3+ times; large `approxTokensRepeated`. A spec or plan read in full by the main thread AND by every agent |
   | Overloaded role | One agent with `shareOfTokens` ≥ 0.35, `peak_context` ≥ 150 000, `requests` ≥ 40, or a hand-back caused by a turn limit |
   | Heavy main thread | `main.shareOfTokens` ≥ 0.3 or `main.tokens.peak_context` ≥ 150 000 — the run was started in a session that already carried earlier work |
   | Extra rounds | `rounds[type]` > 1, `handbacks` > 1; a later round re-reading the files of the earlier one instead of the fix diff |
   | Missed parallelism | `parallelism.factor` near 1.0 while the order holds agents that do not depend on each other (two read-only reviewers one after another) |
   | Idle time | `window.wallClockMs` far above main `activeMs` + agent `busyMs`: find the gap in the timeline and name what it waited for |
   | Nested agents | `totals.nestedAgents` > 0: list who spawned whom (`agents[].spawned`, `depth`) and what it cost |

   When a number needs explaining (what a round was for, what the gap waited on), read that part
   of the log — the collector tells you where. Do not explain a number you have not looked up.

4. **Choose three actions.** Each one names the change, the place to make it (a command file, an
   agent definition, a habit), and the number it is expected to move. No general advice
   ("optimise context"); if the run shows fewer than three real problems, say so and list fewer.

5. **Report in chat**, in this order: mode and window; headline numbers (fresh input, cache read,
   output, tool calls, wall-clock and active time, agents and their order); a table of agents
   (type, duration, requests, tokens, share, peak context); findings from step 3 with their
   numbers; the three actions. In parent-only mode, the first line says agent tokens are missing.

6. **Append one row to `docs/retros/ledger.md`** (create the file from the header below if it is
   missing). Never rewrite or reorder earlier rows — the ledger is a trend. One row per run:

   ```markdown
   | Date | Feature | Mode | Tokens: fresh in / cache read / out | Tool calls | Agents (order) | Duration: wall / active | Actions |
   |---|---|---|---|---|---|---|---|
   ```

   `Date` is the date of the run, not of the retro. `Mode` is `deep` or `parent-only`. Tokens in
   thousands (`760k / 13.8M / ≈93k`). `Actions` holds the three actions, numbered, one short
   clause each. If an earlier row is for the same kind of workflow, add one sentence in chat on how
   the numbers moved and whether the previous row's actions were applied.

Do not commit; the user decides.
