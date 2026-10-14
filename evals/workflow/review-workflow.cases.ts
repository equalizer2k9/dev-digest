import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts that our real on-disk harness (root AGENTS.md, which
 * CLAUDE.md links to, plus .claude/skills and .claude/agents, loaded via settingSources:["project"])
 * routes work the way AGENTS.md says. Every prompt is how a developer would phrase the task: it never
 * names the file, skill or agent the case checks for — the trace has to show the harness found it.
 *
 * Budget: 6 Claude sessions per run.
 *   - dispatch                                   = 1
 *   - contrast (repo vs empty tmpdir)            = 2
 *   - trace                                      = 1
 *   - activation pair (positive + near-miss)     = 2
 *
 * Run it in a throwaway git worktree: sessions use bypassPermissions over the checkout.
 */
export const cases: WorkflowCase[] = [
  // --- dispatch (1): a plan review for a not-yet-written route should go to architecture-reviewer.
  // GET /repos/:id/branches does not exist, so there is no code to review inline.
  {
    kind: "dispatch",
    name: "a layer review of a planned route is dispatched to architecture-reviewer",
    prompt:
      "Планую новий роут GET /repos/:id/branches — список гілок клону. Коду ще нема: роут викличе " +
      "RepoService.listBranches, а сервіс візьме git-клієнт з контейнера й прочитає гілки. Перш ніж " +
      "писати, оціни цей план на відповідність шарам server.",
    expectSubagent: "architecture-reviewer",
    maxTurns: 8,
  },

  // --- contrast (2): AGENTS.md "Writing or changing a reviewer agent prompt → docs/agent-prompts/README.md".
  // Treatment = the repo; control = an empty tmpdir with no project config, where the file can't be found.
  {
    kind: "contrast",
    name: "a reviewer-prompt change reads the agent-prompts guide only with AGENTS.md loaded",
    prompt: "Хочу змінити системний промпт нашого рев'ю-агента. З чого почати?",
    expectFileRead: "docs/agent-prompts/README.md",
    maxTurns: 6,
  },

  // --- trace (1): AGENTS.md "read <pkg>/AGENTS.md before working in a package".
  // repos.createdAt exists in the table but is not in the Repo DTO, so the task is real.
  {
    kind: "trace",
    name: "a small server task reads server/AGENTS.md first",
    prompt:
      "Хочу, щоб GET /repos віддавав ще й дату, коли репо додали в студію — у таблиці вона є, а у " +
      "відповіді нема. Що саме змінити в server?",
    expectFilesRead: ["server/AGENTS.md"],
    maxTurns: 8,
  },

  // --- activation pair (2): a freshly confirmed root cause → engineering-insights; explaining the
  // same topic → no insight. The finding is real (root INSIGHTS.md, 2026-10-14).
  {
    kind: "activation",
    name: "engineering-insights activates on a freshly confirmed root cause",
    prompt:
      "Розібрався, чому pnpm install в evals/ падав з ERR_PNPM_IGNORED_BUILDS на esbuild: pnpm 12 " +
      "ігнорує pnpm.onlyBuiltDependencies у package.json, дозвіл тепер — allowBuilds у " +
      "pnpm-workspace.yaml. Перевірив: з allowBuilds ставиться чисто.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 5,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic does not record an insight",
    prompt: "Поясни, що таке allowBuilds у pnpm і чому pnpm install може падати з ERR_PNPM_IGNORED_BUILDS.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 5,
  },
];
