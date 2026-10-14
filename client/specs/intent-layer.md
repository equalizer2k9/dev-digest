# Intent Layer — client

**Status:** approved · **Package:** client · **Date:** 2026-10-12

Sibling: [`server/specs/intent-layer.md`](../../server/specs/intent-layer.md) — owns the
contract, the routes and the classifier.

## Problem

The reviewer is told what a PR is for (see the server spec), but the person reading the review
cannot see that belief: there is no place on the PR page that says "this is what the system
thinks the PR does, this is in scope, this is not". When a review ignores a drive-by change or
flags something as out of scope, the reader has nothing to check it against, and no way to
re-derive the intent after editing the description.

The Overview tab today holds one section — the PR description
([`OverviewTab.tsx`](../src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx)).

## Goals / non-goals

**Goals**

- An `IntentCard` on the Overview tab: summary, In scope, Out of scope, confidence, sources and
  a Recalculate button.
- Three explicit states besides "loaded": none yet, generating, error.
- Opening the page never spends a model call — the card only reads; a call happens when the
  user presses the button (or a review derives the intent).
- Every label comes from `messages`.
- Settings → Models shows the `review_intent` row with the new flash default.

**Non-goals**

- Marking individual findings as out of scope, or grouping the findings list by scope.
- Editing the intent by hand.
- i18n for the Settings → Models row labels (hard-coded in `lib/feature-models.ts` today), or
  changing how that page saves the provider.
- Any change to Smart Diff / the Files changed tab.

## Behaviour

### 1. Placement

`IntentCard` renders on the Overview tab above the Description section, for every PR whose id is
resolved. `OverviewTab` gains a `prId` prop (the same name `feat/homework-5` uses) and owns the
data hooks; `IntentCard` is presentational — props in, callbacks out — so it can be shown in the
showcase and tested without mocks.

### 2. States

| State | When | What the user sees |
|---|---|---|
| Loading | first GET in flight | skeleton lines in the card |
| None yet | GET returned `{ intent: null }` | empty title + body, and a **Generate** button |
| Loaded | GET returned an intent | summary; "In scope" list; "Out of scope" list; confidence badge; sources; **Recalculate** |
| Generating | recalculate pending | button in `loading` and disabled, card `aria-busy`, a "generating" line; content already loaded stays visible |
| Load error | GET failed | `ErrorState` with Retry |
| Recalculate error | POST failed | inline error in the card; the previous intent stays visible |

- An empty In scope or Out of scope list shows an explicit "nothing listed" text, not a blank.
- The summary block is labelled "Summary"; it shows the contract's `intent` field.
- **Confidence** is a badge: low / medium / high.
- An out-of-scope defect (WARNING or CRITICAL) needs no client work: the reviewer starts such a
  finding's title with `Out of scope: `, and the findings list shows titles as they are.
- **Sources** is a list: kind (title, description, linked issue, spec file, changed files), its
  reference, and whether it was used, missing or skipped — with the reason when it was not used.
  This is where the user sees "description is empty" or "linked spec not found".
- **Stale**: when the server reports `stale: true`, the card shows a "PR changed since this was
  generated" badge next to the confidence.
- Recalculate errors get specific text by error code: `llm_payment_required` (provider out of
  credit), `llm_model_not_found` (model in Settings → Models does not exist), `config_error`
  (no API key); anything else falls back to a generic line. The global mutation toast still
  fires as for every other mutation.

### 3. Data

`lib/hooks/intent.ts`:

- `useIntent(prId)` — `GET /pulls/:id/intent`, key `["pr-intent", prId]`, `enabled: !!prId`.
- `useRecalculateIntent(prId)` — `POST /pulls/:id/intent/recalculate`; on success writes the
  response into `["pr-intent", prId]`.
- When the PR's active review runs settle, `["pr-intent", prId]` is invalidated too, so an
  intent derived by a review appears without a reload.

Mounting the card issues only the GET.

### 4. Settings → Models

The `review_intent` row already exists in the client mirror and is rendered. Its default changes
to `deepseek/deepseek-v4-flash` via OpenRouter, in step with the server registry.

