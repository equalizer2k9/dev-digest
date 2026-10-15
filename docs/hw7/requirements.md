# ДЗ №7 — Multi-Agent Review + Export to CI (лаба L07 = ДЗ): вимоги

Джерело: урок L07 «Мультиагентність + Observability + Memory», сторінка ДЗ на edu.goit.global, слайди L07 (зібрано 11.10), звірка з форком і upstream 15.10. Дедлайн 11.10 23:45 минув. Режим — швидкий: рішення нижче фінальні, spec-creator їх не перепитує.

## Що здаємо

| Що | Де |
| --- | --- |
| 2 PR, по одному на фічу (+ технічний PR agent-runner, мержиться першим) | форк `equalizer2k9/dev-digest` |
| Демо-відео ≤ 3 хв: мультиагентний запуск на PR, групування знахідок, живі статуси, автоматичне рев'ю в GitHub Actions | `docs/hw7/hw7-demo.mp4` (у `.gitignore`), на платформу |
| Підсумок: фактичні токени, wall-clock, час рев'ю людини, конфлікти | `docs/hw7/summary.md` |

## Гілки й порядок мержу

- `feat/homework-7` від `feat/homework-6` — інтеграційна гілка; спеки й плани обох фіч комітяться в неї до створення worktrees.
- PR 0: `feat/hw7-agent-runner` → `feat/homework-7`, мержиться першим.
- PR A: `feat/multi-agent-review` (worktree `../dev-digest-review`) → `feat/homework-7`, мержиться першим із двох: додає зв'язок запусків у мультипрогін, який B не чіпає.
- PR B: `feat/export-to-ci` (worktree `../dev-digest-ci`) → `feat/homework-7`; після мержу A — `git merge feat/homework-7` у B (без rebase), перевірки, мерж.
- Під час `/run-plan` сервери й БД у worktrees не запускаються (Postgres і порти спільні) — лише typecheck і тести. Живі перевірки — після, по одному worktree.

## Власники файлів

| Хто | Файли |
| --- | --- |
| A | `server/src/modules/reviews/**` (роут, сервіс, executor, групування, розбіжності), нова міграція, `server/src/db/schema/runs.ts`, новий контракт `multi-agent.ts` у `vendor/shared` (обидві копії), client: PR-сторінка (`RunReviewDropdown`), `app/multi-agent/**`, хуки мультипрогону |
| B | новий модуль `server/src/modules/ci/**`, `adapters/github/octokit.ts` + інтерфейс `GitHubClient` і моки, client: `app/agents/[id]` (вкладка CI, візард), `app/ci-runs/**`, хуки CI; `agent-runner/**` лише на правки під збірку |
| Спільні (очікувані дрібні конфлікти) | `server/src/modules/index.ts`, `vendor/shared/index.ts`, `client/src/lib/hooks/index.ts`, сайдбар/nav, `docs/retros/ledger.md`, `AGENTS.md` — кожна фіча лише додає свій рядок |

Міграція — лише в A. B схеми БД не змінює (усі таблиці CI вже є); знадобиться зміна — зупинитись.

## Що вже є у форку (перевірено 15.10) — не перебудовувати

