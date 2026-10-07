# Контрольні експерименти — скіли як єдина змінна (AC-17, AC-18)

Процедура — [server/specs/skills-lab.md §6](../../server/specs/skills-lab.md). Стенд: `./scripts/dev.sh`,
прогони запущені кнопкою **Run Review** на сторінці PR, скіли вмикались і вимикались на вкладці
**Skills** агента. Дата: 2026-10-07.

- Модель обох агентів: `openrouter` / `deepseek/deepseek-v4-flash`, стратегія single-pass.
- Системний промпт: v3 — роль, спосіб аналізу, вимога `file:line`, severity, verdict. Конкретних
  перевірок у ньому немає; вони приходять лише зі скілів.
- Між прогонами A і B у парі змінюється тільки набір увімкнених скілів: той самий агент, та сама
  модель, той самий diff.
- PR: [#10](https://github.com/equalizer2k9/dev-digest/pull/10) `test/happy-path-only` —
  `parseRetryAfter` + тест на один випадок; [#9](https://github.com/equalizer2k9/dev-digest/pull/9)
  `api/route-signature-change` — `PrFile.additions` → `added_lines` лише в серверному контракті.

## Результати

| PR | Агент | Прогін | Run id | Блок скілів у трасі (токени) | Знахідки | Очікувана знахідка |
|---|---|---|---|---|---|---|
| #10 | Test Quality Reviewer | A — скіли вимкнені | `782a7f1c-e779-4cac-825f-2e51bda66f5a` | немає | 1 — WARNING | **є** (очікувалось: нема) |
| #10 | Test Quality Reviewer | B — 4 скіли | `7cad8f94-cefd-4308-ba72-4334c5d4a17d` | є — 2044 (uncovered-branches 507 · edge-cases 504 · mock-overuse 482 · flaky-tests 551) | 1 — CRITICAL | є |
| #9 | API Contract Reviewer | A — скіли вимкнені | `01e2a66b-cc0b-4387-b729-d1682444c2d4` | немає | 1 — CRITICAL (false positive) | нема |
| #9 | API Contract Reviewer | B — 4 скіли | `5e3c0877-8c1c-4b15-8ea0-ad883b6795b5` | є — 1841 (breaking-change 491 · response-schema 446 · deprecation-policy 439 · semver-discipline 465) | 5 — CRITICAL (1 false positive) | є |

«Очікувана знахідка» — непокриті гілки для #10, breaking change для #9.

Вхідні токени запиту: #10 A 3126 → B 5243; #9 A 3596 → B 5484.

Скріншоти Run Trace (секція Prompt assembly):

| | A — скіли вимкнені | B — 4 скіли |
|---|---|---|
| Test Quality / #10 | [test-quality-run-a-no-skills.png](control-experiments/test-quality-run-a-no-skills.png) | [test-quality-run-b-with-skills.png](control-experiments/test-quality-run-b-with-skills.png) |
| API Contract / #9 | [api-contract-run-a-no-skills.png](control-experiments/api-contract-run-a-no-skills.png) | [api-contract-run-b-with-skills.png](control-experiments/api-contract-run-b-with-skills.png) |

## Що знайшли прогони A (без скілів)

- **#10, Test Quality** — WARNING `server/src/modules/pulls/retry-after.test.ts:1-8`: «Insufficient
  test coverage for parseRetryAfter». Агент і без скіла помітив, що тест покриває одну гілку з
  кількох. Тобто умова AC-17 «без скіла не флагує» **не виконалась**: роль «рев'ю тестів» плюс
  один тест на функцію з чотирма умовами — достатньо, щоб модель це побачила сама.
- **#9, API Contract** — CRITICAL `server/src/modules/pulls/routes.ts:304`: false positive (нижче).
  Саме перейменування поля як зміну контракту агент без скілів **не назвав**.

## Суть знахідок B

**#10 — Test Quality Reviewer**

- CRITICAL `server/src/modules/pulls/retry-after.ts:8-15` — «Most branches of parseRetryAfter are
  untested». Перелічує п'ять шляхів функції (null, порожній рядок, число, невалідна дата, валідна
  HTTP-дата) і каже, що тест `'120'` проходить лише третій. У пропонованому виправленні названі
  межові значення: `''`, `'   '`, `'abc'`, `'0'`, дата з зафіксованим `now`, дата в минулому → `0`.

Різниця з прогоном A: знахідка прив'язана до рядків продакшн-коду, а не до файлу тесту, гілки
пронумеровані, межові значення названі, severity CRITICAL замість WARNING (так велить
`uncovered-branches`). Окремої знахідки від `edge-cases` немає — межові випадки потрапили в ту
саму знахідку.

**#9 — API Contract Reviewer**

Усі чотири справжні знахідки цитують `server/src/vendor/shared/contracts/platform.ts:190` — рядок,
де `additions` замінено на `added_lines`:

- CRITICAL — breaking change: поле `additions` зникло з `PrFile` без аліасу; клієнт, що читає
  `files[i].additions`, отримує `undefined` (скіл `breaking-change`).
- CRITICAL — клієнтська копія контракту не оновлена, серверна й клієнтська схеми розійшлись
  (`response-schema`).
- CRITICAL — поле видалено без `@deprecated` і без періоду, коли віддаються обидва
  (`deprecation-policy`).
- CRITICAL — breaking change без підняття MAJOR-версії: `package.json` у diff немає
  (`semver-discipline`).

## False positives

- **`server/src/modules/pulls/routes.ts:304`** — у прогонах A і B на #9. Агент стверджує, що
  `added_lines: f.additions` читає неіснуюче поле і відповідь містить `undefined`. Це хибно: у цій
  гілці `f` — рядок таблиці `pr_files`, де колонка й далі називається `additions` (схему БД PR не
  чіпає); typecheck гілки проходить. Модель сплутала рядок БД з DTO `PrFile`. У v2-прогоні була та
  сама помилка з діапазоном `routes.ts:255-307`. Знахідки лишились у базі як є, не прийняті й не
  відхилені; діяти за ними не треба.
- **Неточність усередині справжньої знахідки** — `breaking-change` у прогоні B пише, що ламаються
  «detail and list endpoints». Список PR віддає `PrMeta`, його зміна не зачіпає; ламається лише
  `GET /pulls/:id`.
- **Не false positive, але шум** — чотири CRITICAL на одному рядку `platform.ts:190` мають одну
  причину, тому score PR падає до 0. Номери рядків у знахідці #10 B зсунуті на один (перевірка
  `null` — рядок 7, а не 8); діапазон `8-15` усе одно в межах функції.

