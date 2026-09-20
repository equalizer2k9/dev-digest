# Citation Grounding

**Status:** implemented · **Package:** reviewer-core · **Date:** 2026-09-20

The behaviour contract of the citation gate in [grounding.ts](../src/grounding.ts) — what a finding
must cite to survive, what is dropped and why, and what the rest of the pipeline does (and
deliberately does not do) with the result. The gate's place in the pipeline is described in
[docs/architecture.md](../docs/architecture.md).

## Problem

A model asked to review a diff will occasionally cite a location that does not exist: a line number
past the end of the file, a line in a part of the file the PR never touched, or a file that is not
in the diff at all. Those findings look exactly like real ones — same severity, same confident
rationale — and if they reach the UI or a posted GitHub review they are worse than no review: they
send a human to a line that has nothing wrong with it, and they poison the score, the blocker count
and the CI gate.

Prompting cannot fix this reliably, and neither can trusting the model's own confidence. The gate is
therefore **mechanical**: every diff-finding is checked against the parsed diff, and anything that
cannot be matched is removed before the review leaves the engine.

## Goals / non-goals

**Goals**
- Guarantee that every finding in a returned `Review` points at a file **and** a line region that is
  really in the diff under review.
- Be deterministic and free of model input — pure set membership against the parsed `UnifiedDiff`.
- Never drop silently: every removal is reported with a reason, both on the outcome and as a
  progress event.
- Keep whole-file scanners (secret scan, trifecta, phantom, hook) usable, since their findings are
  not attached to a hunk by nature.

**Non-goals**
- Judging whether a finding is *correct* — only whether its location is real.
- Deduplicating, re-ranking, or filtering by confidence or severity.
- Repairing a bad citation (no snapping to the nearest hunk, no re-asking the model). Anchoring a
  *comment* to a nearby line is a separate concern, handled in
  [to-review.ts](../src/output/to-review.ts).
