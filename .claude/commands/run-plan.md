---
description: Execute an approved spec + plan — implementer per package → architecture-reviewer → security-reviewer → fix rounds → plan-verifier (server ∥ client) → report
argument-hint: <path/to/spec.md> <path/to/plan.md> [hw<N>]
---

Run the plan: $ARGUMENTS

You are the main session and you drive the pipeline; the agents do the work. No agent can call
another, so you pass each one's output to the next. This command does NOT run `spec-creator` or
`implementation-planner` — those are run by hand beforehand — and there is no `test-writer`: the
implementer writes the tests its tasks name.

**Keep your own context small** — you are in every request of the run, so what you read is paid
for at every step. Read the spec once. Never read the plan whole: read the section the current
step needs (`grep -n '^## \|^### ' <plan>` gives the line numbers, then read that range) —
Traceability for step 0, the task list for step 1, nothing for the reviews. The agents read the
plan themselves.

## 0. Preconditions — stop if any fails

1. Both paths are given and both files exist. Read the spec in full; of the plan, read only its
   headings and its Traceability table.
2. The spec says `Status: approved` and contains no `[NEEDS CLARIFICATION]`.
3. The plan references that spec, and its Traceability table has a row for every `AC-n` of the
   spec, each with a task and a test.
4. `git status` is clean apart from the spec and the plan, and you are not on `main`.

A failed precondition is not yours to repair: say which one failed and stop. Do not edit the spec
or the plan to make them pass.

`<hw>` for the report is the third argument; without it, the `docs/hw<N>/` folder whose
`requirements.md` the spec was written from. If that is not unambiguous, ask.

## 1. Implement — one implementer per package group

Read the plan's task headings and each task's `Files:` line (not the task bodies) and split the
tasks into at most two groups:

- **server group** — tasks whose files are under `server/` or `reviewer-core/`;
- **client group** — tasks whose files are under `client/`.

A task that touches both sides (a contract in both `vendor/shared` copies) goes to the server
group, together with the copy in `client/src/vendor/shared`, and the client group starts after it.

Launch one `implementer` per non-empty group, each with the spec path, the plan path, the list of
its task ids, and the instruction: carry out ONLY these tasks, in plan order, each task's test
before its code, and touch no file outside the group's packages.

- **Parallel** when the plan marks the groups independent, or when no client task depends on a
  server task that is not done yet (the plan's `Depends on:` lines say). Launch both in ONE message.
- **Sequential** otherwise: the server group first, the client group after its checks pass.
- A plan with tasks in one group only → one implementer, as before.

Wait for the reports.

- A task reported `blocked`, or a deviation that changes what an AC means → stop and ask the user.
  Do not improvise a different design and do not re-plan.
- An implementer that stopped at its turn limit is resumed once (`SendMessage`: continue from
  where it stopped). A second stop → show the user what is done and what is not.
- Run the checks of every touched package yourself (`typecheck` + `test`); do not rely on the
  reports. If they fail, send the failing output back to the implementer of that group once; if
  they still fail, stop and show the user.
- Commit locally: one commit per group, message per repo convention. Never push.

## 2. Reviews — architecture, then security

Both reviewers are read-only and have no shell: give each the changed-file list
(`git diff --name-only <base>...HEAD`) and the plan path.

1. Launch `architecture-reviewer`.
2. When it returns, launch `security-reviewer` on the same changed-file list, with the spec path
   as well (its "Untrusted inputs" section is the threat model of the feature).

Severities, both reviewers → this command: `CRITICAL` → CRITICAL · `WARNING` → major ·
`SUGGESTION` / `INFO` → minor/nit.

## 3. Fix rounds — at most 2

While either review holds a CRITICAL or major finding and fewer than 2 rounds have run:

1. Send the implementer of the package the finding is in ONLY the CRITICAL and major findings of
   BOTH reviewers for its files, verbatim, with the plan path. It fixes those and nothing else.
2. Re-run `typecheck` + `test` of the touched packages yourself.
3. Commit locally (`fix(<scope>): address review`).
4. Re-review **the fix, not the feature**: launch again only the reviewer(s) that had a CRITICAL
   or major finding, and give each (a) the list of its own findings sent to the implementer and
   (b) the files of the fix commit (`git diff --name-only <fix-commit>~1 <fix-commit>`) with the
   changed line ranges (`git diff -U0 <fix-commit>~1 <fix-commit>`, hunk headers only). Its
   instruction: check that each listed finding is closed and that the changed lines introduce
   nothing new; read those ranges and what they call — do not re-read the rest of the feature.

After the second round, stop fixing whatever the result. CRITICAL or major findings that remain go
into the report as open and are shown to the user — never a third round on your own.

minor/nit findings are never sent to the implementer. Show them to the user as a list, from every
review round and both reviewers, and leave the decision to them.

## 4. Verify

Split the ACs by the plan's Traceability table (already read in step 0): an AC whose tasks are all
server-group tasks → **server set**; all client-group → **client set**; tasks in both groups → both
sets, each verifier checking its own side. A plan with tasks in one group only → one verifier with
every AC, as before.

Launch two `plan-verifier`s in ONE message, in parallel. Each gets the spec path, the plan path, the
requirements doc, its AC ids (amended criteria of another spec included) and only its group's part
of the final changed-file list. Each returns the matrix `requirement | evidence | PASS / PARTIAL /
MISSING` for its ACs.

Merge the two into one matrix, in spec order: an AC checked by both gets the evidence of both and the
worse status (MISSING < PARTIAL < PASS). Do not send gaps back to the implementer — verification is
the end of this command. A `needs runtime check` item is run by you (the test command, or the app)
and the real result is recorded next to it.

## 5. Report — `docs/<hw>/plan-verification.md`

Write the file yourself (the verifiers are read-only) — one report from the merged matrix:

1. **Inputs** — spec path + Spec ID, plan path, branch, base and head commit.
2. **Matrix** — one row per AC of the spec, in spec order:
   `AC | task(s) | test (file › case) | commit | evidence (file:line) | status`. Task and test come
   from the plan's Traceability table, commit from `git log`, evidence and status from the
   merged verifier matrix — copied, not improved. A row without a task, test or commit stays visibly empty.
3. **Open rows** — every PARTIAL / MISSING row and what would close it; `None.` only if true.
4. **Reviews** — for the architecture review and the security review separately: rounds run,
   what was fixed, CRITICAL/major still open, and the minor/nit list as shown to the user.
5. **Checks** — each command you ran and its real result.
6. **Deviations** — from the implementers' reports, per group.

Then tell the user: the report path, the PASS / PARTIAL / MISSING counts, what is still open.
Do not set the spec to `implemented`, do not push and do not open a PR — the user does that.

## If a model call fails

An agent launch that fails with a billing or model error (HTTP 402, 404, model not found, credit
exhausted) is not retried, not rerouted to another model and not done by you inline instead.
Stop where you are, report which agent and which step failed with the exact error, what is
already committed, and ask the user how to proceed.
