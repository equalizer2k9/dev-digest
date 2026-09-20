# Examples — noise vs insight

Shape illustrations, one pair per section. The ✅ entries reuse facts that are already in a
`CLAUDE.md`, so in a real session they would fail gate #2 (New) and must not be written.

## What Works

❌ `- Used the other script and it worked`

✅
```markdown
- **2026-09-17** · To run e2e flows, ALWAYS use `./scripts/e2e.sh` (hermetic DB), not `npm test` against the dev DB
  - Why: on a normal dev DB flows 02/04/05 follow the redirect to the FIRST repo, not the seeded one
  - Evidence: `e2e/specs/02-*.flow.json` · `./scripts/e2e.sh`
```

## What Doesn't Work

❌ `- Resetting the database didn't help`

✅
```markdown
- **2026-09-17** · NEVER run `docker compose down -v` to reset e2e state — use `./scripts/e2e.sh` instead
  - Why: `-v` deletes the `devdigest_pgdata` volume — every imported repo and review is gone
  - Evidence: `docker-compose.yml` volume `devdigest_pgdata`
```

## Codebase Patterns

❌ `- Translations are in JSON files`

✅
```markdown
- **2026-09-17** · New UI feature text → new `client/messages/en/<ns>.json`; no registration step
  - Why: `src/i18n/request.ts` auto-merges every `messages/en/*.json` namespace file
  - Evidence: `client/src/i18n/request.ts`
```

## Tool & Library Notes

❌ `- agent-browser has some quirks`

✅
```markdown
- **2026-09-17** · In e2e flows, `wait --text` / `wait --url` ARE the assertions — do not add a separate check step after them
  - Why: agent-browser (version in `e2e/package.json`) exits non-zero on timeout, which already fails the flow
  - Evidence: `e2e/specs/01-*.flow.json`
```

## Recurring Errors & Fixes

❌ `- Module not found error on startup, reinstalled stuff`

✅
```markdown
- **2026-09-17** · `Error [ERR_MODULE_NOT_FOUND]: Cannot find package` on `pnpm dev` in server/
  - Cause: server imports reviewer-core as RAW source; `reviewer-core/node_modules` is missing
  - Fix: `cd reviewer-core && npm ci` (npm, not pnpm)
  - Evidence: `server/tsconfig.json` path alias to `../reviewer-core/src`
```

## Session Notes

❌ `### 2026-09-17 — Worked on stuff, fixed some bugs, learned a lot`

✅
```markdown
### 2026-09-17 — Add review duration to PR page
- Done: duration shown in PR header; server + client contracts updated
- Added: Tool & Library Notes, What Doesn't Work
- Open: duration missing for reviews created before the change
```

## Open Questions

❌ `- Reviews are probably slow because of the LLM`

✅
```markdown
- **2026-09-17** · Should flows 02/04/05 target `acme/payments-api` explicitly instead of relying on the first-repo redirect?
  - Known: they pass only on the hermetic DB; on a dev DB with >1 repo they open the wrong repo
  - Matters because: flows cannot be run against a developer's own data
```
