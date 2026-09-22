# e2e architecture — how the browser suite actually runs

This package has no test framework. It has a ~120-line runner
([`run.ts`](../run.ts)), a handful of helpers ([`lib/assert.ts`](../lib/assert.ts)), and a
third-party CLI (`agent-browser`) that does the driving. Everything below is what those files
do today.

For the JSON contract the flow files obey, see [specs/flows.md](../specs/flows.md).

## The pieces

| Path | Role |
|---|---|
| [`run.ts`](../run.ts) | The whole runner: discovers flows, spawns `agent-browser` once per step, reports, sets the exit code |
| [`lib/assert.ts`](../lib/assert.ts) | `{BASE}` substitution, the one extra assertion primitive, the summary formatter, the `Flow`/`Step` types |
| [`specs/*.flow.json`](../specs/) | The flows themselves — this package's specs |
| [`agent-browser.json`](../agent-browser.json) | Config picked up by the CLI (the runner spawns it with `cwd` = `e2e/`) |
| [`package.json`](../package.json) | `test` → `tsx run.ts`; `e2e:hermetic` → `../scripts/e2e.sh`; `typecheck` |
| [`../scripts/e2e.sh`](../../scripts/e2e.sh) | Hermetic mode: builds an isolated stack around the runner, then calls it |
| [`../.github/workflows/e2e-web.yml`](../../.github/workflows/e2e-web.yml) | CI: builds its own stack and calls the runner directly (it does **not** use `e2e.sh`) |

