# Flow file format

`e2e/specs/` holds the flow JSON files — they *are* this package's specs; there is no separate
feature-spec folder here. This file documents the contract they obey, as
[`run.ts`](../run.ts) and [`lib/assert.ts`](../lib/assert.ts) implement it today.

For how the runner and `agent-browser` fit together, see
[docs/architecture.md](../docs/architecture.md).

## Discovery and order

[`loadFlows()`](../run.ts) reads this directory, keeps every file whose name ends in
`.flow.json`, `.sort()`s those names, and `JSON.parse`s each. So:

- **Run order is the lexical order of filenames** — hence the `NN-` prefix.
- This document is invisible to the runner: `flows.md` does not end in `.flow.json`.
- The parsed object is `as Flow`-cast, not validated. Nothing checks the JSON at runtime, and
  `npm run typecheck` does not see it either ([`tsconfig.json`](../tsconfig.json) includes only
  `run.ts` and `lib/**/*.ts`).

## Top-level shape

Exactly three keys are defined by the `Flow` interface in [`lib/assert.ts`](../lib/assert.ts), and
the runner reads **two** of them.

| Key | Type | Read by `run.ts`? | Meaning |
|---|---|---|---|
| `name` | `string` | **yes** | Printed in the `▶ <name>  (<file>)` header and used as the flow's identity in the `PASS`/`FAIL` summary |
| `steps` | `Step[]` | **yes** | The commands, executed in array order |
| `description` | `string?` | **no** | Typed in `Flow`, but [`run.ts`](../run.ts) never touches it. Prose for humans and agents only |

`description` is the one key present in every flow file that the runner ignores — all seven flows
use it to record the precondition and what the flow is really exercising. Keep writing it; just
don't expect it to affect a run.

Any other key you add is silently dropped (no validation, no warning).

## Step shape

Defined by the `Step` interface in [`lib/assert.ts`](../lib/assert.ts). Three keys, all read by
the runner; there are no others.

| Key | Type | Semantics |
|---|---|---|
| `cmd` | `string[]` **required** | The agent-browser argv, passed **verbatim** via `execFile` — no shell, no quoting, no globbing. `{BASE}` is substituted in every element first |
| `label` | `string?` | The text in the live `✓`/`✗` log line and in the failure summary. Defaults to `args.join(" ")` (the *resolved* args, so it shows the real URL) |
| `assert` | `{ stdoutIncludes?: string }?` | An extra substring check on the command's stdout, *on top of* its exit code. See [below](#the-explicit-assert) |

`stdoutIncludes` is the only property `assert` has. **No flow file currently uses `assert` at
all** — all seven rely purely on exit codes.

### What the runner does with each step

Per [`runFlow()`](../run.ts), in order:

1. `resolveArgs(step.cmd, BASE)` — `{BASE}` → `E2E_BASE_URL` (default `http://localhost:3000`),
   trailing slashes trimmed off the base, every occurrence in every argument.
2. `label = step.label ?? args.join(" ")`.
3. Spawn `agent-browser` with those args, `cwd` = `e2e/`, killed after `E2E_STEP_TIMEOUT`
   (default 60 000 ms).
4. If `assert.stdoutIncludes` is set and missing from stdout → fail.
5. Otherwise → pass, log `✓`, next step.

Steps 1 and 2 run *outside* the runner's `try`, so a structurally broken `cmd` crashes the whole
runner (`e2e runner crashed: …`, exit 1) instead of failing one step.

A failed step **`break`s the flow** — the remaining steps are skipped and never reported. The
suite then continues with the next flow file.

## Step kinds in use

Everything that appears across flows 01–07. The runner has no allow-list; this is what the flows
actually do.