| Що | Де |
| --- | --- |
| Таблиці `multi_agent_runs` (без зв'язку з `agent_runs`), `run_traces`, `agent_runs.source` local/ci, `ci_installations`, `ci_runs` | `server/src/db/schema/runs.ts`, `ci.ts` |
| `agents.ciFailOn` (never/critical/warning/any), `agents.enabled` | `schema/agents.ts` |
| Контракти `AgentManifest`, `CiExportInput`, `CiExport`, `CiInstallation`, `CiRun`, `CiResultArtifact`, `CiFile` | `vendor/shared/contracts/eval-ci.ts` (обидві копії) |
| `POST /pulls/:id/review` `{agentId}` / `{all}`; запуски створюються одразу, executor у фоні; diff та intent готуються один раз, збій агента ізольований | `reviews/routes.ts`, `service.ts`, `run-executor.ts` |
| SSE `/runs/:id/events` з replay-буфером; `RunTraceDrawer`, `RunStatus`, `LiveLogStream`, `ExportWizardSteps`, `AutoTriggerStatus` | server `platform/sse.ts`; client `vendor/ui`, `pulls/[number]/_components` |
| `RunReviewDropdown` (один агент / усі), `FindingCard` з Accept/Dismiss і `EvalCaseButton` | `pulls/[number]/_components` |
| `GitHubClient`: `commitFiles`, `openPullRequest`, `findOpenPr`, `getFileContent` | `vendor/shared/adapters.ts`, `adapters/github/octokit.ts` |
| Ключі сайдбару `multi-agent`, `ci-runs` (сторінок нема) | `components/app-shell/helpers.ts` |

Чого нема: агенти в executor ідуть **послідовно** (`for … await`), зв'язку `agent_runs` → `multi_agent_runs`, групування й розбіжностей, статистики агента (середні тривалість і вартість), модуля `ci`, `listWorkflowRuns` і завантаження артефакту в `GitHubClient`, сторінок Multi-Agent Review і CI Runs, вкладки CI агента, `agent-runner`.

Еталон лектора — upstream `lesson-7-lab/multiagents-finish` (+13k рядків). Не зливаємо й не копіюємо; звідти лише пастки: ingest лише pull-based, ncc дає кілька файлів, workflow лектора бере код із head PR (у нас — з base, D15).

## Частина A — Multi-Agent Review

- D1. Запуск: `RunReviewDropdown` на сторінці PR — чекбокси увімкнених агентів, у кожного оцінка, разом сума, кнопка «Run multi-agent review (N)» при N ≥ 2. Один агент і «усі» — як зараз.
- D2. API: `POST /pulls/:id/review` приймає `{agentIds}` (2–5 різних увімкнених агентів робочого простору) → рядок `multi_agent_runs`, у кожного `agent_runs` — `multi_agent_run_id` (нова nullable FK, `ON DELETE SET NULL`, єдина міграція ДЗ), у відповіді `multi_run_id`. Старі форми тіла не змінюються.
- D3. Паралельність: після спільної підготовки diff та intent агенти запускаються одночасно (`Promise.allSettled`), і для `{agentIds}`, і для `{all}`. Ізоляція збою — як зараз.
- D4. Оцінка: на агента — середні тривалість і вартість останніх 10 завершених локальних запусків; історії нема — «—». Разом: вартість — сума, час — максимум (паралельно).
- D5. Живі статуси: сторінка опитує `GET /multi-runs/:id` кожні 2 с, поки є queued/running. SSE — лише для відкритого Live Log / trace однієї колонки (готові компоненти). Причина: 5 SSE + запити впираються в ліміт 6 з'єднань браузера на origin.
- D6. Групування — чиста функція на сервері: знахідки різних агентів в одній групі, якщо той самий файл, діапазони рядків перетинаються і назви схожі (Jaccard слів нормалізованої назви ≥ поріг, поріг у `constants.ts`, стартово 0,3). Перетин рядків без схожої суті — різні групи (приклад з ДЗ №6: «unfinished review» і SSRF на рядках 153–188). Оригінали не змінюються; група = представник (найвища severity), агенти, розгортання до оригінальних `FindingCard`.
- D7. Розбіжності: для кожної групи — по кожному агенту мультипрогону: severity, «did not flag» або «failed». Конфлікт = хоч один завершений агент не позначив або severity різні. Перемикач «Show only conflicts» — фільтр на клієнті. Пояснення «чому не позначив» не генеруємо.
- D8. Сторінка `/multi-agent/[id]`: шапка (PR, агенти, wall-clock від старту до останнього завершення, сума токенів і вартості, статус); колонки (статус, тривалість, токени, вартість, кількість знахідок, score, «View trace» → `RunTraceDrawer`); групи знахідок; «Where agents disagree». Режим Tabs — не робимо.
- D9. Повернення: пункт сайдбару «Multi-Agent Review» → `/multi-agent`: останні 20 мультипрогонів (PR, агенти, статус, wall-clock, вартість, коли) + «New multi-agent review» (вибір PR + той самий пікер). На сторінці PR — посилання на останній мультипрогін.

## Частина B — Export to CI

- D11. Ціль: сам форк `equalizer2k9/dev-digest`, base `main`. Actions увімкнено, секрет `OPENROUTER_API_KEY` є з ДЗ №6. PR лише з того самого репо.
- D12. Візард: агент → вкладка «CI» → «Add to CI» → `ExportWizardSteps`: Target (лише GitHub Actions, репо з робочого простору; CircleCI/Jenkins/CLI не показуємо — генераторів нема) → Preview (файли й вміст; workflow редагований, решта лише перегляд) → Configure (тригери opened, synchronize, опційно reopened; публікація github_review / pr_comment / none) → Install (лише «Open PR»).
- D13. Файли: `.devdigest/agents/<slug>.yaml` (`AgentManifest`, перед комітом валідується тією самою Zod-схемою), `.devdigest/skills/<slug>.md` (скіли агента), `.devdigest/runner/*` — **усі** файли `agent-runner/dist/` (ncc дає `index.js`, чанк і `package.json` з `"type": "module"`; dist нема → 409 з підказкою `pnpm --dir agent-runner build`), `.github/workflows/devdigest-review.yml`. `memory.jsonl` — не робимо (пам'яті нема).
- D14. Install: `commitFiles` у гілку `devdigest/ci` від base, `openPullRequest` «Add DevDigest CI review» (в описі: файли, потрібний секрет, як зробити check required); відкритий PR на цій гілці вже є — оновити гілку й повернути той самий URL; рядок `ci_installations` (один на агент + репо). У base напряму не пишемо.
- D15. Workflow — чиста функція з тестами: `name: DevDigest Review`; `on: pull_request` з типами з Configure; `permissions: contents: read, pull-requests: write`; `concurrency` на PR з `cancel-in-progress`; `timeout-minutes: 10`; PR із fork (`head.repo.full_name != github.repository`) → job пропускається з повідомленням; `actions/checkout` з `ref: ${{ github.event.pull_request.base.sha }}` і `persist-credentials: false`; на base нема `.devdigest/runner/index.js` → notice і exit 0 (так проходить сам PR інсталяції); `setup-node` 22; `node .devdigest/runner/index.js` з env `OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}`, `GITHUB_TOKEN`, `PR_NUMBER`, `DEVDIGEST_POST_AS`; `upload-artifact` `devdigest-result` (`if: always()`, 7 днів). Усі actions — за повним SHA. Без `pull_request_target`, без marketplace-action, без підстановки тексту PR у `run:`. Чому base: раннер і конфіг беруться з base, diff — через API, тож код PR не виконується поруч із секретом і не може підмінити раннер чи промпт.
- D16. agent-runner — з upstream `lesson-7-lab/agent-runner`, лише тека, без merge. Наш reviewer-core приймає `SkillPart[]` → у `src/run.ts` мапінг: id і name = slug, version 1, `trusted: true` (скіл з того самого base-коміту, що й `system_prompt` манифесту). Перевірено 15.10: після цієї правки typecheck чистий, 23 тести зелені, `pnpm build` → `index.js` 1,4 МБ + чанк + `package.json`. Менеджер — pnpm.
- D17. Ingest — pull-based, вхідного endpoint нема (локальну студію GitHub не бачить). Відкриття CI Runs і кнопка «Refresh»: для кожної GHA-інсталяції — запуски `devdigest-review.yml` через GitHub API; завершені й ще не внесені (ключ — URL запуску) → артефакт `devdigest-result` → unzip → `CiResultArtifact.parse` → `pr_number` збігається з PR запуску, `agent` — з агентом інсталяції → `agent_runs` (`source='ci'`) + `ci_runs` (статус, знахідки, вартість, PR, `github_url`). Битий або прострочений артефакт — пропустити цей запуск з логом; GitHub недоступний — повідомлення на сторінці, старі рядки лишаються. `GitHubClient` + `listWorkflowRuns`, `downloadArtifact` (+ моки).
- D18. Сторінка `/ci-runs` (сайдбар): репо, PR, агент, статус, знахідки, вартість, тривалість, коли, посилання на job. Вкладка «CI» агента: інсталяції, «Fail CI on» (`agents.ciFailOn`), історія `ci_runs` агента, «Add to CI».
- D19. Токен GitHub студії: для `.github/workflows/*` потрібен scope `workflow` (classic) або Workflows: write (fine-grained); нема — Install показує зрозумілу помилку. Ingest — Actions: read.
- D20. Required check ставить користувач (ruleset на `main` форку), не студія; на кроці Configure — підказка, як у дизайні.

Безпека B (у спеку): секрет студія не читає й не зберігає, у Preview — лише `${{ secrets.OPENROUTER_API_KEY }}`; у `devdigest-result.json`, логах і trace секретів нема; текст PR — недовірені дані.

## Не робимо

Режим Tabs + detail; Learn / Memory / `memory.jsonl`; сторінка Agent Performance; пояснення «did not flag»; CircleCI, Jenkins, Generic CLI; zip у візарді; marketplace action; вхідний ingest-endpoint; рев'ю PR із fork; фонове опитування GitHub (лише при відкритті сторінки й за кнопкою).

## Спека, план, перевірки

- До 12 AC на спеку (EARS); дрібниці UI — у NFR.
- План: групи server і client, по одному implementer на групу, без сесій; test-writer не викликаємо.
- Кожен AC — з тестом (умова `/run-plan`), мінімальним: чиста функція (групування, розбіжності, оцінка, YAML workflow, список файлів бандла, валідація артефакту), один тест роуту або один компонентний тест. Без e2e.
- Гейт у worktree: typecheck + тести зачеплених пакетів + client build; у B ще `pnpm --dir agent-runner test`.
- Живі перевірки після `/run-plan`: A — PR #21, General Reviewer + Security + Performance, і контрольний замір того самого PR одним General Reviewer; B — експорт агента Security у форк, тестовий PR з CRITICAL.

## Підсумок `docs/hw7/summary.md`

По кожній фічі: токени (fresh in / cache read / out з `/workflow-retro`), wall-clock `/run-plan`, період фактичного перекриття двох запусків, конфлікти на мержі (скільки, які файли), повторні прогони, час рев'ю людини; замір 1 vs 3 (wall-clock, токени, вартість); вартість CI-прогону; 2–3 висновки з цифр.
