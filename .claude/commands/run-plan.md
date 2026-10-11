---
description: Execute an approved spec + plan — implementer → architecture-reviewer → fix rounds → plan-verifier → report
argument-hint: <path/to/spec.md> <path/to/plan.md> [hw<N>]
---

Run the plan: $ARGUMENTS

You are the main session and you drive the pipeline; the agents do the work. No agent can call
another, so you pass each one's output to the next. This command does NOT run `spec-creator` or
`implementation-planner` — those are run by hand beforehand — and there is no `test-writer`: the
implementer writes the tests its tasks name.

## 0. Preconditions — stop if any fails

1. Both paths are given and both files exist. Read them in full.
2. The spec says `Status: approved` and contains no `[NEEDS CLARIFICATION]`.
3. The plan references that spec, and its Traceability table has a row for every `AC-n` of the
   spec, each with a task and a test.
4. `git status` is clean apart from the spec and the plan, and you are not on `main`.

A failed precondition is not yours to repair: say which one failed and stop. Do not edit the spec
or the plan to make them pass.

`<hw>` for the report is the third argument; without it, the `docs/hw<N>/` folder whose
`requirements.md` the spec was written from. If that is not unambiguous, ask.

## 1. Implement

Launch `implementer` with the spec path, the plan path, and the instruction to carry out tasks
`T-1 … T-n` in plan order, writing each task's test before its code. Wait for its report.

- A task reported `blocked`, or a deviation that changes what an AC means → stop and ask the user.
  Do not improvise a different design and do not re-plan.
- Run the checks of every touched package yourself (`typecheck` + `test`); do not rely on the
  report. If they fail, send the failing output back to the implementer once; if they still fail,
  stop and show the user.
- Commit locally: one commit for the implementation, message per repo convention. Never push.

## 2. Architecture review

Launch `architecture-reviewer` with the changed-file list (`git diff --name-only <base>...HEAD` —
it has no shell) and the plan path.

Its severities map to this command's as: `CRITICAL` → CRITICAL · `WARNING` → major ·
`SUGGESTION` → minor/nit.

## 3. Fix rounds — at most 2

While the review holds a CRITICAL or major finding and fewer than 2 rounds have run:

1. Send the implementer ONLY the CRITICAL and major findings, verbatim, with the plan path. It
   fixes those and nothing else.
2. Re-run `typecheck` + `test` of the touched packages yourself.
3. Commit locally (`fix(<scope>): address architecture review`).
4. Launch `architecture-reviewer` again on the updated changed-file list.

After the second round, stop fixing whatever the result. CRITICAL or major findings that remain go
into the report as open and are shown to the user — never a third round on your own.

minor/nit findings are never sent to the implementer. Show them to the user as a list, from every
review round, and leave the decision to them.

## 4. Verify

Launch `plan-verifier` with the spec path, the plan path, the requirements doc and the final
changed-file list. It returns the matrix `requirement | evidence | PASS / PARTIAL / MISSING`.

Do not send its gaps back to the implementer — verification is the end of this command. A
`needs runtime check` item is run by you (the test command, or the app) and the real result is
recorded next to it.

## 5. Report — `docs/<hw>/plan-verification.md`

Write the file yourself (the verifier is read-only):

1. **Inputs** — spec path + Spec ID, plan path, branch, base and head commit.
2. **Matrix** — one row per AC of the spec, in spec order:
   `AC | task(s) | test (file › case) | commit | evidence (file:line) | status`. Task and test come
   from the plan's Traceability table, commit from `git log`, evidence and status from the
   verifier — copied, not improved. A row without a task, test or commit stays visibly empty.
3. **Open rows** — every PARTIAL / MISSING row and what would close it; `None.` only if true.
4. **Architecture review** — rounds run, what was fixed, CRITICAL/major still open, and the
   minor/nit list as shown to the user.
5. **Checks** — each command you ran and its real result.
6. **Deviations** — from the implementer's reports.

Then tell the user: the report path, the PASS / PARTIAL / MISSING counts, what is still open.
Do not set the spec to `implemented`, do not push and do not open a PR — the user does that.

## If a model call fails

An agent launch that fails with a billing or model error (HTTP 402, 404, model not found, credit
exhausted) is not retried, not rerouted to another model and not done by you inline instead.
Stop where you are, report which agent and which step failed with the exact error, what is
already committed, and ask the user how to proceed.
