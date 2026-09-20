# Skills Lab — reviewer-core

**Status:** draft · **Package:** reviewer-core · **Date:** 2026-09-20

Siblings: [`server/specs/skills-lab.md`](../../server/specs/skills-lab.md) ·
[`client/specs/skills-lab.md`](../../client/specs/skills-lab.md)

## Problem

`assemblePrompt` already has a `skills` slot: `string[]`, joined with blank lines under a
`## Skills / rules` heading, and mirrored into `PromptAssembly.skills` for the trace. It has
never been fed — the server passes nothing — and as a slot it cannot answer the two questions
Skills Lab asks of it:

- **Which skill is which?** One joined string has no per-skill boundary, so the trace cannot
  show a block per skill, cannot say which version was used, and cannot weigh one skill's
  contribution against another's.
- **How heavy is the skills block?** Nothing measures it, and the engine must not grow a
  tokenizer dependency to find out — it is pure by design.

A third gap is a safety one: an imported or community skill is third-party text that ends up in
the prompt, and today the slot treats every entry as trusted.

## Goals / non-goals

**Goals**

- A structured skill slot that preserves identity, version and order.
- Deterministic order: the array order is the prompt order, end to end.
- Untrusted skill bodies delimiter-wrapped like every other external input.
- Per-skill and whole-block token attribution, through an injected counter, with a dependency-
  free fallback.

**Non-goals**

- Choosing, ranking or filtering skills. The engine renders exactly what it is handed; the
  enabled/linked decision belongs to the server.
- Reading skills from disk, a DB or a registry. The purity invariant stands: no I/O beyond the
  injected `LLMProvider`.
- Counting tokens itself with a real tokenizer. `js-tiktoken` stays a server adapter.

## Behaviour

### 1. The slot

`PromptParts.skills` and `ReviewInput.skills` change from `string[]` to `SkillPart[]`:

```ts
export interface SkillPart {
  id: string;
  name: string;
  version: number;
  body: string;
  /** false → the body is third-party text and gets wrapUntrusted-ed. */
  trusted: boolean;
}
```

This is a breaking change to the public barrel. Nothing in the repo passes `skills` today
(the server is the only consumer and omits it), so no caller has to be migrated — but
`cd ../server && pnpm typecheck` after changing the export, per the package's own rules.

### 2. Rendering

Each skill becomes its own sub-block, in array order:

```
## Skills / rules

### <name> (v<version>)
<body>                          ← trusted: verbatim
<untrusted source="skill:<name>">…</untrusted>   ← untrusted: wrapped
```

- Sub-blocks are joined with a blank line, and the section keeps its current position in the
  user message: after `## PR description`, before `## Relevant memory`.
- Array order is preserved exactly. The server hands skills over sorted by
  `agent_skills.order`, so drag-and-drop order in the UI *is* prompt order (criterion 14).
- `skills` undefined or empty → the section is omitted entirely and `assembly.skills`,
  `assembly.skill_blocks`, `assembly.skills_tokens` are all `null`. The prompt is then
  byte-identical to a run with no skills at all (criterion 20).
- An empty or whitespace-only `body` is skipped: no heading, no block, no `skill_blocks` entry.
- `INJECTION_GUARD` already covers `<untrusted>` blocks, so a wrapped skill body inherits the
  existing defense unchanged. No new guard text, and no keyword-scanning of skill bodies.
- Under `map-reduce`, every chunk gets the identical skills section, and the persisted assembly
  is the last chunk's, as today.

### 3. Measurement

`assemblePrompt` takes an optional counter:

```ts
countTokens?: (text: string) => number;   // default: approxTokens = ceil(len / 4)
```

- Per skill: `tokens = countTokens(renderedSubBlock)` — the heading plus the body in the exact
  form that reaches the model, wrapped for untrusted skills. It measures that skill's
  contribution, never the surrounding prompt (criterion 19).
- Whole block: `skills_tokens = countTokens(skillsBlock)` — the joined section body, heading
  excluded. The sum of the per-skill numbers can differ from it by a token or two because BPE
  merges across a join boundary; the block total is the authoritative number and the one the UI
  puts beside the section header.
