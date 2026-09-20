---
description: Scaffold a feature spec in <package>/specs/ before implementing
argument-hint: <server|client|reviewer-core> <feature-name>
---

Create a spec: $ARGUMENTS

1. Package must be `server`, `client` or `reviewer-core`. For `e2e`, the flow JSON is the spec —
   write `e2e/specs/NN-name.flow.json` instead (see `e2e/CLAUDE.md`). Ask if the package is unclear.
2. Read `<package>/CLAUDE.md` and `<package>/specs/README.md`; make sure no spec for this feature exists.
3. Write `<package>/specs/<feature-name>.md` (kebab-case) from the template below. Fill in only what
   is known from the conversation and the code; mark unknowns `TBD` — never invent requirements.
4. Add a row to the table in `<package>/specs/README.md` with status `draft`.
5. Do not implement. Ask the user to review the spec.

Template:

```markdown
# <Feature name>

**Status:** draft · **Package:** <package> · **Date:** <YYYY-MM-DD>

## Problem
Who hits what, and why it matters.

## Goals / non-goals

## Behaviour
User-visible flow, step by step. Edge cases.

## Contracts & data
Only what changes: Zod contracts (`@devdigest/shared` — both copies), routes, DB tables /
migrations, `messages/en/<ns>.json`, reviewer prompt slots.

## Acceptance criteria
- [ ] …

## Tests
Which suite covers it: server unit / `*.it.test.ts` / client component / reviewer-core / e2e flow.

## Open questions
```