- Re-deriving `verdict` — see [Downstream consequences](#downstream-consequences).

## Behaviour

### The index

`buildLineIndex(diff)` ([grounding.ts:24-39](../src/grounding.ts)) builds `file path → Set<line>` of
**new-side** line numbers:

- for each hunk with a non-empty `newLineNumbers`, every number in it;
- otherwise a fallback over the hunk's declared range,
  `newStart … newStart + max(newLines, 1) − 1` ([grounding.ts:33](../src/grounding.ts)) — so a hunk
  declaring `newLines: 0` still contributes exactly `newStart`.

The set is whatever the diff parser put in `newLineNumbers`. With this repo's parser
([diff-parser.ts:63-74](../../server/src/adapters/git/diff-parser.ts)) that is every added line
**and** every context line of the hunk — deleted lines consume no new-side number. So an unchanged
line sitting inside a hunk is a groundable citation; an unchanged line outside every hunk is not.

`filesInDiff` ([grounding.ts:54](../src/grounding.ts)) is the set of `diff.files[].path`, matched by
**exact string equality**. There is no normalisation in this package: no `a/`–`b/` stripping, no
case folding, no relative/absolute rewriting, no trimming. Normalisation, if any, happens upstream
in the parser, which strips the leading `b/` from the `+++` line and resolves `/dev/null`
([diff-parser.ts:39-43](../../server/src/adapters/git/diff-parser.ts)). A finding citing
`./src/x.ts` or `b/src/x.ts` for a file listed as `src/x.ts` is therefore **dropped**.

### The acceptance rule

A finding is kept **iff** both hold ([grounding.ts:58-81](../src/grounding.ts)):

1. `finding.file` is exactly a path in `diff.files`; **and**
2. either `finding.kind` is one of the full-file kinds — `secret_leak`, `lethal_trifecta`,
   `phantom`, `hook` ([grounding.ts:16](../src/grounding.ts)) — in which case (1) alone is enough;
   or the inclusive range `[min(start_line, end_line), max(start_line, end_line)]` contains at least
   one line present in that file's index:

```ts
// grounding.ts:73
if (rangeIntersects(lines, finding.start_line, finding.end_line)) {
```

`rangeIntersects` ([grounding.ts:41-46](../src/grounding.ts)) walks the range and returns on the
first member, so **one** matching line is sufficient — the range does not have to be contained in
the diff, only to touch it. It normalises the bounds with `Math.min` / `Math.max`, so an inverted
range (`start_line > end_line`) is evaluated the same as the ordered one.

The fields consulted are exactly `file`, `start_line`, `end_line` and `kind`
([findings.ts:47-62](../../server/src/vendor/shared/contracts/findings.ts)). `confidence`,
`severity`, `category`, `id`, `rationale`, `suggestion`, `evidence` and `trifecta_components` are
**not** consulted; a `confidence: 0.99` finding on a hallucinated line is dropped exactly like a
`0.2` one.

### What gets dropped, case by case

`GroundingResult` ([grounding.ts:18-21](../src/grounding.ts)) returns `kept` and
`dropped: { finding, reason }[]`. The checks run in this order, and the first failure wins:

| # | Condition | Applies to | Reason string |
|---|---|---|---|
| 1 | `finding.file` is not an exact path in `diff.files` | **all** findings, full-file kinds included ([grounding.ts:61-64](../src/grounding.ts) runs before the kind check) | `file '<file>' not present in diff` |
| 2 | range touches no indexed line for that file | findings whose `kind` is `finding`, `null`, `undefined`, or any non-full-file value | `lines <start>-<end> do not intersect any diff hunk in '<file>'` |

Consequences worth stating explicitly:

- A **full-file finding still needs its file in the diff.** `secret_leak` on a file the PR did not
  touch is dropped; line numbers are then irrelevant.
- A finding with **no `kind`** is treated as a diff-finding and must intersect. `kind` is
  `.nullish()` in the contract, and the check is `finding.kind ? FULL_FILE_KINDS.has(...) : false`
  ([grounding.ts:59](../src/grounding.ts)).
- A file present in the diff but with **no hunks** (or hunks producing no lines) yields an empty
  set, so every non-full-file finding on it is dropped by case 2, never by case 1.
- If `diff.files` contains the **same path twice**, the later entry's set replaces the earlier one
  ([grounding.ts:36](../src/grounding.ts) `idx.set`), so only the last one grounds.

### Partial survival vs whole discard

The unit of the gate is **one finding**. Nothing else is partially rewritten:

- Findings survive or are removed individually; a review with ten findings can return any subset,
  including the empty set. The kept findings are returned **unmodified** — the gate never edits
  `start_line`, `end_line`, `file`, or any other field.
- A dropped finding is removed whole. There is no "keep it with a warning flag", no downgrade of
  severity, and no partial range trimming to the intersecting lines.
- The review itself is never discarded: `summary` and `verdict` survive untouched even when every
  finding is dropped.
- Dropped findings are not lost to the operator — they are returned on `outcome.dropped`
  ([run.ts:101](../src/review/run.ts)) and each one is emitted as an `info` event
  `grounding dropped "<title>": <reason>` ([run.ts:199-201](../src/review/run.ts)).

### The summary string

`groundingSummary(result)` ([grounding.ts:87-90](../src/grounding.ts)) renders
`` `${kept}/${kept + dropped} passed` `` — e.g. `1/2 passed`. The denominator is the number of
findings that entered the gate, so a review with no findings summarises as `0/0 passed`, not as a
failure. The server stores this string on the run
([run-executor.ts:251](../../server/src/modules/reviews/run-executor.ts)).

## Downstream consequences

What the pipeline does with the survivors ([run.ts:207-218](../src/review/run.ts)):

```ts
// run.ts:208
review: { ...merged, findings: ground.kept, score: scoreFromFindings(ground.kept) },
```

- **`findings` is the kept set.** Only grounded findings are persisted and rendered.
- **`score` is recomputed from the survivors.** `scoreFromFindings`
  ([reduce.ts:27-30](../src/review/reduce.ts)) subtracts 35 per `CRITICAL`, 12 per `WARNING`, 3 per
  `SUGGESTION` from 100 and clamps to 0–100. It is applied to `ground.kept`, not to the
  pre-grounding set and not to the model's self-reported number, so the score can never contradict
  the list beneath it.
- **`verdict` is NOT re-derived.** It comes from `reduceReviews` (the model's verdict, or the worst
  verdict across chunks in map-reduce, [reduce.ts:46-49](../src/review/reduce.ts)) and rides the
  spread `...merged` through the gate untouched. The same applies to `summary`.

  This is an **intentional contract point, not an oversight**: the model owns `verdict`, which is
  why every reviewer prompt is required to state the verdict mapping explicitly
  ([docs/agent-prompts/README.md](../../docs/agent-prompts/README.md)). The observable consequence
  is that a review can carry `verdict: 'request_changes'` with **zero findings** — either because
  the model returned a mismatched verdict, or because grounding dropped every finding that
  justified it. Consumers that need a trustworthy blocking signal must not read `verdict`; they read
  the deterministic ones derived from the surviving severities: `countBlockers`
  ([to-review.ts:48-51](../src/output/to-review.ts)), used by the server at
  [run-executor.ts:241](../../server/src/modules/reviews/run-executor.ts), and the GitHub review
  event computed in `toReviewPayload` ([to-review.ts:156-161](../src/output/to-review.ts)), which
  ignores `verdict` outright.

## Contracts & data

| Contract | Where | Used by the gate for |
|---|---|---|
| `Finding` | [contracts/findings.ts:47-62](../../server/src/vendor/shared/contracts/findings.ts) | `file`, `start_line`, `end_line`, `kind` |
| `FindingKind` | [contracts/findings.ts:17-23](../../server/src/vendor/shared/contracts/findings.ts) | the five values; four of them are full-file |
| `UnifiedDiff` / `DiffHunk` | [adapters.ts:175-188](../../server/src/vendor/shared/adapters.ts) | `files[].path`, `hunks[].newLineNumbers`, `newStart`, `newLines` |

Both diverged copies of `@devdigest/shared` matter if these ever change (root CLAUDE.md);
reviewer-core reads the server's copy via its tsconfig path alias
([tsconfig.json:21-23](../tsconfig.json)).

`groundFindings`, `groundingSummary` and `GroundingResult` are public via the barrel
([index.ts:23](../src/index.ts)). `buildLineIndex` is **not** exported from the barrel — it is
imported directly by [to-review.ts:2](../src/output/to-review.ts), which reuses the same index to
anchor inline comments.

## Acceptance criteria

- [x] A finding whose `file` is not an exact path in `diff.files` is dropped, whatever its `kind`.
- [x] A non-full-file finding whose `[start_line, end_line]` range shares no line with that file's
      index is dropped.
- [x] A finding whose range touches at least one indexed line is kept, even when `end_line` itself
      is outside the diff.
- [x] `kind ∈ {secret_leak, lethal_trifecta, phantom, hook}` grounds on file presence alone.
- [x] Kept findings are returned byte-identical to their input.
- [x] Every drop appears in `outcome.dropped` with a reason and as an `info` event.
- [x] `outcome.grounding` reads `"<kept>/<total> passed"`.
- [x] `review.score` equals `scoreFromFindings(kept)`.
- [x] `review.verdict` equals the reduced model verdict, regardless of how many findings were
      dropped.

## Tests

Pinned in [test/](../test) (`npm test`, hermetic, stubbed `LLMProvider`):

| Case | Where | What it pins |
|---|---|---|
| Hallucinated line dropped, real line kept | [run.test.ts:46-70](../test/run.test.ts) — fixture at [run.test.ts:14-44](../test/run.test.ts) | Two `kind: 'finding'` findings on `src/config.ts`: line 11 (an added line of the `MockGitClient` diff, [mocks.ts:286-291](../../server/src/adapters/mocks.ts)) survives; line 999 is dropped. `outcome.grounding === '1/2 passed'`, `dropped.length === 1`, one finding left with `start_line === 11`. |
| Score follows the survivors | [run.test.ts:67](../test/run.test.ts) | The model reported `score: 38`; one surviving `CRITICAL` ⇒ **65**. Grounding's output, not the model's number, drives the score. |
| Empty findings ⇒ 100 | [run.test.ts:72-89](../test/run.test.ts) | A model "approving" with a nonsense `score: 10` and no findings ⇒ score **100**; the gate passes an empty set through unharmed. |
| Drops are announced | [run.test.ts:69](../test/run.test.ts) | A `Citation grounding` message reaches `onEvent`. |
| Range intersects but `end_line` does not | [to-review.test.ts:136-141](../test/to-review.test.ts) | Range 10–30 against a diff whose only new-side line is 12: the range **is** grounded, and `resolveCommentLine` anchors the comment at 12 — the reason a kept finding still needs anchoring downstream. |
| No line of the range in the diff | [to-review.test.ts:143-148](../test/to-review.test.ts) | Range 10–30 against new-side line 500: nothing in range, the inline comment is dropped, the finding stays in the body. Same `buildLineIndex` + membership logic the gate uses. |

Note the asymmetry the fixtures encode: `verdict: 'request_changes'` in the `run.test.ts` fixture
survives into the outcome even though half the findings were dropped — no test asserts a re-derived
verdict, because there is none.

## Open questions

- The `verdict` pass-through is deliberate but load-bearing on prompt quality: a model that returns
  `request_changes` with zero findings produces a review the UI shows as blocking while listing
  nothing. Deriving `verdict` from the surviving severities (as `toReviewPayload` already does for
  the GitHub event) would close it; nothing in the code does so today.
- Exact-match file paths mean a model that echoes a `b/`-prefixed or `./`-prefixed path loses every
  finding on that file, with only the drop reason to show for it. No normalisation exists today.
