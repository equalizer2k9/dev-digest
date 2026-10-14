# ДЗ №5 — plan verification: PR Why + Risk Brief

## 1. Inputs

| | |
| --- | --- |
| Spec | `specs/pr-brief/spec.md` — SPEC-01, `Status: approved`, AC-1 … AC-30 |
| Plan | `specs/pr-brief/plan.md` — T-1 … T-10 |
| Requirements | `docs/hw5/requirements.md` |
| Branch | `feat/homework-5` |
| Base commit | `a728862` docs(hw5): pr-brief spec, plan and cross-model review |
| Head commit | `fb2fb77` test(client): brief → Files changed wiring |
| Implementation | `1fa192a` feat(brief): PR Why + Risk Brief on the Overview tab |
| Follow-ups | `bd01948` fix(brief): address architecture review · `f971f4d` refactor(server): move classifyFile to modules/_shared · `fb2fb77` test(client): brief → Files changed wiring |
| Дата | 2026-10-11 |

Конвеєр: implementer → architecture-reviewer → 2 раунди фіксів → plan-verifier; далі рішення
власника щодо відкритих знахідок (§4) і другий, фінальний прогін plan-verifier на `fb2fb77`.
Колонки «evidence» і «status» скопійовано з його другого звіту без змін (verifier read-only, без
shell). Перевірки в браузері робив оркестратор, результат записано в §3.

## 2. Matrix

