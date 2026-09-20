---
name: engineering-insights
description: Records non-obvious engineering insights into the INSIGHTS.md of the DevDigest module being worked on (server, client, reviewer-core, e2e, or repo root). Use during any task the moment something surprising is confirmed — a bug's real root cause, a dead end or abandoned approach, a library or tool quirk, a misleading error message, an undocumented convention or architectural decision, a user correction — or when an unverified hypothesis or open question is left behind; also at the end of a task, and when asked to review or prune INSIGHTS.md.
---

# Engineering Insights

`<module>/INSIGHTS.md` is what the next session reads cold before touching that module.
Record only what saves it from re-investigating. Most sessions add nothing — that is correct.

## When to write → which section

| Moment in the session | Section |
|---|---|
| A non-obvious approach worked where the obvious one failed | What Works |
| Dead end, abandoned approach, antipattern — or the user corrected you | What Doesn't Work |
| Undocumented convention or architectural decision, with its reason | Codebase Patterns |
| Dependency or tooling quirk | Tool & Library Notes |
| Error whose message hides the real cause | Recurring Errors & Fixes |
| Task finished and it added ≥1 entry to this file | Session Notes |
| Hypothesis not verified, or question left unanswered | Open Questions |

Write **as soon as the finding is confirmed**, then continue the task. Do not hold entries for
the end: context gets compacted and sessions stop abruptly. A user correction is the strongest
signal — always run it through the gate.

## Where

| The rule is about | File |
|---|---|
| Code in `server/`, `client/`, `reviewer-core/` or `e2e/` | `<package>/INSIGHTS.md` |
| `scripts/`, `.github/`, `docker-compose*`, root config, or several packages equally (e.g. the two `@devdigest/shared` copies) | root `INSIGHTS.md` |

Symptom in one package, rule in another (client shows `undefined`, server dropped the field) →
the package where the next agent must apply the rule.

## Gate — write only if every answer is YES

1. **Non-obvious** — 5 minutes of reading the relevant code would not reveal it.
2. **New** — not in the module's `CLAUDE.md`, `README.md`, `docs/` or `INSIGHTS.md` (grep a key
   term; for root also root `CLAUDE.md`). Already in `INSIGHTS.md` → see Append-only.
3. **Concrete** — names a path, symbol, command, exact error text, version or number.
4. **Actionable cold** — a reader without this session knows what to do or avoid.
5. **Verified** — confirmed by a run, a test or the source. Only #5 fails → Open Questions,
   phrased as a question, never as a fact.
6. **Project-specific** — not general best practice.

| ❌ Noise | ✅ Insight |
|---|---|
| Promises can be tricky | `Promise.all()` in the ingest pipeline times out past 30 items — use `Promise.allSettled()` in batches of 10 |
| Be careful with state | Checkout state ALWAYS lives in Zustand `cartStore.ts` — 3 components share the cart, local state desyncs |

Unsure whether an entry is concrete enough → [examples.md](examples.md).

## Entry formats — ALWAYS use this exact shape

Every bullet is ONE sentence of at most ~25 words, on one physical line. The rule line holds only
the action; the cause goes in Why/Cause, paths and commands in Evidence — each fact appears once.

What Works · What Doesn't Work · Codebase Patterns · Tool & Library Notes:

```markdown
- **YYYY-MM-DD** · <one-line rule: ALWAYS … / NEVER … / to do X, do Y>
  - Why: <cause, one line>
  - Evidence: `path/file.ts:42` · `command` · `exact error text`
```

What Doesn't Work names what to do instead. Tool & Library Notes names the version.

Recurring Errors & Fixes:

```markdown
- **YYYY-MM-DD** · `<exact error text>`
  - Cause: <real cause>
  - Fix: <command or change>
  - Evidence: `path/file.ts:42`
```

Target size — every entry looks this compact:

```markdown
- **2026-09-17** · `Error [ERR_MODULE_NOT_FOUND]` on `pnpm dev` in server/
  - Cause: server imports reviewer-core as raw source and `reviewer-core/node_modules` is missing.
  - Fix: `cd reviewer-core && npm ci`
  - Evidence: `server/tsconfig.json` path alias to `../reviewer-core/src`
```

Open Questions:

```markdown
- **YYYY-MM-DD** · <question>?
  - Known: <what was observed, with numbers and paths>
  - Matters because: <impact>
```

Session Notes:

```markdown
### YYYY-MM-DD — <task, ≤8 words>
- Done: <outcome, one line>
- Added: <sections that got entries>
- Open: <what is left> (omit the line if nothing)
```

## Procedure

1. **Route** to the file (see Where). File or section missing → create it from [template.md](template.md).
2. **Gate** — any NO → write nothing and say nothing. Only #5 fails → Open Questions.
3. **Read** the target file. Same insight already there → Append-only table, no new entry.
4. **Append** at the end of the section: after its last entry, before the next `## ` heading.
5. **Notify** in one line, then continue the task:
   `Insight → server/INSIGHTS.md § Tool & Library Notes: <rule>`

At the end of a task: re-scan the session against the "When" table for missed insights, then
add one Session Notes block to each file that got a new entry in this session (a sub-bullet
alone does not count).

## Append-only

Never edit, reorder or delete existing text. The only change allowed to an old entry is a dated
sub-bullet appended under it:

| Situation | Append under the old entry | Also |
|---|---|---|
| Entry is wrong or outdated | `- Superseded YYYY-MM-DD: <why>` | New entry with the correct rule |
| Same insight hit again | `- Seen again YYYY-MM-DD: <context>` | No duplicate · propose promotion |
| Open question answered | `- Resolved YYYY-MM-DD: <answer>` | Entry in the proper section |
| Promotion confirmed by the user | `- Promoted to CLAUDE.md YYYY-MM-DD` | — |

**Promotion:** a repeat means the insight belongs in always-loaded context. Propose one line for
`<module>/CLAUDE.md` → Gotchas (root file → root `CLAUDE.md` → Cross-package gotchas). Write it
only after the user confirms, keeping root + package `CLAUDE.md` ≤ 100 lines.

## Review mode

Invoked as `/engineering-insights review <module>` — only on explicit request. Offer it when a
file passes ~80 entries. Follow [maintenance.md](maintenance.md); deleting entries is allowed
only there.

## Red flags — do not write

- "Might be useful someday"
- Paraphrases what the code plainly says
- Narrates the session instead of stating a rule
- States a guess as fact
- Only makes sense with this session's context
- Exists because "every session should add an entry"