| Step | Shape | What it does | Used in |
|---|---|---|---|
| Navigate | `["open", "{BASE}/…"]` | Loads an absolute URL. Every flow starts with one | all 7 (8 uses) |
| Settle | `["wait", "--load", "networkidle"]` | Blocks until the page's network goes quiet — the sync point after a data fetch | 01–05, 07 (6 uses) |
| URL assertion | `["wait", "--url", "<fragment>"]` | Blocks until the current URL matches the fragment. Flows pass path fragments (`/pulls`, `/pulls/482`, `/settings/api-keys`) and query fragments (`tab=findings`, `tab=diff`) | all 7 (13 uses) |
| Text assertion | `["wait", "--text", "<string>"]` | Blocks until the string is present on the page | all 7 (12 uses) |
| Click by text | `["find", "text", "<string>", "click"]` | Finds an element by its visible text and clicks it | 02, 04, 05 (3 uses) |
| Click by role | `["find", "role", "button", "click", "--name", "<accessible name>"]` | Finds a button by ARIA role + accessible name and clicks it | 04, 05 (2 uses) |

Two more subcommands exist in a run but never appear in a flow file — [`run.ts`](../run.ts) issues
them itself: `screenshot <path>` on a step failure, and `close` once at the end.

## What counts as an assertion

**A step that returns is a passing assertion. That is the entire assertion model.**

The mechanism is in [`run.ts`](../run.ts)'s `ab()`: it promisifies `execFile`, which **rejects on a
non-zero exit**. `runFlow` catches that rejection, records the step as failed, and breaks the flow.
So *any* command that exits non-zero fails the build.

agent-browser's `wait` **exits non-zero when its condition does not hold within the timeout**.
Combine the two and:

> `wait --text "2 findings"` returning at all is proof that the text appeared. If it hadn't, the
> command would have timed out, exited non-zero, and failed the step.

There is nothing to add — no `expect`, no matcher. This is why the flows read as a list of
navigations and waits with no visible assertions: the waits *are* the assertions. The same is true
of `find … click` (a missing element exits non-zero) and `open` (a dead server exits non-zero).

Three of these failure paths all land in the same `catch`:

| Cause | How it surfaces |
|---|---|
| Condition never held / element not found / navigation failed | agent-browser exits non-zero → promise rejects |
| agent-browser hung | `execFile`'s `timeout` (`E2E_STEP_TIMEOUT`, default 60 s) kills it → promise rejects |
| Runaway stdout | `maxBuffer` (32 MB) exceeded → child killed → promise rejects |

All three also write `test-results/<NN-slug>-fail.png`.

`wait --load networkidle` is the one step kind that is a *synchronisation barrier* rather than a
claim about the app — but it obeys the same rule: if the network never settles, it exits non-zero
and the flow fails.

## The explicit `assert`

For the rare case where the exit code isn't enough, a step may carry:

```json
{ "cmd": ["…"], "label": "…", "assert": { "stdoutIncludes": "some text" } }
```

How [`run.ts`](../run.ts) evaluates it:

```ts
if (step.assert?.stdoutIncludes && !stdoutContains(stdout, step.assert.stdoutIncludes)) { … }
```

- It runs **only after** the command exited zero — it is strictly additional, never a replacement
  for the exit-code check.
- `stdoutContains` ([`lib/assert.ts`](../lib/assert.ts)) is a plain `String.includes`:
  **case-sensitive, no regex, no trimming, no JSON parsing**.
- stdout is captured up to `maxBuffer` (32 MB). stderr is not checked.
- On a mismatch the step's `detail` becomes `stdout missing "<needle>"`, and the flow breaks.
- **No screenshot is taken** for this failure mode — only the `catch` branch (non-zero exit)
  captures one.
- An empty string is falsy, so `"stdoutIncludes": ""` is treated as *unset* and never checked.

## The locator determinism rule

Locators are restricted to three deterministic forms:

- `wait --url <fragment>`
- `wait --text <string>`
- `find role|text|label …`

**No CSS selectors, no XPath, and — absolutely — no agent-browser `chat`.** The rule is stated in
[`CLAUDE.md`](../CLAUDE.md), [`README.md`](../README.md) and [`../TESTING.md`](../../TESTING.md).

Why: a flow that fails must mean *the app changed*. `chat` hands locator choice to a model, so the
same unchanged page can pass and fail on consecutive runs, and it needs an API key the suite
deliberately doesn't have. Role- and text-based locators also anchor the flows to what a user
actually sees, so a refactor that preserves the rendered output keeps passing — flows 04, 05, 06
and 07 all survived component extractions for exactly this reason (see their `description`s).

## Naming and numbering

