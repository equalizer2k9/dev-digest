---
name: pr-self-review
description: "ALWAYS invoke when the user runs /pr-self-review, or asks to self-review / pre-flight / gate the uncommitted working-tree diff before committing, pushing or opening a PR in this repo. Do NOT invoke it on your own initiative, and do NOT use it for a committed range, a branch comparison or a GitHub PR number — that is /code-review."
version: 1.0.0
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob, Skill
---

# PR Self-Review (workflow)

**Version:** 1.0.0 · user-invoked only (`/pr-self-review`) · subject: the **uncommitted** diff

Route the working-tree diff to the skills that own each surface, run each package's own gate, then
issue one verdict. A critical finding blocks the merge.

## Step 1 — collect the diff

```bash
git -C <repo-root> status --porcelain
git -C <repo-root> diff HEAD --stat          # staged + unstaged
git -C <repo-root> diff HEAD -- <path>       # per surface, in step 3
```

Untracked files count — read them with `Read`, they are part of the change. Empty diff → say
"nothing uncommitted to review" and stop. Never widen the scope to committed history.

## Step 2 — classify surfaces

Bucket every changed path by its top-level package. A diff usually hits more than one; review each
bucket separately, with only that bucket's skills loaded.

## Step 3 — route

| Changed paths | Invoke |
|---|---|
| `client/**` | `frontend-architecture` + `react-best-practices` + `react-testing-library` |
| `client/src/app/**` (also) | `next-best-practices` |
| `server/**` | `onion-architecture` + `fastify-best-practices` + `drizzle-orm-patterns` |
| `server/src/db/schema/**` (also) | `postgresql-table-design` |
| `reviewer-core/**` | `typescript-expert` + `zod` + `reviewer-core/AGENTS.md` invariants |
| `*/src/vendor/shared/**` | both copies must change together (client + server) |
| `e2e/**` | `e2e/specs/flows.md` contract |
| auth, secrets, untrusted input, uploads | `security` |

Invoke each routed skill, then judge that surface's files against it. Do not review `client/**` with
the server skills loaded, or vice versa — cross-surface rules produce false findings.

## Step 4 — always-on repo guardrails

Check these regardless of surface; each is **critical** on its own:

- `server/src/db/migrations/**` hand-edited — including `meta/_journal.json`, any `*_snapshot.json`
  (a manual edit already corrupted the journal once, `2006964`).
- A lock file edited by hand: `client/pnpm-lock.yaml`, `server/pnpm-lock.yaml`,
  `reviewer-core/package-lock.json`, `e2e/package-lock.json`, `skills-lock.json`.
- A contract changed in only one `src/vendor/shared` copy.
- A secret read from `AppConfig`, the DB or git instead of `SecretsProvider`.
- A repository query with no `workspaceId` scope.
- An adapter called from a `routes.ts` in a **new** module.
- Committed API key, token or `.env` value.

## Step 5 — run the real gate

There is no linter in this repo; typecheck + tests are the gate. Run only the touched packages:

| Package | Commands |
|---|---|
| `server/` | `pnpm typecheck` · `pnpm exec vitest run --exclude '**/*.it.test.ts'` (integration needs Docker) |
| `client/` | `pnpm typecheck` · `pnpm test` |
| `reviewer-core/` | `npm run typecheck` · `npm test` (also `cd ../server && pnpm typecheck` after export changes) |
| `e2e/` | `npm run typecheck` |

A failing typecheck or test is **critical**. Quote the real output — never report a command you did
not run, never summarize a failure as passing.

## Step 6 — report

One table, most severe first:

```
| file:line | severity | rule (skill) | fix |
```

Severity:

- **critical** — blocks merge: any step-4 guardrail, a failed typecheck/test, data loss, a broken
  contract, a security hole.
- **major** — a layer/placement violation (adapter in a route, fetch in a component, SQL outside a
  repository, test in the wrong place), a missing i18n namespace, a missing showcase entry.
- **minor** — naming, comment density, dead code.

## Step 7 — verdict

- Zero criticals → `MERGE ALLOWED` + the majors/minors as follow-ups.
- One or more criticals → **`MERGE BLOCKED`**, list every critical with its file:line, and stop.

**When blocked:** do not commit, do not push, do not open or merge a PR, do not re-run the gate with
a narrower scope to get a clean pass. Report and hand back.

## Do not

- Do not fix findings silently — this workflow reports; the user decides what to change.
- Do not downgrade a critical to major because the change is small, urgent or "only a test file".
- Do not skip a surface because another surface already looks clean.
- Do not claim a package passed without its command output in the transcript.
- Do not review committed commits, a branch diff or a PR number here — that is `/code-review`.