Префікси шляхів: `SB/` = `server/src/modules/brief/` · `PR/` =
`client/src/app/repos/[repoId]/pulls/[number]/` · `DV/` = `client/src/components/diff-viewer/` ·
`CL/` = `client/src/lib/hooks/`. Задачі й тести — з таблиці Traceability плану. Усі файли фічі
прийшли комітом `1fa192a`; `bd01948` змінив лише `SB/service.ts` і `SB/service.test.ts`; `fb2fb77`
додав `PR/page.test.tsx`, якого в Traceability плану немає (тест зв'язки за рішенням власника).

| AC | task(s) | test (file › case) | commit | evidence (file:line) | status |
|---|---|---|---|---|---|
| AC-1 | T-8, T-10 | `PrBriefBlock.test.tsx` › no brief → generate control; `OverviewTab.test.tsx` › brief block rendered | `1fa192a` | `PR/_components/PrBriefBlock/PrBriefBlock.tsx:50-65`; `PR/_components/OverviewTab/OverviewTab.tsx:45-55` | PASS |
| AC-2 | T-6, T-7, T-10 | `brief.it.test.ts` › POST returns the stored brief; `brief.test.ts` › mutation fills the cache; `OverviewTab.test.tsx` › click Generate → summary shown | `1fa192a` | `SB/routes.ts:27-34`; `CL/brief.ts:21-30`; `OverviewTab.tsx:52` | PASS |
| AC-3 | T-8 | `PrBriefBlock.test.tsx` › summary + lists, empty-state texts | `1fa192a` | `PrBriefBlock.tsx:90-145` | PASS |
| AC-4 | T-10 | `OverviewTab.test.tsx` › brief block and blast block together | `1fa192a` | `OverviewTab.tsx:26, 45-66` | PASS |
| AC-5 | T-8 | `PrBriefBlock.test.tsx` › no-intent and no-specs statements | `1fa192a` | `PrBriefBlock.tsx:94-95` | PASS |
| AC-6 | T-3, T-8 | `helpers.test.ts` › stable severity sort; `PrBriefBlock.test.tsx` › title, severity, path in order | `1fa192a` | `SB/helpers.ts:167-179`; `PrBriefBlock.tsx:102-110, 163-190` | PASS |
| AC-7 | T-3, T-8 | `helpers.test.ts` › focus keeps model order; `PrBriefBlock.test.tsx` › `file:line` + reason in order | `1fa192a` | `SB/helpers.ts:174-176`; `PrBriefBlock.tsx:118-142`; `PR/_components/PrBriefBlock/helpers.ts:4` | PASS |
| AC-8 | T-3 | `helpers.test.ts` › 9/7 grounded → 7/5 after grounding | `1fa192a` | `SB/constants.ts:15-16`; `SB/helpers.ts:181-185` | PASS |
| AC-9 | T-5, T-6, T-8 | `service.test.ts` › no files → 409, zero model calls; `brief.it.test.ts` › closed and merged PRs generate; `PrBriefBlock.test.tsx` › `error.noFiles` | `1fa192a` | `SB/service.ts:68-75`; `PrBriefBlock.tsx:71-80`; `OverviewTab.tsx:30-34` | PASS |
| AC-10 | T-3 | `helpers.test.ts` › refs outside the set removed, empty risk dropped | `1fa192a` | `SB/helpers.ts:167-172` | PASS |
| AC-11 | T-3 | `helpers.test.ts` › focus dropped on unknown file / unknown line | `1fa192a` | `SB/helpers.ts:174-176`; known lines at `:107-138` | PASS |
| AC-12 | T-3, T-5 | `helpers.test.ts` › path normalization, blast null; `service.test.ts` › grounding on full facts after reduction, blast throwing | `1fa192a` | `SB/service.ts:78-85, 101`; `SB/helpers.ts:151-154` | PASS |
| AC-13 | T-5 | `service.test.ts` › the request carries `maxRetries: 0`; `service.test.ts` › invalid reply → error, provider called once | `1fa192a`, `bd01948` | `SB/constants.ts:23`; `SB/service.ts:141-156`; re-ask loop at `server/src/adapters/llm/openai.ts:90-96`; `withRetry` still wraps the request at `openai.ts:97`, `anthropic.ts:100` | **PARTIAL** |
| AC-14 | T-4 | `helpers.test.ts` › ≤ 8000 at every stage, cut order, no patch text, never throws | `1fa192a` | `SB/constants.ts:12`; `SB/service.ts:87-92`; `SB/helpers.ts:268-342` | PASS |
| AC-15 | T-2, T-4 | `helpers.test.ts` › facts present, names absent, untrusted wrapping, system text ends with the exported `INJECTION_GUARD` | `1fa192a` | `SB/helpers.ts:207-239`; `SB/service.ts:85-86` | PASS |
| AC-16 | T-1, T-5 | `contracts.test.ts` › draft/brief parse + both copies identical; `service.test.ts` › invalid reply stores nothing | `1fa192a`, `bd01948` | `SB/service.ts:144, 99-106`; `server/src/vendor/shared/contracts/brief.ts:126-158`; `client/src/vendor/shared/contracts/brief.ts:126-158` | PASS |
| AC-17 | T-5, T-6 | `service.test.ts` › `resolveFeatureModel('risk_brief')` result used; `brief.it.test.ts` › default, then changed setting on the next generation | `1fa192a` | `SB/constants.ts:6`; `SB/service.ts:95, 140-143`; `server/src/modules/settings/feature-models.ts:51-57` | PASS |
| AC-18 | T-6, T-7, T-10 | `brief.it.test.ts` › GET makes no model call; `brief.test.ts` › mount issues GET only; `OverviewTab.test.tsx` › mutation not called on mount | `1fa192a` | `SB/service.ts:50-60`; `CL/brief.ts:12-18` | PASS |
| AC-19 | T-5, T-6 | `service.test.ts` › stored SHA = request SHA; `brief.it.test.ts` › one row after two generations | `1fa192a` | `SB/repository.ts:25-30`; `server/src/db/schema/reviews.ts:57-62`; `SB/service.ts:100-106`; `OverviewTab.tsx:52` | PASS |
| AC-20 | T-8 | `PrBriefBlock.test.tsx` › stale marker when SHAs differ, brief still shown | `1fa192a` | `PrBriefBlock.tsx:67-69`; `PrBriefBlock/helpers.ts:2` | PASS |
| AC-21 | T-6, T-8, T-10 | `brief.it.test.ts` › second POST replaces with one more call; `PrBriefBlock.test.tsx` › refresh calls `onGenerate` stale or not, marker gone when SHAs match | `1fa192a` | `PrBriefBlock.tsx:56-63`; `CL/brief.ts:28`; `SB/repository.ts:29` | PASS |
| AC-22 | T-9, T-10 | `FileCard.test.tsx` › open + highlight + scroll; `DiffTab.test.tsx` › collapsed group opens; `page.test.tsx` › a Review focus click opens Files changed with that file and line; manual: line centred and flashing in the browser | `1fa192a`, `fb2fb77` | `PR/_components/PrBriefBlock/PrBriefBlock.tsx:125-131`; `OverviewTab.tsx:54`; `PR/page.tsx:72-80, 153, 184`; `PR/_components/DiffTab/DiffTab.tsx:106, 155, 157, 169`; `DV/FileCard/FileCard.tsx:68-93, 166-168`; `DV/CodeLine/CodeLine.tsx:68-71`; `DV/helpers.ts:18-20`; `DV/constants.ts:7`; `DV/styles.ts:72-76`; `DV/DiffViewer/DiffViewer.tsx:43` | **PARTIAL** |
| AC-23 | T-9, T-10 | `FileCard.test.tsx` › null line / unshown line → card top; `PrBriefBlock.test.tsx` › risk ref calls `onOpenFile(path, null)`; `page.test.tsx` › a risk file click opens Files changed with that file and no line; manual: risk file opens at its top | `1fa192a`, `fb2fb77` | `PrBriefBlock.tsx:172-182`; `page.tsx:77-80`; `FileCard.tsx:74-76, 83-88` | PASS |
| AC-24 | T-8 | `PrBriefBlock.test.tsx` › not-in-diff note, no `onOpenFile` | `1fa192a` | `PrBriefBlock.tsx:119, 132-137, 183-188`; `client/messages/en/brief.json:31` | PASS |
| AC-25 | T-8 | `PrBriefBlock.test.tsx` › row click toggles explanation, file-ref click does not | `1fa192a` | `PrBriefBlock.tsx:161, 164, 176-178, 191` | PASS |
| AC-26 | T-8, T-10 | `PrBriefBlock.test.tsx` › skeleton + disabled control; `OverviewTab.test.tsx` › pending mutation | `1fa192a` | `PrBriefBlock.tsx:59, 75, 82-88`; `OverviewTab.tsx:50` | PASS |
| AC-27 | T-8, T-10 | `PrBriefBlock.test.tsx` › loading placeholder, load-error copy, no generate button; `OverviewTab.test.tsx` › pending query | `1fa192a` | `PrBriefBlock.tsx:30-48`; `OverviewTab.tsx:46`; `SB/service.ts:53` | PASS |
| AC-28 | T-8, T-10 | `PrBriefBlock.test.tsx` › error + try again + previous brief kept; `OverviewTab.test.tsx` › error-code mapping | `1fa192a` | `PrBriefBlock.tsx:71-80, 90`; `OverviewTab.tsx:30-34`; `CL/brief.ts:28` | PASS |
| AC-29 | T-8 | `PrBriefBlock.test.tsx` › every label equals its `brief.json` value; manual: `grep` the component folder for string literals in JSX | `1fa192a` | `PrBriefBlock.tsx:28 … 186`; `brief.json:22-44` | PASS |
| AC-30 | T-6 | `brief.it.test.ts` › other-workspace PR → 404 on GET and POST | `1fa192a` | `SB/service.ts:51, 65, 123-127`; `server/src/modules/reviews/repository/pull.repo.ts:9-19`; `SB/repository.ts:15-22` | PASS |

**Підсумок plan-verifier (другий прогін): PASS 28 / PARTIAL 2 / MISSING 0.** Перший прогін на
`bd01948` дав 27 / 3 / 0; AC-23 став PASS після тесту зв'язки сторінки. Задачі: T-1 … T-9 PASS,
T-10 PARTIAL (ручний крок для згорнутої групи `docs`). Жодна задача не має відсутнього файла чи
тесту.

## 3. Open rows

| AC | Чому PARTIAL | Що закриє |
|---|---|---|
| AC-13 | **Чому:** повторне надсилання запиту при 429/5xx або обриві мережі (`withRetry` + повтори SDK) не вимкнено, тож «рівно один запит» тримається лише коли провайдер відповів на перший. Лишено свідомо, рішення власника: бриф має переживати короткий збій провайдера так само, як рев'ю; вимкнено лише re-ask на невалідну відповідь (`maxRetries: 0`). Записано в Deviations плану. | Перемикач, що вимикає `withRetry` і SDK-повтори для цього виклику, — власник відмовився. Рядок лишається PARTIAL. |
| AC-22 | **Чому:** немає спостереження в браузері для focus-пункту, чий файл лежить у згорнутій групі `docs`. У jsdom `scrollIntoView` — заглушка, тож жоден тест не показує, що рядок справді потрапляє у видиму область після розкриття групи. Решту ланцюжка покрито тестами, включно з новим `page.test.tsx`. | Одна перевірка в браузері: клік на focus-пункт для `.md`-файла → група Docs і картка відкриті, рядок по центру й підсвічений. |

**Перевірки в браузері (оркестратор, 2026-10-11, `bd01948`, PR #12, одна реальна генерація):**

- Клік на focus-пункт `client/src/components/diff-viewer/FileCard/FileCard.tsx:11`: адреса
  `?tab=diff`, картка розгорнута, рядок 11 у видимій області по центру (top 723 px із 1414), з
  `data-target-highlight` і фоном `rgba(59,130,246,0.12)`; при наступному замірі через 3,5 с
  підсвітки вже не було (`TARGET_HIGHLIGHT_MS` = 2000; точний момент зняття не заміряно).
- Клік на файл ризику `server/src/modules/reviews/routes.ts`: Files changed, картка розгорнута
  (29 рядків diff), заголовок картки вгорі області, підсвічених рядків 0.
- Рівно один запис `brief: generation` у лозі API: `provider: openrouter`,
  `model: deepseek/deepseek-v4-flash`, `inputTokens: 3809`, `outcome: stored`.
- Під час генерації кнопка заблокована і є скелетон; після повернення на Overview збережений бриф
  показано без нової генерації; у `pr_brief` один рядок із `intent: null`, `history: null`.
- **Не перевірено:** focus-пункт у згорнутій групі `docs` — модель не дала такого на PR #12.

Plan-level, одна PARTIAL із першого прогону лишається: причина `invalid_reply` ставиться лише коли
помилка адаптера несе `raw` (`SB/service.ts:164-172`); OpenRouter-провайдер кидає звичайний
`Error`, тож для нього невалідна відповідь звітується як `provider_error`. Назовні нічого не
витікає в обох випадках.

Розбіжності плану з кодом, які знайшов verifier (план не правився, крім розділу Deviations):
таблиця Files і Traceability не згадують `page.test.tsx` і три файли в `_shared/`; «Out of scope»
каже «без оновлення доків», а `server/specs/smart-diff.md` оновлено через перенесення;
`plan.md:114` досі каже, що блоки обгортаються `wrapUntrusted` напряму, а код іде через `wrap()`.

Критерії з `requirements.md` поза кодом: P1-8 (PR + демо-відео) і P2-2 (cross-model review в описі
PR) — за власником. P3-1 і P3-7 виключені спекою (NG2).

## Live check (PR #16)

Тестовий PR [#16](https://github.com/equalizer2k9/dev-digest/pull/16) (`test/hw5-brief` →
`feat/homework-5`): правка `rowsToSettings` з двома викликачами, нова залежність `ms`, таймаут
брифу 60 → 20 с, правка `docs/agent-prompts/choosing-a-model.md`. Index-state `full`, blast:
`2 symbols · 2 callers · 3 endpoints · 0 crons`. Модель — `deepseek/deepseek-v4-flash` через
OpenRouter (Settings → Risk Brief). Перевірено в браузері на запущеному стеку, 2026-10-11, код
`fb2fb77`; дві генерації (Generate і Refresh).

| Критерій | Результат | Доказ |
|---|---|---|
| P1-1 | PASS | Блок «PR Brief» з кнопкою «Generate brief», списків немає |
| P1-2 | PASS | Summary, Risk areas, Review focus; Blast radius на тій самій вкладці; «No intent available for this PR.» і «No specs attached.» |
| P1-3 | PASS | Ризик «Null values dropped from settings» + `server/src/modules/settings/helpers.ts`; focus `settings/helpers.ts:9` + причина |
| P1-4 | PASS | Скрипт звірив 6 унікальних шляхів із `GET /pulls/:id/brief`: 4 є у `files[]` PR, 2 лише в blast, зайвих немає |
| P1-5, P2-9 | PASS | Клік на `settings/helpers.ts:9` → `?tab=diff`, рядок 9 у видимій області з підсвіткою; через 2,3 с підсвітки немає |
| P1-5, група `docs` | не перевірено | Модель двічі не дала focus-пункту для `.md`. Розкриття групи підтверджено через ризик: клік на `docs/agent-prompts/choosing-a-model.md` → група Docs розгорнулась, картка відкрита (10 рядків), Boilerplate лишилась згорнутою |
| P3-3 | PASS | Клік на файл ризику `brief/constants.ts` → Files changed, картка розгорнута (7 рядків), підсвітки немає |
| P3-4 | PASS | `settings/routes.ts:65` і `settings/feature-models.ts:45` (лише з blast) мають напис «File not in this PR's diff»; клік не змінив адресу |
| P1-6 | PASS | Reload → бриф за ~450 мс, записів `brief: generation` у лозі як було; «Refresh brief» → рівно один новий запис |
| P2-4, P2-5 | PASS | По одному запису на генерацію; `inputTokens: 903` обидва рази при бюджеті 8 000 |
| P2-8 | PASS | Другий коміт `ea47afa` у PR → resync → сторінка показує новий SHA, бриф лишився з `1fa8a6a5` і написом «This brief describes an older commit.» |

**AC-22 лишається PARTIAL.** Розкриття згорнутої групи `docs` підтверджено через ризик; прокрутку
до рядка всередині згорнутої групи — ні, бо модель не дала focus-пункту на `.md`. Додаткових
генерацій заради цього не робилось.

## 4. Architecture review

Раундів рев'ю: 2. Раундів фіксів: 2 (ліміт), другий нічого не змінив.

| Раунд | CRITICAL | WARNING | SUGGESTION |
|---|---|---|---|
| 1 (на `1fa192a`) | 0 | 2 | 4 |
| 2 (на `bd01948`) | 0 | 2 | 3 |

Обидва рази вердикт рев'юера — PASS; межі шарів (routes → service → repository, адаптери лише
через container) тримаються, дві копії `contracts/brief.ts` ідентичні.

**Виправлено (раунд 1, `bd01948`):** `SB/service.ts:171` — `failureReason` визначав
`invalid_reply` regex-ом `/schema/i` по тексту помилки. Regex прибрано, лишилась структурна ознака
(`details.raw`); додано тест, що `Error('400 unsupported JSON schema')` дає `provider_error`.

**Major після двох раундів — закрито рішеннями власника:**

1. `SB/helpers.ts:203-205` — `wrap()` локально нейтралізує підроблений відкривний тег
   `<untrusted`, бо `wrapUntrusted` у reviewer-core екранує лише закривний. **Прийнято як є:**
   правка `wrapUntrusted` зачепила б промпти рев'ю. Записано в Deviations плану; наступний крок —
   перенести екранування у `wrapUntrusted` окремим PR з тестами reviewer-core.
2. `SB/helpers.ts:3` — `brief` імпортував `classifyFile` із внутрішнього шляху модуля `reviews`.
   **Виправлено в `f971f4d`:** класифікатор, його тест і правила перенесено в
   `server/src/modules/_shared/` (`classify-file.ts`, `classify-file.test.ts`,
   `smart-diff-rules.ts`); `reviews` і `brief` імпортують звідти, реекспорту зі старого місця
   немає. Повторного архітектурного рев'ю після цього коміту не було.

**Minor / nit (не надсилались implementer-у, рішення за власником):**

- `SB/service.ts:95` — `resolveFeatureModel` виконується поза try/catch модельної стадії: помилка
  там дає звичайний 500 без запису `brief: generation` у лозі.
- `SB/service.ts:167-170` — класифікація `invalid_reply` спирається на ключ `raw` у `details`
  помилки адаптера; це прихований контракт з адаптерами.
- `PR/_components/OverviewTab/OverviewTab.tsx:30-34` — мапінг коду помилки `brief_no_files` на стан
  UI зроблено вкладеним тернарним виразом із рядком-літералом у компоненті вкладки; місце йому в
  `helpers.ts` + `constants.ts`.
- `PR/_components/PrBriefBlock/PrBriefBlock.tsx:38-47` — стан помилки завантаження має власну
  кнопку «Try again» з тим самим текстом `error.retry`, що й повтор генерації.
- `DV/FileCard/FileCard.tsx:85` — формат `data-line-key` записано у двох місцях (`CodeLine.tsx:71`
  і тут); якщо схема ключа зміниться, прокрутка мовчки впаде на початок файла.
- `DV/FileCard/FileCard.tsx:74-93` — стан навігації до цілі вбудовано в компонент; за подальшого
  росту винести в хук `useTargetScroll`.

## 5. Checks

Усі команди запускав оркестратор, не зі звіту implementer-а.

| Де | Команда | Коміт | Результат |
|---|---|---|---|
| `server/` | `pnpm typecheck` | `1fa192a` | чисто (exit 0) |
| `server/` | `pnpm test` | `1fa192a` | 41 файл, 398 тестів — усі пройшли (інтеграційні включно, Docker доступний) |
| `client/` | `pnpm typecheck` | `1fa192a` | чисто (exit 0) |
| `client/` | `pnpm test` | `1fa192a` | 39 файлів, 295 тестів — усі пройшли |
| `reviewer-core/` | `npm run typecheck` | `1fa192a` | чисто |
| `reviewer-core/` | `npm test` | `1fa192a` | 3 файли, 39 тестів — усі пройшли |
| `server/` | `pnpm typecheck` | `bd01948` | чисто (exit 0) |
| `server/` | `pnpm test` | `bd01948` | 41 файл, 399 тестів — усі пройшли |
| корінь | `cmp` двох `contracts/brief.ts` | `1fa192a` | ідентичні |
| корінь | `git status` на заборонені шляхи | `1fa192a` | `adapters/llm/**`, `reviewer-core/src/llm/**`, `vendor/shared/adapters.ts`, `db/schema/**`, `db/migrations/**`, lock-файли, спека, план — не змінені |
| браузер | ручні перевірки AC-22, AC-23, лог P2-4 | `bd01948` | див. §3; одна реальна генерація через OpenRouter |
| `server/` | `pnpm typecheck` · `pnpm test` | `fb2fb77` | чисто · 399 тестів пройшли (інтеграційні включно) |
| `client/` | `pnpm typecheck` · `pnpm test` | `fb2fb77` | чисто · 298 тестів пройшли (+3: `page.test.tsx`) |
| `reviewer-core/` | `npm run typecheck` · `npm test` | `fb2fb77` | чисто · 39 тестів пройшли |

Фінальний гейт на `fb2fb77` прогнано в усіх трьох пакетах. Лінтера в репозиторії немає.

## 6. Deviations

Зі звітів implementer-а; за його оцінкою жодне не змінює зміст AC.

1. `wrap()` у `SB/helpers.ts` додатково нейтралізує підроблений відкривний тег `<untrusted` перед
   викликом незміненого `wrapUntrusted` — інакше не проходить тест «рівно один відкривний і один
   закривний роздільник на блок» (cross-model review F-4). План називає лише `wrapUntrusted`.
   Прийнято власником (§4, п. 1).
2. Класифікація причини помилки: `ConfigError` → `no_api_key`, `TimeoutError` → `timeout`,
   `ExternalServiceError` з `raw` → `invalid_reply`, решта → `provider_error`. Початковий regex по
   тексту прибрано в `bd01948`.
3. `resolveFeatureModel` виконується поза try/catch модельної стадії; запис у лог пишеться у
   `finally` після нього, тож збій резолву не дає запису генерації.
4. Кнопка «Try again» не показується для `noFiles` (повтор там марний).
5. Стан помилки завантаження отримав власну кнопку «Try again» (`onRetryLoad`) — додаток
   implementer-а; план називає `onRetryLoad` лише як проп.
6. `FileCard` задає підсвітку початковим значенням `useState`; ефект на монтуванні лише прокручує
   й ставить таймер зняття.
7. Додаткові тести понад план: `raw` адаптера ніколи не прокидається назовні; «schema» у тексті
   звичайної помилки → `provider_error`; секція опису прибирається, коли й порожній опис не влазить.
8. Дві застарілі фрази плану тлумачено за текстом задач: експорт `INJECTION_GUARD` робить T-2 (не
   T-4); T-10 перемикає вкладку наявним `setParam` і нічого про ціль не пише в адресу.
9. Implementer зупинився на власному ліміті кроків після T-7 без звіту і був відновлений із тим
   самим завданням; запис в `INSIGHTS.md` не зроблено.
10. Після `/run-plan`, за рішеннями власника: перенесення `classifyFile` у `_shared/` (`f971f4d`),
    тест зв'язки сторінки `page.test.tsx` (`fb2fb77`), розділ Deviations у `plan.md`. Усе три —
    поза задачами T-1 … T-10.
11. Verifier також відзначив код поза планом: дублікати `file:line` викликачів прибираються з входу
    моделі (`SB/helpers.ts:127-135`).

## 7. Бриф і збережений intent (AC-31 … AC-33), 2026-10-12

Після злиття Intent Layer з `feat/homework-3` спека отримала AC-31 … AC-33 і змінений AC-5
(changelog у `specs/pr-brief/spec.md`). `plan-verifier` перевірив **лише зачеплені** рядки; решта
матриці з §2 не перевірялась повторно. Агент нічого не запускав — гейт прогнала головна сесія.

`SB/` = `server/src/modules/brief/` · `PR/` = `client/src/app/repos/[repoId]/pulls/[number]/_components/` ·
`IS` = `server/src/modules/reviews/intent/intent-service.ts`

| # | Requirement | Code evidence (file:line) | Test evidence (file:line, test name) | Status |
|---|---|---|---|---|
| AC-5 (P1-2, amended) | While a brief is displayed: state "no specs attached", and "no intent available" unless an intent is shown | `PR/PrBriefBlock/PrBriefBlock.tsx:101-102` (`noIntent &&` statement; specs statement unconditional, both inside `brief &&` at `:97`); `PR/OverviewTab/OverviewTab.tsx:75` (`noIntent = !!prId && intent.isSuccess && intent.data?.intent == null`); copy at `client/messages/en/brief.json:28-29`. **Absent:** when the intent query is in error or still loading, no intent is shown and the statement is not shown either (`OverviewTab.tsx:75` needs `isSuccess`; `IntentCard.tsx:62-69` renders an error state). | `PrBriefBlock.test.tsx:172` "AC-5: no intent stated only when noIntent; specs statement shown either way"; `OverviewTab.test.tsx:276` "AC-31/AC-5: brief shown and no intent stored: both statements shown"; `:263` (stored intent: no statement). `OverviewTab.test.tsx:328` asserts the statement is absent while the intent loads. No test for the intent-error case. | **PARTIAL** |
| AC-13 (P2-4) | Exactly one provider request per generation, no re-ask | `SB/constants.ts:23` (`MODEL_MAX_RETRIES = 0`); `SB/service.ts:154-176` (the only model call); intent read at `SB/service.ts:89` goes to `IS:76-81`, which makes no model call. **Absent (unchanged):** `withRetry` still wraps the request at `server/src/adapters/llm/openai.ts:97` and `anthropic.ts:100`. | `SB/service.test.ts:111` "sends exactly one request with maxRetries 0, timeoutMs 60000 and the draft schema (AC-13)"; `:121` invalid reply, one call; `:305` "AC-32: %s -> never derives …, exactly one model call" (no / fresh / stale intent); `SB/brief.it.test.ts:251, 267, 277` (`allCalls()` length 1 across all three provider mocks) | **PARTIAL** (by decision; this change does not affect the row) |
| AC-14 (P2-5) | Whole input ≤ 8 000 tokens by the server tokenizer, reduced by priority, never failing for size, no hunk body | `SB/constants.ts:12`; `SB/service.ts:104-110`; `SB/helpers.ts:313-314` (measure covers system + user including the intent section); `:322-328` (step 0: lists, then section); `:330-381` (steps 1-6); `SB/helpers.ts:100-113` (the builder gets ranges, never a patch) | `SB/helpers.test.ts:422` "is at most the budget at every stage and follows the documented cut order"; `:599` "NFR-2: huge intent lists are cut first; the input stays <= 8000 and no file row is dropped" (real tiktoken); `:615`; `:624`; `:316` no patch text; `SB/service.test.ts:331` | PASS |
| AC-15 | Facts given to the model: title, description, per-file path / +A -D / role / ranges, blast summary and caller file:line | `SB/helpers.ts:217-221, 249-267`; `SB/helpers.ts:106-119, 138-152` | `SB/helpers.test.ts:300` "carries title, description, path +A -D role ranges, blast summary and caller file:line (AC-15)"; `:323`; `:334` | PASS |
| AC-31 | Stored intent (summary, in scope, out of scope, confidence) given to the model as a fact and displayed in the Intent block; none stored → brief generated without one and "No intent available" stated | Server: `SB/service.ts:86-103` (maps `intent`, `in_scope`, `out_of_scope`, `confidence`, `stale`), `:121-123` (stored `intent` or `null`); `SB/helpers.ts:238-247` (section), `:252`. Client: `PR/OverviewTab/OverviewTab.tsx:29, 51-61, 74-75`; `PR/PrBriefBlock/PrBriefBlock.tsx:37, 46, 58` (slot in every status), `:101`; `PR/IntentCard/IntentCard.tsx:84, 91-97` (confidence, summary, both lists) | `SB/service.test.ts:261` "AC-31: gives the stored intent to the model inside a pr-intent untrusted block, stores it, one call"; `:276` no intent; `:320` read failure; `SB/helpers.test.ts:545, 550, 558`; `SB/brief.it.test.ts:251, 267`; `PrBriefBlock.test.tsx:185, 191`; `OverviewTab.test.tsx:263` "AC-31: stored intent is displayed, no 'No intent available', before a brief and with one"; `:276`; `:299` | PASS |
| AC-32 | Never derive an intent to generate a brief; still exactly one provider request with or without an intent | `SB/service.ts:89` is the only `IntentService` call in the module and it is `.get`; `IS:75-81` (`get`: `getPull` + `getIntentRecord`, no model). Searched `SB/` for `deriveIntent`, `recalculate`, `ensureForReview`: found only in `service.test.ts`. `SB/service.ts:113` resolves only `BRIEF_FEATURE`. | `SB/service.test.ts:305` "AC-32: %s -> never derives (recalculate/ensureForReview untouched), exactly one model call" (also asserts `resolveFeatureModel` features equal `['risk_brief']` and `llmFactory` called once); `SB/brief.it.test.ts:267` "AC-31/AC-32: no stored intent -> no pr-intent block, intent null, one call, no pr_intent row" | PASS (the "one request" half carries the AC-13 limitation) |
| AC-33 | A stale stored intent is still given to the model, marked stale, and displayed marked stale | `IS:36` (`stale` flag); `SB/service.ts:96`; `SB/helpers.ts:235-236, 246` (stale note as fixed text outside the untrusted block); `server/src/prompts/brief.system.md:26-27`; `PR/IntentCard/IntentCard.tsx:85` | `SB/helpers.test.ts:563` "AC-33: a stale intent is marked stale outside any untrusted block, a fresh one is not"; `SB/service.test.ts:283, 298`; `SB/brief.it.test.ts:277` "AC-33: an intent derived for another head SHA is still sent, marked stale; one call"; `OverviewTab.test.tsx:284` "AC-33: a stale stored intent is displayed marked as stale"; `:292` | PASS |
| NFR-2 | Budget of 8 000 tokens for the whole input, system tokenizer count; unchanged by the intent | `SB/constants.ts:12`; `SB/service.ts:105-110` (`container.tokenizer.count`); `SB/helpers.ts:313-328` | `SB/helpers.test.ts:599, 615, 624` (TiktokenTokenizer, ≤ 8000); `SB/service.test.ts:331` "NFR-2/NFR-3: a huge intent plus many files keeps the model input <= 8000 tokens …" | PASS |
| NFR-3 | Hunk bodies, contents, findings, repo map, commits, issues, specs, history, symbol and caller names kept out; the intent is the one exception and counts toward the budget | `SB/helpers.ts:249-267` (the only sections: title, description, intent, file rows, blast summary, caller file:line); `SB/service.ts:91-97` (intent `sources`, `provider`, `model` not forwarded); `SB/helpers.ts:313` (intent is counted) | `SB/helpers.test.ts:316` "contains no patch text, caller name or symbol name (AC-14, NFR-3)"; `:633` "NFR-3: the intent is the only addition; hunk bodies stay out"; `:585` (block set is exactly title, description, intent, files) | PASS |
| EC-12 | Intent stored after the brief: stored brief not rewritten; Intent block shows the stored intent; taken in on the next generation | `PR/OverviewTab/OverviewTab.tsx:29, 51-61` (card fed from the live intent query, not `brief.intent`); `SB/service.ts:51-61` (`get` only reads); `SB/repository.ts:25-30` is the only `pr_brief` write in `server/src` and is called only at `SB/service.ts:126`; `SB/service.ts:89` (read on every generation) | `OverviewTab.test.tsx:263` (brief fixture with `intent: null` plus a stored intent: intent displayed, no "no intent" statement); `SB/service.test.ts:261` (a generation takes the stored intent). No single test runs the sequence generate → store intent → GET unchanged → regenerate. | PASS |
| Untrusted inputs | Stored intent is data, not instructions: wrapped in delimiters under the injection guard; never a reason to drop or soften a risk | `SB/helpers.ts:246` (`wrapUntrusted(LABEL_INTENT, …)`); `SB/constants.ts:36`; `SB/helpers.ts:206-208` + `SB/service.ts:104` (system = template + `INJECTION_GUARD`); `reviewer-core/src/prompt.ts:45-56` (escapes forged opening and closing tags); `brief.system.md:24-27` | `SB/helpers.test.ts:572` "injection: forged untrusted tags in the intent cannot open or close a block"; `:550`; `:525` "ends with the exported INJECTION_GUARD …"; `:381` (title, description, file path, caller path) | PASS |
| Check: intent read only through the intent service | — | `SB/service.ts:13, 89`; `SB/repository.ts:16-29` touches only `t.prBrief` and `t.pullRequests`. Searched `SB/` for `getIntentRecord`, `prIntent`, `pr_intent`: non-test files have none. | `SB/service.test.ts:27` mocks the service module; `:273` `intentSvc.get` called with `(WS, PR)` | PASS |
| Check: no brief code path derives an intent | — | Same as AC-32. Client: "Generate brief" calls only `generate.mutate(headSha)` at `OverviewTab.tsx:71`; `recalc.mutate()` at `:57` is the Intent card's own button. | `SB/service.test.ts:305`; `OverviewTab.test.tsx:216` (mount does not call the intent mutation) | PASS |
| Check: local `wrap()` gone, `wrapUntrusted` used | — | `SB/helpers.ts:2` (import), `:246, 250, 251, 256, 263` (all five blocks). Searched `SB/` for `\bwrap\(` and `function wrap`: no match. | `SB/helpers.test.ts:381-391` (exactly 4 opening and 4 closing delimiters), `:572` | PASS |
| Check: Overview renders one IntentCard, inside the brief block | — | `OverviewTab.tsx:51-61` (one element), `:74` (passed as `intent`), nowhere else in the return at `:79-101`; `PrBriefBlock.tsx:37, 46, 58` (one per mutually exclusive branch). In `client/src/app`, `IntentCard` is used only by `OverviewTab.tsx`. | `OverviewTab.test.tsx:299` "AC-31: exactly one intent card in every state" (3 intents × 5 brief states); `PrBriefBlock.test.tsx:191` | PASS |

**Підсумок агента: PASS 13 / PARTIAL 2 / MISSING 0** (15 рядків). Задачі плану: 2 PASS, 1 PARTIAL
(порядок скорочення «intent раніше за callers» був у коді без тесту).

### Що зроблено після цього прогону

Агент повторно ці рядки не перевіряв — нижче те, що змінила головна сесія і чим це закрито.

- **AC-5.** «No intent available» тепер показується й тоді, коли запит intent завершився помилкою
  (`OverviewTab.tsx`: `isSuccess || isError`); під час завантаження — ні. Тест
  `OverviewTab.test.tsx` › "AC-5: brief shown and the intent query in error…".
- **Порядок скорочення.** Тест `helpers.test.ts` › "plan order: …": списки intent, а потім уся
  секція вирізаються раніше за будь-який рядок caller.
- **Зауваження до AC-31.** Якщо бюджет вирізав усю секцію intent, бриф зберігав intent, якого
  модель не отримала. Тепер `buildBriefInput` повертає `intentIncluded`, і `brief.intent` — `null`
  у такому разі. Тести `service.test.ts` › "stored intent vs. what the model was given (AC-31)".
- **AC-13** лишається PARTIAL за попереднім рішенням (повтор запиту на 429/5xx не вимкнено);
  зчитування intent запитів до провайдера не додає.
- План (`specs/pr-brief/plan.md`) приведено у відповідність: крок 0 скорочення, п'ятий недовірений
  блок `pr-intent`, `PrBrief.intent` більше не завжди `null`; «Local delimiter escape» у Deviations
  позначено закритим — `wrap()` прибрано, екранування в `wrapUntrusted`.
- Поза зачепленими AC: двоколонковий Overview (бриф з блоком Intent ліворуч, Blast radius
  праворуч, опис нижче) — це розв'язання конфлікту при злитті, а не вимога AC.

### Гейт (на фінальному коді)

| Пакет | typecheck | тести |
| --- | --- | --- |
| server | чисто | 51 файл / 537, з інтеграційними |
| reviewer-core | чисто | 5 файлів / 74 |
| client | чисто | 44 файли / 356; `pnpm build` — ok |
| devdigest-mcp | чисто | 10 файлів / 64 |


## 8. Повторна перевірка 2026-10-14 (після SPEC-02 і live check)

Повний прогін усіх AC-1 … AC-36 на `feat/homework-5` @ `13aa54b`. Його робили два паралельні
`plan-verifier`, як тепер передбачає `run-plan`:

- **server-бік** — задачі T-1 … T-6 плану і серверна частина спільних AC;
- **client-бік** — T-7 … T-10 і клієнтська частина спільних AC.

Кожен отримав лише файли своєї групи від бази `a728862`. Для runtime-рядків вони брали докази з
live check у `docs/hw5/plan-verification-pcf.md` §7 (PR #19, реальний виклик моделі). Агенти нічого не
запускали; гейт прогнала головна сесія (`plan-verification-pcf.md` §8). Спільний AC має докази обох
сторін і гірший зі статусів.

Префікси шляхів:
- `brief/` = `server/src/modules/brief/`
- `pc/` = `server/src/modules/project-context/`
- `PB/` = `client/src/app/repos/[repoId]/pulls/[number]/_components/PrBriefBlock/`
- `OT/` = `…/_components/OverviewTab/`
- `IC/` = `…/_components/IntentCard/`
- `PG/` = `client/src/app/repos/[repoId]/pulls/[number]/`
- `HK/` = `client/src/lib/hooks/`
- `DV/` = `client/src/components/diff-viewer/`
- `LIVE n` = рядок n таблиці Results у `plan-verification-pcf.md` §7

| AC | Evidence | Status |
|---|---|---|
| AC-1 | `PB/PrBriefBlock.tsx:57-71`, `OT/OverviewTab.tsx:63-92`, `PG/page.tsx:149-155` › `PrBriefBlock.test.tsx:48-53`, `OverviewTab.test.tsx:135-139`; LIVE 8 | PASS |
| AC-2 | server: `brief/routes.ts:30-40`, `brief/service.ts:141-155` › `brief.it.test.ts:152-167`; client: `OT/OverviewTab.tsx:71`, `HK/brief.ts:21-29` › `brief.test.ts:65-77`, `OverviewTab.test.tsx:147-155`; LIVE 8 | PASS |
| AC-3 | `PB/PrBriefBlock.tsx:98-165` › `PrBriefBlock.test.tsx:55-64` | PASS |
| AC-4 | `OT/OverviewTab.tsx:28,40-49,82-92` › `OverviewTab.test.tsx:135-139` | PASS |
| AC-5 (amended) | `PB/PrBriefBlock.tsx:102-116`, `OT/OverviewTab.tsx:75` › `PrBriefBlock.test.tsx:172-183, 220-233`, `OverviewTab.test.tsx:276-290`; LIVE 8 | PASS |
| AC-6 | server: `brief/helpers.ts:245-250, 256-257` › `helpers.test.ts:183-205`; client: `PB/PrBriefBlock.tsx:118-131,184-211` › `PrBriefBlock.test.tsx:76-83` | PASS |
| AC-7 | server: `brief/helpers.ts:252-254` › `helpers.test.ts:183-205`; client: `PB/PrBriefBlock.tsx:138-164` › `PrBriefBlock.test.tsx:85-91` | PASS |
| AC-8 | `brief/helpers.ts:256-263`, `brief/constants.ts:30-31` › `helpers.test.ts:207-221` | PASS |
| AC-9 | server: `brief/service.ts:73-85` › `service.test.ts:95-107`, `brief.it.test.ts:179-193`; client: `PG/page.tsx:149-155`, `OT/OverviewTab.tsx:34-38` › `PrBriefBlock.test.tsx:155-164`, `OverviewTab.test.tsx:171-186` | PASS |
| AC-10 | `brief/helpers.ts:245-250` › `helpers.test.ts:117` | PASS |
| AC-11 | `brief/helpers.ts:252-254, 42-62, 129-141, 188-197` › `helpers.test.ts:132`, `helpers.bounds.test.ts:115-147` | PASS |
| AC-12 | `brief/service.ts:88-93,127,143`, `brief/helpers.ts:185` › `service.test.ts:198-232`, `helpers.test.ts:151,170` | PASS |
| AC-13 | one `completeStructured` with `maxRetries: 0` (`brief/service.ts:184-211`, `constants.ts:38`); the documents are read from the clone, the model is not asked for them (`service.ts:112-125`) › `service.test.ts:114-133, 420-429`; LIVE 9. Not covered: `server/src/adapters/llm/openai.ts:97-110` / `anthropic.ts:100` → `withRetry` (`server/src/platform/resilience.ts:47-58`) re-sends on 429/5xx | PARTIAL (by decision, `specs/pr-brief/plan.md:460`) |
| AC-14 | `brief/helpers.ts:419-517`: cut order documents → intent lists → intent → other facts, never throws, no hunk body › `helpers.test.ts:316, 422, 713-726, 777-813` (the new cases with intent + documents), `helpers.bounds.test.ts:51-66` | PASS |
| AC-15 | `brief/helpers.ts:304-305, 337-362` › `helpers.test.ts:300, 323` | PASS |
| AC-16 | both `contracts/brief.ts` copies identical (`134-150` / `126-160`); validated against `PrBriefDraft` (`service.ts:194`), nothing stored on failure › `contracts.test.ts:351-353, 393-403`, `service.test.ts:124-133` | PASS |
| AC-17 | `brief/service.ts:137,190,193` (`risk_brief`) › `service.test.ts:178-184`, `brief.it.test.ts:195-210` | PASS |
| AC-18 | server: `brief/routes.ts:21-28` → `service.ts:60-70` › `brief.it.test.ts:152-167`, `routes.test.ts:25`; client: `HK/brief.ts:12-18`, `OT/OverviewTab.tsx:31-32` › `brief.test.ts:48-54`, `OverviewTab.test.tsx:141-145` | PASS |
| AC-19 | `server/src/db/schema/reviews.ts:67-72`, `brief/repository.ts:25-30`, `service.ts:144` › `service.test.ts:186-196`, `brief.it.test.ts:169-177` | PASS |
| AC-20 | `PB/PrBriefBlock.tsx:75-77`, `PB/helpers.ts:4` › `PrBriefBlock.test.tsx:93-100` | PASS |
| AC-21 | server: `brief/service.ts:73-155`, `repository.ts:25-30` › `brief.it.test.ts:169-177`; client: `PB/PrBriefBlock.tsx:64-71`, `HK/brief.ts:28` › `PrBriefBlock.test.tsx:93-109`, `brief.test.ts:65-77` | PASS |
| AC-22 | chain `PB/PrBriefBlock.tsx:145-152` → `PG/page.tsx:72-80,182-191` → `DiffTab.tsx:106,155` → `DV/DiffViewer/DiffViewer.tsx:43` → `DV/FileCard/FileCard.tsx:68-93` → `DV/CodeLine/CodeLine.tsx:64-71` › `page.test.tsx:114-126`, `DiffTab.test.tsx:360-367`, `FileCard.test.tsx:187-198`. `scrollIntoView` is mocked in the tests; scrolling to a line inside a collapsed group has not been seen in a browser | PARTIAL (by decision, `plan.md:462`) |
| AC-23 | `PB/PrBriefBlock.tsx:191-203`, `DV/FileCard/FileCard.tsx:74-88` › `FileCard.test.tsx:200-209`, `page.test.tsx:128-138` | PASS |
| AC-24 | `PB/PrBriefBlock.tsx:153-157, 204-208` › `PrBriefBlock.test.tsx:111-121` | PASS |
| AC-25 | `PB/PrBriefBlock.tsx:182-212` › `PrBriefBlock.test.tsx:123-132` | PASS |
| AC-26 | `PB/PrBriefBlock.tsx:67,83,90-96` › `PrBriefBlock.test.tsx:134-143`, `OverviewTab.test.tsx:157-162` | PASS |
| AC-27 | `PB/PrBriefBlock.tsx:35-55`, `OT/OverviewTab.tsx:65` › `PrBriefBlock.test.tsx:145-153`, `OverviewTab.test.tsx:164-169` | PASS |
| AC-28 | `PB/PrBriefBlock.tsx:79-88`, `HK/brief.ts:20-29` › `PrBriefBlock.test.tsx:155-164`, `brief.test.ts:79-91`, `OverviewTab.test.tsx:171-186` | PASS |
| AC-29 | The block's own texts come from `brief` (`PB/PrBriefBlock.tsx:33,181`, `PB/constants.ts:4-8`). But the Intent block that AC-31 places inside the brief (`PB/PrBriefBlock.tsx:38,47,59`) takes its caption and texts from `intent` (`IC/IntentCard.tsx:47`), and its error state is the design-system `ErrorState` with a hardcoded "Retry" (`IC/IntentCard.tsx:66` → `client/src/vendor/ui/primitives/ErrorState.tsx:53-55`). `brief.json` `block.intent` exists but nothing uses it | **PARTIAL (new)** |
| AC-30 | `brief/service.ts:173-177` → `reviews/repository/pull.repo.ts:9-19`, `brief/repository.ts:15-22` › `brief.it.test.ts:212-222`, `service.test.ts:109,402` | PASS |
| AC-31 | server: `brief/service.ts:95-110`, `helpers.ts:326-335` › `service.test.ts:273-293, 361-382`, `brief.it.test.ts:282-306`, `helpers.test.ts:545-563`; client: `PB/PrBriefBlock.tsx:38,47,59`, `OT/OverviewTab.tsx:51-61,74-75` › `OverviewTab.test.tsx:263-274, 307-334`, `PrBriefBlock.test.tsx:191-205` | PASS |
| AC-32 | server: only `IntentService.get` (`brief/service.ts:95-110`) › `service.test.ts:317-330, 420-429`, `brief.it.test.ts:298-306`; client: `OT/OverviewTab.tsx:71` › `OverviewTab.test.tsx:216-223`; LIVE 9. The "exactly one request" part carries the AC-13 caveat | PASS |
| AC-33 | server: `reviews/intent/intent-service.ts:36`, `brief/helpers.ts:323-334` › `service.test.ts:295-315`, `brief.it.test.ts:308-321`; client: `IC/IntentCard.tsx:85` › `OverviewTab.test.tsx:292-305` | PASS |
| AC-34 | `brief/service.ts:112-125` → `pc/service.ts:319-349` (enabled agents, by name, a path once; bad documents skipped) › `pc/service.test.ts:422-457` (incl. agents out of name order), `467-485`; `brief/service.test.ts:420-429, 454-459`; `brief.it.test.ts:122-140`; LIVE 8 | PASS |
| AC-35 | `brief/helpers.ts:104-105, 167-205, 217` › `helpers.test.ts:697-711`, `service.test.ts:484-500`; LIVE 8 | PASS |
| AC-36 | `brief/service.ts:151`, `helpers.ts:444` › `service.test.ts:431-452`, `brief.it.test.ts:122-140`; LIVE 8 | PASS |

**Підсумок:**

| | Кількість | AC |
|---|---|---|
| PASS | 33 | усі, крім трьох нижче |
| PARTIAL | 3 | AC-13 (рішення), AC-22 (рішення), AC-29 (нове) |
| MISSING | 0 | — |

Проти §2 і §7:
- **AC-29: PASS → PARTIAL.** Розрив з'явився разом з AC-31 (блок Intent усередині брифу, 2026-10-12); повторна перевірка тоді його не помітила.
- **AC-14 і AC-34** тепер мають тести, яких бракувало: intent разом із документами під тісним бюджетом; агенти в неалфавітному порядку.
- **AC-28 (бриф):** перевірено вживу на PR #19.

**Відкрите:**
- **AC-29.** Підпис і статичні тексти блоку Intent усередині брифу брати з `brief` (`block.intent` уже є), а кнопку повтору в стані помилки підписувати з message-файла. «Retry» живе в компоненті дизайн-системи `ErrorState`, тож потрібно або рендерити помилку без нього, або додати пропс до примітива. Рішення за власником.
- **AC-13, AC-22** — без змін, PARTIAL за рішенням власника (`plan.md:460, 462`).
