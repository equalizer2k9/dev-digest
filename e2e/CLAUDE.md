# e2e/ — @devdigest/e2e

Deterministic UI flows over the real stack, driven by the agent-browser CLI (Rust + CDP).
NOT Playwright. No LLM, no API key.

## Stack

agent-browser CLI · `run.ts` runner (tsx) · TS 5.7 · **npm**

## Commands

- Hermetic (default): `./scripts/e2e.sh` from repo root — isolated, freshly seeded stack on
  Postgres :5433 · API :3101 · web :3100, torn down after; dev DB untouched
- Against a running dev stack: `npm test` — only if the dev DB holds ONLY the seeded repo
- `npm run typecheck`
- One-time setup: `npm i -g agent-browser && agent-browser install`

## Where things live

- `specs/NN-name.flow.json` — flows; they ARE this package's specs · their contract: `specs/flows.md`
- `run.ts` — runs each flow's steps in one shared browser session · `lib/assert.ts`
- `test-results/` — failure screenshots (git-ignored, uploaded as CI artifact)

## Conventions (non-default)

- Step = `{ "cmd": [...], "label": "…" }`; `cmd` goes verbatim to agent-browser; non-zero exit fails the flow
- `wait --text` / `wait --url` ARE the assertions; extra check: `"assert": { "stdoutIncludes": "…" }`
- `{BASE}` → `E2E_BASE_URL` (default `http://localhost:3000`)
- Locators deterministic only: `--url`, `--text`, `find role|text|label`
- Flows read seeded data only (repo `acme/payments-api`, PR #482, built-in agents) — nothing may trigger an LLM call
- New flow → next `NN-` number + a row in the README coverage table

## Gotchas

- `npm test` against a normal dev DB fails flows 02/04/05 — they follow the redirect to the FIRST repo
- Changing `server/src/db/seed.ts` can break flows

## Do not touch

- agent-browser `chat` command — never (non-deterministic, needs a key)
- `docker compose down -v` to "reset" — wipes `devdigest_pgdata`; use the hermetic runner instead

## Docs — read on trigger

- Flow format, env knobs, coverage table → [README.md](README.md)
- Runner, agent-browser, hermetic vs dev stack → [docs/architecture.md](docs/architecture.md)
- Flow JSON contract: step keys, what counts as an assertion → [specs/flows.md](specs/flows.md)
- More deep dives → [docs/](docs/README.md) · insights → [INSIGHTS.md](INSIGHTS.md); new insight → `engineering-insights` skill
- CI job → [../.github/workflows/e2e-web.yml](../.github/workflows/e2e-web.yml) · test strategy → [../TESTING.md](../TESTING.md)
