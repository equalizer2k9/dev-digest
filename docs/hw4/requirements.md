# ДЗ №4 — Blast Radius + devdigest-mcp: вимоги

Джерело: урок L04 і сторінка ДЗ на edu.goit.global (зібрано 2026-09-28). Дедлайн 27.09.2026 23:45 — минув.

## Що робимо

Показати, що ще в репо може зачепити diff: символи, оголошені у змінених файлах → хто їх імпортує/викликає → які HTTP-ендпоінти й крони від цього залежать. Дані вже пораховані `repo-intel` при клонуванні — фіча нічого не аналізує заново і **не кличе модель** (орієнтир лаби: відповідь < 200 мс, нуль LLM-викликів у логах).

Дві частини:

1. UI-блок **Blast radius** на вкладці Overview сторінки PR.
2. Робочий tool `get_blast_radius` у локальному MCP-сервері **devdigest-mcp** — Claude Code отримує ту саму карту, що й браузер.

Здача: PR у форку з описом + демо-відео 1–3 хв за сценарієм нижче. DoD: усі P1 видно у відео; P2/P3 не блокують. Будувати конвеєром L03: planner → implementer → (architecture-reviewer ∥ plan-verifier); в описі PR — хто що зробив.

## Передумова — devdigest-mcp (лаба L04)

Локальний MCP-сервер на TypeScript (`@modelcontextprotocol/sdk`: `McpServer` + `StdioServerTransport` + zod), транспорт stdio, **тонка обгортка над Fastify API DevDigest через HTTP**, без копії доменної логіки. Окремий пакет, окрема команда запуску (не піднімається скриптами застосунку). Реєстрація в `.mcp.json` (command, args). Перевірка — MCP Inspector, потім Claude Code.

| Tool | Що | Тип |
| --- | --- | --- |
| `list_agents` | налаштовані рев'юери; агент бере з них валідний id | read |
| `run_agent_on_pr` | запускає рев'ю, чекає (блокуюче, ліміт 120 с), повертає findings | єдиний write |
| `get_findings` | стислий вердикт готового прогону | read |
| `get_conventions` | конвенції репо (`repo-conventions` з ДЗ №2) | read |
| `get_blast_radius` | карта впливу PR — у ДЗ робоча, викликає роут нижче | read |

- `list_prs` / `list_repos` не додаємо: є `gh pr list` і офіційний GitHub MCP, дублювання = зайві схеми.
- Чекліст на кожен tool: короткий опис «коли викликати, які аргументи, що повертає» + обмеження; плоскі прості аргументи; стисла структурована відповідь без зайвих полів; помилка підказує наступний крок («агента не знайдено — виклич list_agents» замість 404); читальні — `readOnlyHint: true`; реальні повноваження обмежує доменний код, а не анотації.
- Сценарій лаби: «проревʼюй PR №N агентом Security Reviewer, чи є критичні знахідки» → `list_agents → run_agent_on_pr → get_findings` → у відповіді фактичні знахідки DevDigest.

## Що вже є в стартері (спершу знайти у своєму коді)

| Що | Деталі |
| --- | --- |
| Фасад | `repoIntel.getBlastRadius(repoId, changedFiles)` → `BlastResult { changedSymbols, callers[{file, symbol, viaSymbol, line, rank}] (плаский), impactedEndpoints ("METHOD /path"), factsByFile (ендпоінти й крони по файлу-викликачу), degraded, reason }`. Сам відкидає файл оголошення, знаходить ім'я функції-викликача, підтягує ендпоінти. Не кидає: без даних — порожні масиви + `degraded: true`, reason ∈ `flag_off / index_failed / index_partial / repo_too_large / no_data` |
| Ліміти | `MAX_CALLERS_PER_SYMBOL = 20`, `BFS_DEPTH = 2` у `server/src/modules/repo-intel/constants.ts` |
| Контракт | Zod `BlastRadius` у `server/src/vendor/shared/contracts/brief.ts` + ідентична копія в `client/src/vendor/shared/contracts/brief.ts`: `changed_symbols[]`, `downstream[{ symbol, callers[{name, file, line}], endpoints_affected[], crons_affected[] }]`, `summary`. Там же `PrHistory` (для P3) |
| Лінки | `githubBlobUrl(repoFullName, sha, file, startLine)` у `client/src/lib/github-urls.ts` — викликачі не в diff, тож лінк у GitHub |
| i18n | `client/messages/en/blast.json`: `stat.symbols`, `stat.callers`, `stat.endpoints`, `stat.crons`, `callerCount`, `noDownstream`, `view.tree`, `view.graph` |
| Індекс | `GET /repos/:id/index-state`, `POST /repos/:id/resync` |

Чого немає: роута, модуля `server/src/modules/blast/`, UI-блоку (Overview зараз — лише опис PR, `_components/OverviewTab/OverviewTab.tsx`), клієнтського хука, пакета devdigest-mcp.