Що з цим робити далі (не зроблено, щоб не змінювати умови експерименту): у `response-schema`
додати крок «перш ніж флагувати producer, визнач тип об'єкта-джерела — рядок БД чи DTO».

## Історія прогонів

Попередні прогони на цих PR лишаємо як історію, у таблицю результатів вони не входять.

- **#10, промпт v1, без скілів — два зайві прогони.** `442774b9-dfb9-4052-98f5-6a40a96469a6` завис
  на 16,5 хв (990 с), був скасований, але однаково дописався як `done`: 138 544 токени, $0.0114,
  1 CRITICAL. `8876909f-6e70-468f-ae3a-812bb95470cd` — повторний запуск, 1 CRITICAL. Промпт v1
  прямо перелічував, що шукати, тому скіл нічого не додавав.
- **Промпт v2** (#10: `aa8d9f03…`, `826a66a1…`; #9: `e619d7b1…`, `d15f49d8…`) містив правило «без
  секції Skills — порожній список», тож A давав 0 знахідок за конструкцією. Ці прогони відкинуті
  як нечесний контроль; v3 це правило прибрав.

## Висновок

AC-18 виконано: без скілів API Contract Reviewer не назвав перейменування поля зміною контракту, а
з чотирма скілами повідомив про breaking change з точним `platform.ts:190`. AC-17 виконано
наполовину: зі скілами агент називає непокриті гілки й межові значення, але WARNING про слабке
покриття він видає і без скілів — скіл тут підвищує точність і severity, а не вмикає знахідку.
Обидва агенти дають один і той самий false positive на `routes.ts:304`, з якого видно, що скіли
додають правила, але не перевірку фактів.
