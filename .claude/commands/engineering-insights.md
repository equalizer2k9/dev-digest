---
description: Capture non-obvious insights into the module INSIGHTS.md (or review one)
argument-hint: [what happened] | review <server|client|reviewer-core|e2e|root>
---

Arguments: $ARGUMENTS

Read `.claude/skills/engineering-insights/SKILL.md` and follow it.

- Arguments start with `review` → review mode: follow `maintenance.md` for the named module.
- Other arguments → treat them as the finding to capture; still run the gate before writing.
- No arguments → sweep this session against the skill's "When to write" table, then write what
  passes the gate. Nothing passes → say so and write nothing.
