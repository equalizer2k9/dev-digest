# Blast Radius — client

**Status:** approved · **Package:** client · **Date:** 2026-10-11

Siblings: [`server/specs/blast-radius.md`](../../server/specs/blast-radius.md) ·
[`devdigest-mcp/specs/mcp-tools.md`](../../devdigest-mcp/specs/mcp-tools.md) ·
requirements: [`docs/hw4/requirements.md`](../../docs/hw4/requirements.md)

## Problem

The **Overview** tab of a PR shows the description and nothing else —
[`OverviewTab`](<../src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx>)
takes one prop, `prBody`. A reviewer cannot see which callers, endpoints and crons the diff can
reach. The pieces are there and unused: `messages/en/blast.json`, `githubBlobUrl` in
[`lib/github-urls.ts`](../src/lib/github-urls.ts), the `BlastRadius` contract.

## Goals / non-goals

**Goals**

- A **Blast radius** block on Overview for every PR, fed by `GET /pulls/:id/blast`.
- A stats row (symbols · callers · endpoints · crons), then one card per changed symbol that has
  callers: `file:line` rows linking to GitHub, the caller function name, endpoint chips, cron chips.
- Two states that never look alike: "nothing calls this" and "the index is incomplete, here is why".
- Every visible string from `messages/en/blast.json`.

**Non-goals**

- P3-1 collapsible tree, P3-2 graph view and the Tree / Graph switch, P3-3 prior PRs, P3-6 resync
  button. The existing `view.*` and `graph.*` keys stay unused.
- Any model-written text. The block renders what the route returns.
- The two-column Overview with Intent and "Review focus" from the prototype — Intent does not exist
  in this fork. The block goes under the description, full width. (Superseded: Overview is now two columns, the PR brief block with the Intent block on the left and Blast radius on the right, Description below.)
- Re-sorting, capping or filtering on the client. Order and limits are the server's.

## Behaviour

### 1. Where the code lives

```
src/lib/hooks/blast.ts                          useBlastRadius(prId) — key ["blast", prId]
src/app/repos/[repoId]/pulls/[number]/_components/
  BlastRadius/
    BlastRadius.tsx       presentational: { blast, repoFullName, headSha }
    index.ts
    helpers.ts            blastStats(blast) · callerLabel(file, line)
    constants.ts          REASON_KEYS: reason → message key
    styles.ts
    helpers.test.ts
    BlastRadius.test.tsx
  OverviewTab/
    OverviewTab.tsx       + props prId, repoFullName, headSha; calls useBlastRadius
    OverviewTab.test.tsx
```

`BlastRadius` holds no data hook. `OverviewTab` owns loading and error. The page already has all
three new props (`page.tsx` lines 36, 84, and `pr.head_sha`) and mounts `OverviewTab` only after
the PR detail has loaded — which is also what fills `pr_files` on the server.

### 2. The block

- **Stats row** — four chips from `stat.*`: symbols = `changed_symbols.length`, callers = Σ entry
  callers, endpoints and crons = unique across entries. Derived in `blastStats`, no state.
- **One card per `downstream` entry**, in response order:
  - header: symbol name, `callerCount` on the right;
  - rows: `file:line` (mono) on the left, caller function `name` on the right;
  - endpoint chips (`GET /api/public/items`), then cron chips as a separate, differently coloured
    group (P3-4).
- **Link** — `file:line` is an `<a target="_blank" rel="noreferrer">` to
  `githubBlobUrl(repoFullName, headSha, file, line)`. While `repoFullName` is null it is plain text.

### 3. States

| State | Condition | Shown |
|---|---|---|
| Loading | query pending | skeleton in the block's place |
| Error | query failed | `error` text; the description above still renders |
| No changed symbols | `changed_symbols` empty | `noSymbols` text, zero stats |
| No callers | symbols present, `downstream` empty | stats row + `noDownstream` text |
| Map | `downstream` non-empty | stats row + cards |
| Incomplete index | `degraded === true` | a separate marker — `degraded.label` + the text for `reason` — above whatever of the three rows before applies |

