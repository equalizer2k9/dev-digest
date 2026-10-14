# ДЗ №3 — Smart Diff: вимоги

Джерело: сторінка ДЗ L03 на edu.goit.global (зібрано 2026-09-22). Дедлайн 27.09.2026 23:45 — минув.

## Що робимо

Вкладка **Files changed** зараз показує файли в порядку GitHub (lock-файл поруч із логікою), а знахідки агента живуть окремо на **Agent runs**. Smart Diff:

1. Сортує файли PR за роллю: **core** → **tests** → **wiring** (конфіги, barrel-файли) → **docs** → **boilerplate** (lock-файли, згенероване, snapshots).
2. Показує результат рев'ю в diff: на заголовку групи — скільки файлів у ній мають знахідки; на картці файла — крапка-індикатор; під потрібним рядком — коментар зі знахідкою, як на Agent runs.

Здача: PR у форку з описом реалізації + демо-відео 1–3 хв за сценарієм нижче. DoD: усі P1 виконані й видно у відео; P2/P3 не блокують. Будувати через конвеєр: planner → implementer → (architecture-reviewer ∥ plan-verifier); в описі PR — який субагент що зробив і що знайшов plan-verifier.

## Що вже є в стартері (спершу знайти у своєму коді)

| Шар | Є |
| --- | --- |
| Сервер | `GET /pulls/:id` → `files[]` PrFile {path, additions, deletions, patch (може бути null)}; `GET /pulls/:id/reviews` → `findings[]` {file, start_line, end_line, severity CRITICAL/WARNING/SUGGESTION, title, rationale, suggestion, confidence, accepted_at, dismissed_at}. Поля `line` немає — прив'язка до `start_line` |
| Клієнт-хуки | `client/src/lib/hooks/reviews.ts`: `usePrReviews(prId)`, `useFindingAction()`; запит кешується |
| Контракт | Zod `SmartDiff` у `server/src/vendor/shared/contracts/brief.ts` + ідентична копія `client/src/vendor/shared/contracts/brief.ts`: `groups[{ role, files[{ path, additions, deletions, finding_lines[], pseudocode_summary? }] }]` + `split_suggestion { too_big, total_lines, proposed_splits[] }`; тип `SmartDiffResponse` у `review-api.ts`. Роут створюємо самі. `SmartDiffRole = z.enum(['core','wiring','boilerplate'])` — розширити до 5 в ОБОХ копіях |
| Компоненти | `DiffTab` → `DiffViewer` (`client/src/components/diff-viewer/`); `FileCard` згортається, авторозгортає до 200 рядків (`AUTO_EXPAND_MAX_LINES`), у шапці лічильник коментарів; `parsePatch` (helpers.ts) — рядки з oldNo/newNo; `comments.ts`: `keysForLine(ln)` → `RIGHT:<new>`/`LEFT:<old>`, `partitionThreads`; `CodeLine` малює під рядком; знахідку чіпляти ключем `RIGHT:${finding.start_line}`; `FindingCard` у `_components/FindingCard/`; `SEV`, `SeverityBadge` у `client/src/vendor/ui/primitives/Badge.tsx`; i18n `client/messages/en/prReview.json`, ключ `smartDiff` — додати `testsLabel`, `docsLabel` |

## Класифікація — перше правило, що збіглося, виграє

| Порядок | Роль | Патерни |
| --- | --- | --- |
| 1 | boilerplate | `*.lock`, pnpm-lock.yaml, package-lock.json, yarn.lock, `dist/**`, `build/**`, `**/__snapshots__/**`, `*.snap`, `*.generated.*`, `*.min.js` |
| 2 | tests | `**/*.test.ts(x)`, `**/*.it.test.ts`, `**/*.spec.ts`, `**/test/**`, `**/tests/**`, `**/__tests__/**`, `e2e/**` |
| 3 | wiring | index.ts/index.js (barrel), `*.config.*`, `tsconfig*.json`, `.eslintrc*`, `.env*`, `docker-compose*.yml`, `.github/**`, `.claude/**` |
| 4 | docs | `**/*.md`, `docs/**`, README*, CHANGELOG*, LICENSE |
| 5 | core | усе інше |

Спірні кейси — обов'язково в таблиці тестів: `__tests__/__snapshots__/x.snap` → boilerplate; `.claude/skills/security/SKILL.md` → wiring; `e2e/README.md` → tests (або змінити правило й зафіксувати тестом).

## Як знахідки показані