Головна серверна робота — мапінг: плаский `callers` групуємо за `viaSymbol` → `downstream`; ендпоінти/крони групи — з `factsByFile` за файлами її викликачів; `summary` — рядок із чисел, без моделі; `degraded` + reason прокидаємо до UI.

## Можлива реалізація

1. `server/src/modules/blast/` + `GET /pulls/:id/blast`: змінені файли PR → один виклик `repoIntel.getBlastRadius` → мапінг у `BlastRadius`.
2. Мапінг + юніт-тест (групування за `viaSymbol`, `factsByFile`, summary з чисел).
3. Чесна деградація: `degraded` + reason у відповідь.
4. Хук + блок на Overview: спершу підсумок і простий список з лінками; дерево/граф — опційно.
5. MCP: `get_blast_radius` → виклик того самого роута, `readOnlyHint: true`.

## Тестовий PR

Зміна експортованої функції, яку імпортують ≥2 інші файли; кандидати в самому DevDigest: `server/src/modules/reviews/helpers.ts`, `client/src/components/diff-viewer/helpers.ts`. Перед прогоном `curl http://localhost:3001/repos/<repoId>/index-state` → `status: full` (repoId з URL `/repos/<repoId>/pulls/<n>`). Стан неповного індексу — окремий сценарій для відео.

## UI (за скріншотами прототипу)

- Overview у дизайні — дві колонки: ліворуч Intent (з лаби L03, у нас поки немає), праворуч Blast Radius; нижче «Review focus».
- Blast Radius: рядок статів «2 symbols · 14 callers · 3 endpoints · 1 cron» + перемикач Tree/Graph; дерево: символ `rateLimit()` зі «N callers» праворуч, під ним `↳ файл:рядок` і ім'я функції-викликача, сині чіпи ендпоінтів (`GET /api/public/items`), помаранчевий чіп крона; символи згортаються; секція «Prior PRs touching these files» (optional).
- Мінімум, що зараховується: чіпи «N symbols · N callers» + картка на символ з «N caller(s)» і рядками `файл:рядок` + ім'я функції-викликача праворуч.

## Критерії

| Рівень | № | Критерій |
| --- | --- | --- |
| P1 | 1 | На Overview сторінки PR є блок Blast radius |
| P1 | 2 | Зверху підсумок: символи, викликачі, ендпоінти, крони |
| P1 | 3 | Під кожним символом — викликачі `файл:рядок`, під ними залежні ендпоінти |
| P1 | 4 | На тестовому PR зі зміною спільного хелпера — ≥2 справжні викликачі і ≥1 HTTP-ендпоінт |
| P1 | 5 | Клік на `файл:рядок` відкриває цей рядок у GitHub |
| P1 | 6 | Без викликачів — зрозумілий текст; неповний індекс — окрема позначка з причиною |
| P1 | 7 | `get_blast_radius` у devdigest-mcp працює і в Claude Code дає ту саму карту, що й UI |
| P1 | 8 | Відкритий PR з описом + демо-відео |
| P2 | 1 | У логах — читання готового індексу, AST/імпорт-граф не перебудовуються |
| P2 | 2 | Відповідь роута проходить валідацію `BlastRadius` |
| P2 | 3 | Мапінг `callers` → `downstream` покрито юніт-тестом |
| P2 | 4 | Основний сценарій без LLM; опційний текстовий підсумок — рівно 1 виклик, фіча працює й без нього |
| P2 | 5 | Файл оголошення не потрапляє у власних викликачів |
| P2 | 6 | Ліміти 20 / 2 беруться з `constants.ts`, не зашиті в компонент |
| P2 | 7 | `degraded` і reason доходять до UI |
| P2 | 8 | `get_blast_radius` за правилами лаби: короткий опис «коли», зрозуміла схема, стисла відповідь, корисна помилка для невідомого PR, `readOnlyHint: true` |
| P2 | 9 | Опис PR: який субагент що зробив |
| P3 | 1 | Символи згортаються/розгортаються деревом |
| P3 | 2 | Graph-вигляд + перемикач Tree/Graph (`view.tree`, `view.graph`) |
| P3 | 3 | «Prior PRs touching these files» (схема `PrHistory` є, дані — з GitHub) |
| P3 | 4 | Крони окремо від HTTP-ендпоінтів |
| P3 | 5 | Символи відсортовані за `rank` |
| P3 | 6 | Біля позначки неповного індексу — кнопка `POST /repos/:id/resync` |
| P3 | 7 | Підписи з `blast.json`, не зашиті в компонент |

## Сценарій відео

1. Тестовий PR → Overview → Blast radius → підсумок (символи, викликачі, ендпоінти, крони).
2. Під зміненим символом — викликачі `файл:рядок` і ендпоінти.
3. Відкрити 1–2 викликачі в коді: це справді споживачі зміненої функції, а не її залежності.
4. Клік на `файл:рядок` → рядок у GitHub.
5. Стан «викликачів немає» і стан неповного індексу.
6. У Claude Code — карта впливу того самого PR, збігається з UI.
7. Одним реченням: чому карта не кличе модель і не парсить репо заново.