The marker is independent of the others: `flag_off` and `index_partial` can come with callers, and
then both the marker and the cards are shown. The server can produce three reasons — `flag_off`,
`index_partial`, `no_data` (server spec §3); the contract enum has five, so `REASON_KEYS` is a
total `Record` over all five and each has a string — nothing ever renders blank. `reason: null`
with `degraded: true` cannot happen and falls back to `no_data`.

## Contracts & data

- `@devdigest/shared` (client copy, `contracts/brief.ts`) — `BlastDegradedReason`,
  `BlastRadiusResponse`; the identical edit to the server copy. See the server spec.
- `GET /pulls/:id/blast` → `BlastRadiusResponse`.
- `messages/en/blast.json` — add `title`, `noSymbols`, `error`, `degraded.label`,
  `degraded.reason.{flag_off,index_failed,index_partial,repo_too_large,no_data}`. Every counted
  string is an ICU plural, as in HW3 (`prReview.json`): `callerCount` (`1 caller` / `N callers`),
  `noDownstream` (replacing today's `symbol(s)`), and the four `stat.*` labels, which take
  `{count}` so the chip reads `1 symbol` / `2 symbols`, `1 cron` / `2 crons`. Key names are kept.
- [`specs/pages.md`](pages.md) — the Overview row gains the new endpoint.
- Showcase — one `BlastRadius` fixture, per the client convention.

## Acceptance criteria

Numbered by [`docs/hw4/requirements.md`](../../docs/hw4/requirements.md). Client half here; the
coverage table is in the server spec.

- [ ] **P1-1** The Overview tab shows a Blast radius block.
- [ ] **P1-2** The stats row shows symbols, callers, endpoints and crons, derived from the response.
- [ ] **P1-3** Under each symbol: its callers as `file:line` with the caller function name, then
      that symbol's endpoints.
- [ ] **P1-5** Clicking `file:line` opens that line on GitHub at the PR head sha, in a new tab.
- [ ] **P1-6** "No callers" shows `noDownstream`; an incomplete index shows a separate marker with
      the reason. The two can be told apart at a glance and can appear together with a map.
- [ ] **P2-6** *(client half)* No literal caller or depth limit in the component, helpers or hook.
- [ ] **P2-7** `degraded` and `reason` from the response reach the screen; every reason in the
      contract has its own string.
- [ ] **P3-4** Cron chips are a separate group from endpoint chips; `stat.crons` is its own number.
- [ ] **P3-5** *(client half)* Cards and callers render in response order; no client sort.
- [ ] **P3-7** Every visible string comes from `messages/en/blast.json`; counted strings are ICU
      plurals (no `(s)`, no "1 callers").

Out of scope: P3-1, P3-2, P3-3, P3-6. Not code: P1-4 (stand), P1-8, P2-9 (delivery).

## Tests

Written before the code they cover; `NextIntlClientProvider` with the real `blast.json`, strings
asserted from the imported JSON, never typed in the test.

- `BlastRadius/helpers.test.ts` — `blastStats`: counts, unique endpoints / crons across entries,
  empty input.
- `BlastRadius/BlastRadius.test.tsx` — stats numbers; one card per entry with its caller count;
  `file:line` text and `href === githubBlobUrl(...)`; plain text when `repoFullName` is null;
  endpoint and cron chips in separate groups; `noDownstream`; `noSymbols`; the marker with each
  reason; marker and cards together; singular and plural of `callerCount` and a `stat.*` label.
- `OverviewTab/OverviewTab.test.tsx` — mocked `useBlastRadius`: loading, error, block rendered,
  description still rendered in all three.

Gate: `pnpm typecheck && pnpm test` in `client/`.

## Open questions

Decided 2026-10-11: the block is full width under the PR description; plurals through ICU.

- **Line drift** between the indexed default branch and the PR head sha — see the server spec.