- Заголовок групи — `● N` перед «N files»: кількість ФАЙЛІВ зі знахідками, не знахідок.
- Картка файла — крапка біля шляху, без числа (не плутати з лічильником GitHub-коментарів).
- Рядок коду — під ним коментар: severity, заголовок, пояснення, Accept/Dismiss (як FindingCard на Agent runs); рядок — кольорова смужка зліва + підпис справа: CRITICAL → blocker, WARNING → warning, SUGGESTION → suggestion.
- Прототип: «REVIEWER-ORDERED DIFF», тумблер Smart order / Original order; підписи груп: Core logic «The substance of the change — review closely», Wiring «Hooks the core into the app», Boilerplate «Generated / mechanical — skim».

## Можлива реалізація

1. `classifyFile(path): SmartDiffRole` — чиста функція в `server/src/modules/reviews/smart-diff/` (або окремий модуль), патерни й порядок у `constants.ts`; спершу таблиця тестів, потім реалізація. Без залежності від роута — на L08 стане фільтром перед збіркою промпта.
2. Контракт: `SmartDiffRole` до 5 значень в обох `brief.ts`; `testsLabel`/`docsLabel` у prReview.json.
3. `GET /pulls/:id/smart-diff`: файли PR + знахідки останнього рев'ю → групи у фіксованому порядку, `finding_lines` зі `start_line`; `split_suggestion`: `too_big: false`, `total_lines = Σ additions+deletions`, `proposed_splits: []`.
4. Files changed: заголовок ролі + кількість; docs і boilerplate згорнуті за замовчуванням, решта — за `AUTO_EXPAND_MAX_LINES`.
5. Знахідки: `usePrReviews(prId)` у DiffTab → у FileCard; три місця (лічильник групи, крапка файла, коментар під рядком через `keysForLine` + `FindingCard`).

## Тестовий PR

У форку, доданому в DevDigest: мінімум один lock-файл (pnpm-lock.yaml — при додаванні залежності), один файл логіки в server/src або client/src, один тест, один конфіг або barrel. Після Run review — ≥1 знахідка в core; для стабільності — сильніша модель агента.

## Критерії

| Рівень | № | Критерій |
| --- | --- | --- |
| P1 | 1 | Files changed: 5 груп у порядку core → tests → wiring → docs → boilerplate, кожна з підписом ролі й кількістю файлів |
| P1 | 2 | Lock-файл = boilerplate; docs і boilerplate при відкритті згорнуті |
| P1 | 3 | Після Run review на заголовку групи — лічильник файлів зі знахідками |
| P1 | 4 | На картці файла зі знахідками — крапка-індикатор |
| P1 | 5 | У розгорнутому файлі під потрібним рядком — коментар: severity, заголовок, пояснення |
| P1 | 6 | Перемикач Original order повертає порядок GitHub |
| P1 | 7 | Відкритий PR з описом реалізації + демо-відео |
| P2 | 1 | Патерни й порядок ролей в одному файлі констант; юніт-тест класифікатора на таблицю «шлях → роль» із трьома спірними кейсами |
| P2 | 2 | Відповідь роута проходить валідацію контрактом SmartDiff; enum розширено в обох brief.ts |
| P2 | 3 | У логах Smart Diff немає виклику моделі; групування працює до першого рев'ю |
| P2 | 4 | Рядок зі знахідкою — кольорова смужка + підпис severity |
| P2 | 5 | Accept / Dismiss у коментарі працюють і змінюють стан знахідки |
| P2 | 6 | Знахідка, чий рядок не в патчі, — окремим блоком у кінці файла |
| P2 | 7 | Коментарі зі знахідками ховаються тим самим перемикачем, що й коментарі GitHub |
| P2 | 8 | Опис PR: які субагенти використано, що перевірив plan-verifier |
| P3 | 1 | Sticky-заголовок групи при прокручуванні |
| P3 | 2 | Коментар зі знахідкою згортається в один рядок |
| P3 | 3 | Empty state «рев'ю ще не запускали» замість нулів |
| P3 | 4 | Лічильники оновлюються після Run review без перезавантаження |
| P3 | 5 | Підписи груп з `prReview.json` (`smartDiff`), не зашиті в компонент |

## Сценарій відео

1. Тестовий PR → Files changed → 5 груп із підписами й лічильниками, docs і boilerplate згорнуті.
2. Розгорнути boilerplate — lock-файл усередині.
3. Run review → дочекатись → Files changed: лічильник на заголовку групи + крапка на картці.
4. Розгорнути файл зі знахідкою → коментар під рядком. Перемкнути Original order і назад.
5. Одним реченням: чому групування не викликає модель.