## Contracts & data

- Types only from `@devdigest/shared` → new `contracts/intent.ts` (`PrIntentDetail`,
  `PrIntentResponse`, `IntentSource`, `IntentConfidence`), identical to the server copy. The
  summary is the existing `intent` field of `Intent`.
- `client/src/lib/feature-models.ts` — `review_intent` default (the runtime registry stays a
  mirror; importing the vendor runtime value breaks the Next build).
- `messages/en/intent.json` — new namespace `intent`: card title, `summary`, `inScope`,
  `outOfScope`, `emptyList`, `confidence.{low,medium,high}`, `sources.title`,
  `sources.kind.*`, `sources.status.*`, `sources.reason.*`, `stale`, `empty.{title,body}`,
  `actions.{generate,recalculate}`, `generating`, `error.{load,generic,paymentRequired,modelNotFound,config}`.
- New files are preferred over edits to keep the merge into `feat/homework-5` small: no change
  to `prReview.json`, `brief.json` or `lib/hooks/index.ts`.

## Acceptance criteria

- [ ] **C-AC-1** — the Overview tab renders `IntentCard` above Description for every PR with a
  resolved `prId`.
- [ ] **C-AC-2 (loaded)** — with an intent, the card shows the summary, an "In scope" list, an
  "Out of scope" list, a confidence badge, a sources list (kind, reference, used / missing /
  skipped, reason) and a Recalculate button; an empty list shows the `emptyList` text.
- [ ] **C-AC-3 (none yet)** — `{ intent: null }` shows the empty title and body and a Generate
  button; mounting the card issues only the GET, never the POST.
- [ ] **C-AC-4 (generating)** — while the mutation is pending the button is `loading` and
  disabled, the card is `aria-busy`, the generating text shows, and previously loaded content
  stays visible.
- [ ] **C-AC-5 (error)** — a failed GET shows `ErrorState` with retry; a failed recalculate
  shows an inline error with specific text for `llm_payment_required`, `llm_model_not_found`
  and `config_error`, and the previous intent stays visible.
- [ ] **C-AC-6 (i18n)** — every visible string comes from `messages/en/intent.json` via
  `useTranslations("intent")`; the component holds no literal UI text.
- [ ] **C-AC-7 (data)** — `useIntent` uses key `["pr-intent", prId]` and GETs
  `/pulls/:id/intent`; `useRecalculateIntent` POSTs `/pulls/:id/intent/recalculate` and writes
  the result into that key; the key is invalidated when the PR's active runs settle.
- [ ] **C-AC-8 (stale)** — `stale: true` shows the "PR changed since this was generated" badge.
- [ ] **C-AC-9 (settings)** — Settings → Models shows the `review_intent` row with default
  `deepseek/deepseek-v4-flash` when no override is saved.
- [ ] **C-AC-10 (showcase / checks)** — `IntentCard` is in the showcase in its loaded, empty,
  generating and error variants; `pnpm typecheck` and `pnpm test` pass in `client/`.

## Tests

| Suite | Covers |
|---|---|
| component — `_components/IntentCard/IntentCard.test.tsx` (props only, `NextIntlClientProvider` with `intent.json`) | C-AC-2, 3, 4, 5, 6, 8 |
| component — `_components/OverviewTab/OverviewTab.test.tsx` (`vi.mock("@/lib/hooks/intent")`) | C-AC-1, 3, 7 |
| `pnpm typecheck`, `pnpm build` | C-AC-9, 10 |

No e2e flow is planned: the hermetic e2e run has no model key, so only the "none yet" state
would be reachable.

## Decisions

Settled with the owner on 2026-10-12:

1. The card sits above Description.
2. A failed recalculate shows the inline text and the global toast; `lib/providers.tsx` is not
   changed.
3. The `feat/homework-5` line "No intent available for this PR." is fixed when the branches are
   merged, not here.
4. Out-of-scope CRITICALs are visible through the `Out of scope: ` title marker; no new UI.
