# HW6 mentor follow-ups (built in HW7)

Spec: [SPEC-03 AC-46…AC-52](../../../specs/eval-pipeline/spec.md) · branch `feat/hw6-followups`.

| Mentor point | Done |
|---|---|
| Eval case modal instead of instant save | "Turn into eval case" opens `EvalCaseModal`: frozen-diff fragment with the zone highlighted, editable name and zone, read-only type, Run case / Save / Cancel. Save goes through the same creation path and checks (AC-5, AC-45). |
| Run and Edit per case in the Evals tab | Run = one model call, result inline, never recorded as a run (history, Compare, Dashboard untouched). Edit = name and zone, same checks; type and frozen input read-only. |
| "View full dashboard" link | In the Evals tab, opens `/eval`. |
| Dispatch 0/2 | `architecture-reviewer` description now covers a plan or design before code; `researcher` says conformance is not its job. |

## Live check (PR #21, General Reviewer, 2026-10-16)

| Step | Result | Screenshot |
|---|---|---|
| Turn into eval case → modal, zone edited 113 → 116–118 | fragment highlights 116–118 | [01](01-case-modal.png) |
| Run case | Passed · 1 kept · 0 dropped · 11.4 s · $0.001; DB: no case, no run | [02](02-run-case-result.png) |
| Save | case stored with zone 116–118, toast links to Evals | [03](03-saved-toast.png) |
| Evals tab → Run on `routes.ts:117` | Failed · 1 kept · 15.8 s · $0.000 inline; run history still 4 runs | [04](04-evals-tab-run.png) |
| Edit → rename + 117–118 | saved | [05](05-evals-tab-edit.png) |
| Edit → 50–60 (outside every hunk) | refused inline, nothing changed | [06](06-evals-tab-edit-refused.png) |
| View full dashboard → | `/eval` | [07](07-view-full-dashboard.png) |

Found during the check and fixed: the modal rendered inside the finding card, so later cards painted
over it — it now portals to `<body>`.

## Workflow eval: `eval:repeat workflow -n 2 --label wf-desc` vs wf-1 (HW6)

Pass counts are the case assertions read from the traces; the repeat summary itself prints
`!isError` per session (root `INSIGHTS.md`).

| Case | wf-1 | wf-desc | Trace (wf-desc) |
|---|---|---|---|
| dispatch — plan review of a not-yet-written route | 0/2 | **2/2** | run 1: `Skill(onion-architecture)` → `Agent(architecture-reviewer)`; run 2: `Read server/AGENTS.md` → `Agent(architecture-reviewer)` |
| contrast — reviewer-prompt change reads `docs/agent-prompts/README.md` | 1/2 | 1/2 | run 1 read it; run 2 answered in 1 turn with no tool (control read nothing both runs) |
| trace — server task reads `server/AGENTS.md` first | 0/2 | 0/2 | both runs went straight to `repos/*` code |
| activation + — `engineering-insights` | 2/2 | 2/2 | `Skill(engineering-insights)` both runs; run 1 then hit `maxTurns: 5` (summary shows 1/2) |
| activation − — explain only | 2/2 | 2/2 | no Skill call; run 1 delegated to `researcher` |

Nothing regressed; contrast and trace failures are the HW6 causes (model answering without tools;
the `<pkg>/AGENTS.md` rule sits in a table header), not the agent descriptions.