- The counter is called once per skill plus once for the block: `n + 1` calls, no loops.
- The default keeps the engine dependency-free and makes every existing test deterministic;
  the server injects `container.tokenizer.count` (js-tiktoken `cl100k_base`), which itself
  degrades to the same `ceil(chars/4)` heuristic if the BPE ranks fail to load.
- Counting never throws: a `countTokens` that throws is caught and falls back to
  `approxTokens` for that call. A token number must never fail a review.

### 4. Assembly record

`PromptAssembly` (shared contract, both copies) gains two nullish fields, filled here:

- `skill_blocks: [{ skill_id, name, version, tokens }]` — one per rendered skill, in order.
- `skills_tokens: number` — the block total.

`skills` keeps its current meaning: the rendered section body as a single string, so existing
trace readers and old persisted traces stay valid.

## Contracts & data

- `src/prompt.ts` — `SkillPart`, `PromptParts.skills`, `PromptParts.countTokens`, per-skill
  rendering, `approxTokens`, the two new assembly fields.
- `src/review/run.ts` — `ReviewInput.skills: SkillPart[]`, `ReviewInput.countTokens`, both
  forwarded into `promptParts` unchanged.
- `src/index.ts` — export `type SkillPart` and `approxTokens` alongside `assemblePrompt`.
- `@devdigest/shared` `trace.ts` — `SkillBlock`, `PromptAssembly.skill_blocks`,
  `PromptAssembly.skills_tokens`, in **both** copies (`server/src/vendor/shared`,
  `client/src/vendor/shared`). Defined in the
  [server spec](../../server/specs/skills-lab.md#contracts--data); do not duplicate the edit.
- No new runtime dependency. `package.json` is untouched.

## Acceptance criteria

Numbered by [`docs/hw2-criteria.md`](../../docs/hw2-criteria.md); this package owns the engine
half of the three criteria that reach into the prompt.

- [ ] **AC-14** Skills are rendered in the exact order of the `skills` array — the order the
      server read out of `agent_skills.order`. A test that swaps two entries sees the two
      sub-blocks swap in both the user message and `assembly.skill_blocks`.
- [ ] **AC-19** `assembly.skills_tokens` is the token count of the skills block alone, and
      every `skill_blocks[i].tokens` is that one skill's rendered contribution; the injected
      `countTokens` is used when supplied, `ceil(len/4)` when not, and neither number is
      derived from the full prompt.
- [ ] **AC-20** With no skills, or with every skill filtered out upstream, the `## Skills /
      rules` section is absent from the messages and `skills`, `skill_blocks` and
      `skills_tokens` are `null` — the prompt is byte-identical to the pre-skills baseline.

Supporting invariants, not graded criteria but required by this package's rules:

- [ ] An untrusted skill body passes through `wrapUntrusted('skill:<name>', body)`; a trusted
      one does not.
- [ ] No DB, filesystem, network or process access is added; `npm test` still runs hermetically
      with a stubbed `LLMProvider`.

## Tests

`test/prompt.test.ts` (extend) and `test/run.test.ts`:

- order preserved across two and three skills, including after a swap;
- trusted body verbatim, untrusted body wrapped, `</untrusted>` inside a body neutralised;
- empty array, `undefined`, and a whitespace-only body each omit their block;
- per-skill and block token counts use an injected spy counter, and the spy is called `n + 1`
  times; without a counter the numbers match `ceil(len/4)`;
- a throwing `countTokens` still yields a prompt and finite token numbers;
- `run.test.ts`: `reviewPullRequest` forwards `skills` + `countTokens` and the returned
  assembly carries `skill_blocks` in both `single-pass` and `map-reduce`.

## Open questions

- Should the sub-block heading (`### <name> (v<version>)`) count toward that skill's `tokens`?
  Spec'd as yes — it is text the skill causes to exist. Revisit if the UI wants body-only
  numbers.
- `SkillPart.trusted` is computed by the server from `SkillSource`. If a "vetted" flag ever
  lands on a skill row, this field becomes its projection rather than a source mapping.