`NN-<slug>.flow.json` — zero-padded two-digit number, kebab-case slug, in this directory.

- The number is **execution order**, not priority: `loadFlows()` sorts filenames lexically.
- Earlier flows leave the browser wherever they ended (one shared session, closed only at the very
  end), so a new flow must open its own starting URL rather than inherit one.
- A new flow takes the next free `NN-` and gets a row in the coverage table in
  [`README.md`](../README.md) — and a row in [the table below](#the-seven-flows).

## The seeded-data constraint

Every flow reads **only** what [`server/src/db/seed.ts`](../../server/src/db/seed.ts) creates:

- repo `acme/payments-api`
- PR **#482** — *"Add rate limiting to public API endpoints"*, changed file `src/config.ts`
- its pre-seeded review: verdict `request_changes`, 2 findings, incl. *"Hardcoded Stripe secret key
  in commit"*
- the three built-in agents: General Reviewer, **Security Reviewer**, Performance Reviewer

Two hard rules follow:

1. **Nothing may trigger an LLM call.** No flow starts a review, and flow 06 deliberately stops
   short of submitting the add-repository form (no clone, no import, no backend mutation). This is
   what lets CI run with no API keys at all — see the header comment in
   [`e2e-web.yml`](../../.github/workflows/e2e-web.yml).
2. **The assertion strings are seed literals.** Editing
   [`server/src/db/seed.ts`](../../server/src/db/seed.ts) can break flows even when the app is
   fine.

There is also a *first-repo* assumption: flows 02, 04 and 05 start at `{BASE}/` and follow the home
redirect, which lands on the first repo. They only work when the seeded demo repo is the **only**
repo — guaranteed by the hermetic runner's ephemeral DB and by CI's fresh Postgres, *not* by a
normal dev DB. See [docs/architecture.md](../docs/architecture.md#the-two-execution-modes).

## The seven flows

| File | Covers | Key assertions |
|---|---|---|
| [`01-app-boot.flow.json`](01-app-boot.flow.json) | Whole-stack smoke, order-independent: client loads, fetches repos, root redirects to `/repos/<id>/pulls` | `wait --url /pulls` (the redirect only fires with ≥1 repo, so it proves client + API + DB are live) · `wait --text "Pull Requests"` |
| [`02-repo-pulls-detail.flow.json`](02-repo-pulls-detail.flow.json) | PR list → click PR #482 → nested detail route `/repos/<id>/pulls/<number>` | `wait --text "Add rate limiting to public API endpoints"` on the list · `find text … click` · `wait --url /pulls/482` · same title again on the detail page |
| [`03-agents.flow.json`](03-agents.flow.json) | `/agents` list route and its API fetch | `wait --url /agents` · `wait --text "Security Reviewer"` (a seeded agent rendered by `AgentCard`) |
| [`04-pr-findings.flow.json`](04-pr-findings.flow.json) | PR #482 → *Agent runs* tab → seeded run, verdict and findings (`ReviewRunAccordion` / `VerdictBanner` / `FindingsPanel` / `FindingCard`) | `find role button --name "Agent runs"` · `wait --url tab=findings` · `wait --text "request changes"` · `wait --text "2 findings"` · `wait --text "Hardcoded Stripe secret key in commit"` (newest run is `defaultOpen`, so no extra click) |
| [`05-pr-diff.flow.json`](05-pr-diff.flow.json) | PR #482 → *Files changed* tab → unified diff viewer (`DiffViewer` → `FileCard` → `CodeLine`) | `find role button --name "Files changed"` · `wait --url tab=diff` · `wait --text "src/config.ts"` |
| [`06-onboarding.flow.json`](06-onboarding.flow.json) | `/onboarding` add-repository form (`AddRepoView`) renders — **never submits** | `wait --url /onboarding` · `wait --text "Add a repository"` · `wait --text "Repository URL"` |
| [`07-settings.flow.json`](07-settings.flow.json) | `/settings/api-keys` and `/settings/models` (`SettingsApiKeys` / `SettingsModels`) — two routes in one flow | `wait --url /settings/api-keys` · `wait --text "API Keys"` · second `open` · `wait --url /settings/models` · `wait --text "Feature Models"` |