`agent-browser` itself is **not** in [`package.json`](../package.json) — it is a global,
out-of-band install. See [Installing agent-browser](#installing-agent-browser).

## The runner

### Discovery and order

[`loadFlows()`](../run.ts) reads `e2e/specs/`, keeps every file ending in `.flow.json`,
`.sort()`s the names, and `JSON.parse`s each one. Consequences:

- **Run order is the lexical order of filenames.** That is the entire reason for the `NN-`
  prefix convention.
- **Anything not ending in `.flow.json` is invisible** to the runner — which is why
  [`specs/flows.md`](../specs/flows.md) can sit in the same folder harmlessly.
- The parsed object is **cast** to `Flow` (`as Flow`), never validated. A misspelled key is
  silently ignored; a missing `cmd` throws at step time (see [Failure handling](#failure-handling-and-screenshots)).
- No flows found → the runner prints `No specs found in …` and exits **1**.

### One shared browser session

The runner never starts or attaches a browser explicitly. Per the header comment in
[`run.ts`](../run.ts), `agent-browser` keeps a daemon alive between invocations, so the page
survives from one spawned command to the next — across steps *and across flows*. The session is
torn down exactly once, by `ab(["close"])` in the `finally` of `main()`, so it runs on success,
on failure, and on a throw out of the flow loop.

Two things follow:

- **Flows are not isolated from each other.** Browser state (current page, cookies, storage)
  carries over. Every flow therefore opens with an `open` step to put the browser somewhere
  known; none of them relies on a clean profile.
- `loadFlows()` runs *before* the `try`, so a parse error can't leak a session — no browser
  exists yet at that point.

### Executing a step

For each step, in order ([`runFlow()`](../run.ts)):

1. `resolveArgs(step.cmd, BASE)` — substitutes `{BASE}` in **every** argument.
2. `label = step.label ?? args.join(" ")`.
3. `ab(args)` → `execFile(BIN, args, { cwd: HERE, timeout: STEP_TIMEOUT, maxBuffer: 32 * 1024 * 1024 })`,
   promisified.

Note that steps 1 and 2 happen *outside* the per-step `try`. A structurally broken step (e.g. a
`cmd` that isn't an array) therefore doesn't fail the step — it throws out of `runFlow`, past the
`finally` that closes the browser, into `main().catch`, which prints `e2e runner crashed: …` and
exits 1.

The `cmd` array is handed to the CLI **verbatim**, as argv — `execFile`, not a shell. There is no
quoting, no globbing, no interpolation beyond `{BASE}`. The runner has no opinion about which
subcommands or flags exist; anything `agent-browser` accepts is a legal step, and anything it
rejects fails the step.

`cwd` is the `e2e/` directory, which is how the CLI picks up
[`agent-browser.json`](../agent-browser.json).

A step fails when **either**:

- the child exits non-zero, is killed by the `STEP_TIMEOUT` (default 60 000 ms), or blows the
  32 MB `maxBuffer` — all surface as a rejected promise; **or**
- `step.assert.stdoutIncludes` is set and `stdout.includes(needle)` is false.

Either way the runner pushes a failing `StepResult` and **`break`s out of that flow's step loop** —
the remaining steps are skipped and never recorded. The outer loop in `main()` then continues with
the *next* flow, so one broken flow does not abort the suite.

The exit-code rule is the load-bearing part of the design: it is what makes a bare
`wait --text` a real assertion. See
[What counts as an assertion](../specs/flows.md#what-counts-as-an-assertion).

### Failure handling and screenshots

Only the `catch` branch — a non-zero exit, a timeout, or a `maxBuffer` overrun — takes a
screenshot:

```
mkdirSync(RESULTS_DIR, { recursive: true });
await ab(["screenshot", join(RESULTS_DIR, `${id}-fail.png`)]).catch(() => {});
```

- `id` is the filename minus `.flow.json`, so the file lands at
  `e2e/test-results/<NN-slug>-fail.png`.
- The `.catch(() => {})` means a failed screenshot can never mask the real failure.
- **A `stdoutIncludes` mismatch does not produce a screenshot** — that branch pushes the failure
  and breaks without touching `RESULTS_DIR`.
- `test-results/` is git-ignored by the root [`.gitignore`](../../.gitignore), and uploaded as the
  `e2e-failure` artifact on failure by [`e2e-web.yml`](../../.github/workflows/e2e-web.yml).

Only the first line of the error message is kept (`(e as Error).message.split("\n")[0]`), which for
`execFile` is the `Command failed: …` line.

### Reporting and exit code

Live output is one line per step (`✓` / `✗ … — <detail>`) under a `▶ <flow name>  (<file>)`
header. At the end, `summarize()` from [`lib/assert.ts`](../lib/assert.ts) prints `PASS`/`FAIL` per
flow, re-lists only the failed steps, and closes with `N/M flows passed`.

| Situation | Exit code |
|---|---|
| Every flow passed | 0 |
| Any flow failed | 1 |
| `specs/` contains no `.flow.json` | 1 |
| Anything thrown out of `main()` | 1 (`e2e runner crashed: …`) |

### Environment knobs

Read directly by [`run.ts`](../run.ts):

| Var | Default | Effect |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3000` | The value `{BASE}` expands to |
| `AGENT_BROWSER_BIN` | `agent-browser` | Binary name or path passed to `execFile` |
| `E2E_STEP_TIMEOUT` | `60000` | Per-command timeout in ms (`Number(...)`, so a non-numeric value becomes `NaN` → no timeout) |

### `{BASE}` substitution

`resolveArgs` in [`lib/assert.ts`](../lib/assert.ts) is the whole mechanism:

```ts
const b = base.replace(/\/+$/, "");
return cmd.map((a) => a.replaceAll("{BASE}", b));
```

- Trailing slashes are stripped from the base first, so `E2E_BASE_URL=http://localhost:3100/`
  plus `"{BASE}/agents"` still yields one slash.
- It runs on **every** argument, not just the first, and replaces **every** occurrence
  (`replaceAll`).
- It is the only templating in the format. There are no other placeholders, no env interpolation,
  no per-flow variables.

This is what lets the same flow files run unchanged against the dev stack on `:3000` and the
hermetic stack on `:3100` — [`scripts/e2e.sh`](../../scripts/e2e.sh) exports
`E2E_BASE_URL=http://localhost:${WEB_PORT}` before invoking `npm test`, and
[`e2e-web.yml`](../../.github/workflows/e2e-web.yml) sets it as a workflow-level `env`.

## agent-browser

### What it is

[Vercel agent-browser](https://github.com/vercel-labs/agent-browser): a native
(**Rust + Chrome DevTools Protocol**) browser-automation CLI. **Not Playwright.** There is no
Playwright dependency anywhere in this package — see [`package.json`](../package.json), whose only
devDependencies are `@types/node`, `tsx` and `typescript`.

It is a CLI, not a test framework: it has no runner, no assertions, no reporter, no fixtures. Those
~120 lines in [`run.ts`](../run.ts) are exactly the missing layer.

### Installing agent-browser

One-time, global, outside any lockfile:

```sh
npm i -g agent-browser && agent-browser install    # the second command downloads Chrome for Testing
```

CI does the same with `--with-deps` (see the *Install agent-browser* step in
[`e2e-web.yml`](../../.github/workflows/e2e-web.yml)).
[`scripts/e2e.sh`](../../scripts/e2e.sh) only *warns* when the binary is absent — it does not
install it and does not abort.

Because the binary lives outside `package.json`, `npm ci` cannot supply it; a missing CLI shows up
as `spawn agent-browser ENOENT` on every step. That failure mode and the matching
`tsx: not found` one are recorded in [`INSIGHTS.md`](../INSIGHTS.md).

### Configuration

[`agent-browser.json`](../agent-browser.json), read by the CLI because the runner spawns it with
`cwd` = `e2e/`:

| Key | Value | Meaning |
|---|---|---|
| `$schema` | `https://agent-browser.dev/schema.json` | Editor completion only |
| `headed` | `false` | Headless — required for CI, and the reason local runs show no window |
| `ignoreHttpsErrors` | `false` | No TLS bypass; the suite only ever talks to plain-HTTP localhost |

### Subcommands actually used

Five, total. Three come from the flow files, two are issued by the runner itself.

| Subcommand | Issued by | Use |
|---|---|---|
| `open <url>` | flows | Navigate to an absolute URL (always built from `{BASE}`) |
| `wait --url` / `--text` / `--load` | flows | Synchronise *and* assert — see [flows.md](../specs/flows.md#step-kinds-in-use) |
| `find <strategy> … click` | flows | Locate an element deterministically and click it |
| `screenshot <path>` | [`run.ts`](../run.ts) | Best-effort failure capture into `test-results/` |
| `close` | [`run.ts`](../run.ts) | Tear down the shared session in the `finally` of `main()` |

### The banned `chat` subcommand

agent-browser ships an AI `chat` subcommand that drives the page from a natural-language
instruction. **This suite never uses it**, and that is a hard rule in
[`CLAUDE.md`](../CLAUDE.md), [`README.md`](../README.md) and [`../TESTING.md`](../../TESTING.md).
Three reasons:

1. **Non-determinism.** A model picking its own locators turns a red build into a coin flip; the
   whole point of the `--url` / `--text` / `find` restriction is that a failure means the app
   changed, not that the model changed its mind.
2. **It needs an API key.** The suite is key-free by construction — see the header comment in
   [`e2e-web.yml`](../../.github/workflows/e2e-web.yml): `loadConfig()` marks every secret
   optional, so the API boots and serves seeded data with no credentials in the environment.
3. **Cost and latency** on every CI run, for assertions a substring match already makes.

The same principle bans anything that would reach a model through the *app*: the flows only read
seeded data and never trigger a review run. See
[the seeded-data constraint](../specs/flows.md#the-seeded-data-constraint).

## `lib/assert.ts`

Everything the runner adds on top of a raw `cmd`, in one 58-line file:

| Export | What it adds |
|---|---|
| `resolveArgs(cmd, base)` | `{BASE}` substitution (see [above](#base-substitution)) |
| `stdoutContains(stdout, needle)` | The *only* assertion primitive beyond the exit code: a plain, case-sensitive `String.includes`. No regex, no trimming, no JSON parsing |
| `summarize(results)` | The final `PASS`/`FAIL` block and the `N/M flows passed` line |
| `Step`, `Flow`, `StepResult`, `FlowResult` | The type contract for the JSON format |

The types are the closest thing to a schema this format has, and they are **compile-time only**.
[`tsconfig.json`](../tsconfig.json) `include`s just `["run.ts", "lib/**/*.ts"]`, and the flows are
read with `readFileSync` + `JSON.parse`, never imported — so `npm run typecheck` never sees a flow
file. Nothing validates the JSON at runtime either.

This is deliberate minimalism, stated in the file's own header: most assertion work belongs to
agent-browser's `wait`, which fails on its own timeout.

## The two execution modes

### Hermetic — `./scripts/e2e.sh` (the default)

[`scripts/e2e.sh`](../../scripts/e2e.sh) builds a complete, throwaway stack on alternate ports and
runs the flows against it.

| Piece | Port | Var | Notes |
|---|---|---|---|
| Postgres | 5433 | `E2E_PG_PORT` | `docker run -d --rm`, **no named volume** — empty every run |
| API | 3101 | `E2E_API_PORT` | `pnpm exec tsx src/server.ts` (not `pnpm start`, which needs a build; not `tsx watch`, to avoid a mid-suite restart) |
| Web | 3100 | `E2E_WEB_PORT` | `pnpm exec next dev -p $WEB_PORT` |

Also overridable: `E2E_PG_CONTAINER` (`devdigest-e2e-postgres`), `E2E_PG_IMAGE`
(`pgvector/pgvector:pg16`), `E2E_PG_DB` / `E2E_PG_USER` / `E2E_PG_PASS`.

What the script does, in order:

1. Exports `DATABASE_URL`, `API_PORT`, `WEB_PORT`, `NEXT_PUBLIC_API_BASE` and `E2E_BASE_URL`
   **before** any `tsx`/`next` spawn. `dotenv` does not override already-set env, so these win over
   `server/.env` without editing it. `WEB_PORT` must be exported too, because the API derives its
   CORS allow-origin from it. The DSN uses `127.0.0.1`, not `localhost`, to dodge an IPv6 `::1` vs
   published-IPv4 mismatch against the container.
2. Installs a `trap cleanup EXIT INT TERM` **before** starting anything. `cleanup` walks the
   process tree leaves-first (`kill_tree`) — `pnpm exec tsx` and `next dev` spawn the real listener
   as a *grandchild*, so a plain `kill` leaves the port bound — then reaps whatever still holds the
   *isolated* ports only, and `docker rm -f`s the container.
3. Starts an ephemeral Postgres and polls its Docker health status.
4. Installs deps per package if `node_modules` is missing, including `reviewer-core` via `npm ci` —
   the API imports reviewer-core's **raw source** through a tsconfig alias and crashes at boot with
   `ERR_MODULE_NOT_FOUND` without it.
5. Hard-guards that `DATABASE_URL` is really on `$PG_PORT` before running `pnpm db:migrate` and
   `pnpm db:seed`, so a seed can never land on the dev DB.
6. Starts the API and polls `/health`; starts web and polls the root; each poll aborts early if the
   child has already exited.
7. Runs `(cd e2e && npm test)` and propagates its exit code.

The ephemeral DB is the point: the seeded demo repo is the *only* repo, which is what flows 02, 04
and 05 need (see [below](#against-a-running-dev-stack)). Nothing here touches the dev stack's
`devdigest_pgdata` volume — which is why `docker compose down -v` as a "reset" is banned in
[`CLAUDE.md`](../CLAUDE.md): `-v` deletes every imported repo and review you have.

### Against a running dev stack

`npm test` is the bare runner: `tsx run.ts` against whatever `E2E_BASE_URL` points at, defaulting
to the dev web app on `:3000`. It assumes a stack is already up (`./scripts/dev.sh`).

**This mode is fragile, and the fragility is about seeded data, not ports.** Flows 02, 04 and 05
start at `{BASE}/` and follow the home redirect to the **first** repo, then assert on
`acme/payments-api` specifics — PR #482, the title *"Add rate limiting to public API endpoints"*,
the seeded verdict and findings. A normal dev DB has other imported repos, the redirect lands on
one of them, and those three flows fail on data, not on a real regression. Flows 01, 03, 06 and 07
are order-independent and survive.

So `npm test` is only safe when the dev DB holds *only* the seeded repo. Otherwise use the hermetic
runner. The other standing hazard: changing
[`server/src/db/seed.ts`](../../server/src/db/seed.ts) can break flows, because the assertion
strings are seed literals.

## CI

[`.github/workflows/e2e-web.yml`](../../.github/workflows/e2e-web.yml), job `e2e` /
*browser flows*, on `ubuntu-latest`.

- **Triggers:** push to `main` and any pull request, path-filtered to `client/**`, `server/**`,
  `e2e/**` and the workflow file itself. Concurrency is grouped per ref with
  `cancel-in-progress: true`.
- **Env:** `DATABASE_URL` (standard `:5432`), `NEXT_PUBLIC_API_BASE=http://localhost:3001`,
  `E2E_BASE_URL=http://localhost:3000`. No API keys — the workflow's header comment notes that
  `loadConfig()` marks every secret optional, so the API boots and serves seeded read-only data
  without a model ever being called.
- **Stack:** `docker compose up -d` (the repo's own compose file, polled for health) → server
  `pnpm install --frozen-lockfile` + `db:migrate` + `db:seed` → `npm ci` in `reviewer-core`
  (same `ERR_MODULE_NOT_FOUND` reason as the hermetic script) → API via
  `nohup pnpm exec tsx src/server.ts` polled on `/health` → client `pnpm build` + `pnpm start`
  polled on `:3000`.
- **Runner:** `npm i -g agent-browser && agent-browser install --with-deps`, then
  `npm ci && npm test` in `e2e/`.
- **Artifacts:** on failure, `e2e/test-results/**` is uploaded as `e2e-failure`
  (`if-no-files-found: ignore`).

Two differences from the hermetic script worth knowing when a flow passes locally and fails in CI:
CI runs the client as a **production build** (`pnpm build` + `pnpm start`) where `e2e.sh` runs
`next dev`, and CI uses the **standard ports** (5432/3001/3000) on a fresh empty Postgres.
**CI does not call `scripts/e2e.sh`** — it builds its own stack and invokes the runner directly, as
the script's own header comment says.
