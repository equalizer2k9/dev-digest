import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

const diff = (name: string) => "```diff\n" + fx(name) + "```";

// Our agent's contract (.claude/agents/architecture-reviewer.md): one line per finding
// `file:line | CRITICAL / WARNING / SUGGESTION | what | evidence`, evidence = quoted line + the rule
// it breaks (skill or AGENTS.md section), then `Verdict: BLOCK` / `Verdict: PASS`.
// The A/B (exp. 3) drops "and the rule it breaks" from the agent — the practice that must move is
// "the evidence names the rule"; everything else is the control. The verdict is a fixed word, so
// it is part of the patternMatch gate, not a judged practice — matched as two substrings, because
// the agent bolds it in varying ways (`**Verdict: BLOCK**`, `Verdict: **BLOCK**`).
//
// Fixtures are real diffs against this repo and are NOT applied on disk — the prompt says so, so
// the agent reads the current files for context and judges the diff.
export const cases: AgentCase[] = [
  {
    name: "route with direct DB access is CRITICAL with the onion rule named",
    kind: "quality",
    prompt:
      "Переглянь архітектуру моєї зміни перед PR. Змінений файл: server/src/modules/agents/routes.ts — " +
      "новий ендпоінт GET /agents/:id/name для хлібних крихт. Гілка локально не застосована, diff нижче.\n\n" +
      diff("agents-route-name.diff"),
    grounding: ["routes.ts", "Verdict", "BLOCK"],
    practices: [
      "reports the finding as a line in the format `file:line | SEVERITY | what | evidence` with `server/src/modules/agents/routes.ts` and a line number in the first field",
      "rates the direct database access from the route as CRITICAL",
      "the evidence names the documented rule the finding breaks — a skill rule, an AGENTS.md section or the reviewer's own documented check — not only the quoted line",
    ],
    maxTurns: 25,
  },
  {
    name: "contract changed in one vendor/shared copy is CRITICAL with the rule named",
    kind: "quality",
    prompt:
      "Перед PR глянь структуру зміни: додав категорію 'architecture' до FindingCategory, щоб знахідки " +
      "архітектурного агента мали свій кошик. Змінений файл: server/src/vendor/shared/contracts/findings.ts, " +
      "гілка локально не застосована, diff нижче.\n\n" +
      diff("shared-finding-category.diff"),
    grounding: ["client/src/vendor/shared", "Verdict", "BLOCK"],
    practices: [
      "reports the finding as a line in the format `file:line | SEVERITY | what | evidence`",
      "flags that the FindingCategory change is missing from the client copy `client/src/vendor/shared/contracts/findings.ts` and rates it CRITICAL",
      "the evidence names the documented rule the finding breaks — a skill rule, an AGENTS.md section or the reviewer's own documented check — not only the quoted line",
    ],
    maxTurns: 25,
  },
  {
    name: "behaviour-preserving service refactor passes without findings",
    kind: "quality",
    prompt:
      "Переглянь архітектуру рефакторингу перед PR: у RepoService виніс побудову clone URL і постановку " +
      "clone-джоби в приватні методи, поведінка та сама. Змінений файл: server/src/modules/repos/service.ts, " +
      "гілка локально не застосована, diff нижче.\n\n" +
      diff("repos-service-refactor.diff"),
    grounding: ["service.ts", "Verdict", "PASS"],
    practices: [
      "reports no CRITICAL and no WARNING finding for this refactor",
      "names the file(s) it checked, including `server/src/modules/repos/service.ts`",
    ],
    maxTurns: 25,
  },
];
