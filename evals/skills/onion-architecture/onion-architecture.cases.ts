import type { SkillCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

const diff = (name: string) => "```diff\n" + fx(name) + "```";

// Three real server diffs: the PR #19 route (test/hw5-violates-invariant), a service that builds
// its own git adapter, and a behaviour-preserving refactor with no boundary change (negative).
// Concrete facts (file, offending call / import) are the patternMatch gate; the judge scores
// only what a substring cannot settle. Practices are curated by `eval:benchmark` (with vs without
// the skill) — one that passes without the skill measures nothing and was dropped or rewritten
// (docs/hw6/lab/report.md, experiment 2).
export const cases: SkillCase[] = [
  {
    name: "route that queries the DB itself is sent to the repository",
    kind: "quality",
    prompt:
      "Додав ендпоінт GET /agents/:id/name — редактору агента для хлібних крихт потрібне лише ім'я, " +
      "тягнути всього агента не хотілось. Глянь diff перед PR: чи нормально так по структурі server, " +
      "чи щось переробити?\n\n" +
      diff("agents-route-name.diff"),
    grounding: ["routes.ts", "container.db", "drizzle-orm"],
    practices: [
      "recommends moving the select into the agents repository (repository.ts / AgentsRepository) and calling it through AgentsService, so the route only delegates",
      "states that the repository is the only layer allowed to touch Drizzle tables, so a route must not use `container.db`, drizzle-orm operators or schema imports",
      "requires the moved query to stay workspace-scoped — the repository method keeps the `workspaceId` filter",
    ],
  },
  {
    name: "service that constructs its own git adapter is sent back to the container",
    kind: "quality",
    prompt:
      "У runCloneJob тепер створюю git-клієнт прямо в сервісі — хотів, щоб клон ішов у cloneDir з " +
      "конфіга без зайвих обгорток. Локально працює, репо клонується. Подивись, будь ласка, перед PR, " +
      "чи це ок для нашого server.\n\n" +
      diff("repos-service-git-client.diff"),
    grounding: ["SimpleGitClient", "container.git"],
    practices: [
      "states that adapters are constructed only in the composition root `src/platform/container.ts`",
      "says the service must not import the concrete adapter class and should rely on the `GitClient` interface resolved off the Container",
      "proposes the fix: go back to `this.container.git` and, if the clone directory has to change, change it where the adapter is wired (`platform/container.ts` / `AppConfig.cloneDir`), not in the service",
    ],
  },
  {
    name: "behaviour-preserving refactor inside the service is not flagged",
    kind: "quality",
    prompt:
      "Невеликий рефакторинг RepoService: виніс побудову clone URL і постановку clone-джоби в приватні " +
      "методи, поведінка та сама. Глянь перед PR, чи я нічого не порушив по шарах.\n\n" +
      diff("repos-service-refactor.diff"),
    grounding: ["authenticatedUrl"],
    practices: [
      "states that reading the token through `this.container.secrets` in the service is the sanctioned path (secrets go through SecretsProvider, resolved off the Container)",
      "justifies the no-violation verdict with a named documented rule of the server's onion architecture (a numbered rule, the route → service → repository direction, or the Container / SecretsProvider rule), not only with generic clean-code reasons such as DRY or naming",
    ],
  },
];
