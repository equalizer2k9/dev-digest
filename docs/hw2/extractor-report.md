# Conventions Extractor — якість знахідок на форку

Скан `equalizer2k9/dev-digest` у студії (Conventions → Run Scan), 2026-10-07. Дані — з
`GET /repos/:id/conventions`, `GET /repos/:id/conventions/draft` і
`GET /skills/cb6e4f60-d8f7-4b1a-9637-6be30b2354e2`.

## 1. Параметри скану

| Параметр | Значення |
|---|---|
| Модель | `openrouter` / `deepseek/deepseek-v4-flash` — береться з Settings → Feature Models → Conventions |
| `head_sha` | [`c6af1e4`](https://github.com/equalizer2k9/dev-digest/commit/c6af1e452969dcad9f451e29c0a4e461a41405ae) — HEAD локального клону, стартовий стан репо, а не поточний `main` форку |
| Файлів-зразків | 16 — ранжовані файли коду (до 12) плюс конфіги пакетів |
| Кандидатів від моделі | 29 |
| Відкинуто перевіркою доказів (`dropped`) | 0 |
| Попереджень | 0 |

**Критерій 53.** Перший запуск упав: у налаштуваннях стояла `z-ai/glm-5.2:free`, OpenRouter
відповів `404 This model is unavailable for free`. Модель замінено в рядку Conventions через
dropdown з пошуком, без зміни коду, і наступний скан пройшов. Тобто модель фічі обирається
динамічно з налаштувань.

`dropped = 0` означає, що всі 29 цитат моделі збіглися з реальними рядками файлів: кодова
перевірка не відкинула жодного кандидата.

## 2. Рішення

Прийнято 10 · відхилено 19 · відредаговано 1 (входить у 10 прийнятих).

За категоріями моделі: style 19, typing 4, structure 2, api 1, error-handling 1, naming 1,
imports 1.

### Прийняті — приклади

Посилання перевірені: на цьому коміті в цих рядках стоїть саме процитований код.

| Правило | Доказ |
|---|---|
| Foreign key references use onDelete cascade. | [server/src/db/schema/core.ts:22-24](https://github.com/equalizer2k9/dev-digest/blob/c6af1e452969dcad9f451e29c0a4e461a41405ae/server/src/db/schema/core.ts#L22-L24) |
| Primary key columns use uuid with defaultRandom. | [server/src/db/schema/core.ts:7](https://github.com/equalizer2k9/dev-digest/blob/c6af1e452969dcad9f451e29c0a4e461a41405ae/server/src/db/schema/core.ts#L7) |
| API errors are normalized to an ApiError class with status, code, and details. | [client/src/lib/api.ts:8-18](https://github.com/equalizer2k9/dev-digest/blob/c6af1e452969dcad9f451e29c0a4e461a41405ae/client/src/lib/api.ts#L8-L18) |
| Style objects use satisfies CSSProperties for type safety. | [client/src/components/diff-viewer/comments.ts:110](https://github.com/equalizer2k9/dev-digest/blob/c6af1e452969dcad9f451e29c0a4e461a41405ae/client/src/components/diff-viewer/comments.ts#L110) |
| Constants are exported using UPPER_SNAKE_CASE naming. | [server/src/modules/repo-intel/constants.ts:7](https://github.com/equalizer2k9/dev-digest/blob/c6af1e452969dcad9f451e29c0a4e461a41405ae/server/src/modules/repo-intel/constants.ts#L7) |

Решта прийнятих: barrel-файл схеми, `as const` для style-об'єктів, методи API-клієнта, path
aliases `@/*` і `@devdigest/*`, composite `uniqueIndex` (відредаговане, нижче).

### Відхилені — типові

| Кандидат | Доказ |
|---|---|
| TypeScript strict mode is enabled in all tsconfig files. | [client/tsconfig.json:7](https://github.com/equalizer2k9/dev-digest/blob/c6af1e452969dcad9f451e29c0a4e461a41405ae/client/tsconfig.json#L7) |
| Module system is set to ESNext in all tsconfig files. | [client/tsconfig.json:4](https://github.com/equalizer2k9/dev-digest/blob/c6af1e452969dcad9f451e29c0a4e461a41405ae/client/tsconfig.json#L4) |
| skipLibCheck is enabled in all tsconfig files. | [client/tsconfig.json:12](https://github.com/equalizer2k9/dev-digest/blob/c6af1e452969dcad9f451e29c0a4e461a41405ae/client/tsconfig.json#L12) |

Чому це не конвенція коду: опція компілятора задається один раз у конфігу, і її дотримання
забезпечує сам `tsc`. Рев'юер не може порушити її в diff звичайного файлу, тож у промпті агента
таке правило лише займає токени. Із 19 відхилених 18 — саме опції `tsconfig`; ще одне —
«схеми імпортують з `drizzle-orm/pg-core`», наслідок вибору бібліотеки, а не правило.

Відхилені кандидати після Reject зникають з `GET /repos/:id/conventions`, тому їхній перелік
узято зі стану API одразу після скану.

### Відредаговане

- **До:** Unique indexes are defined on composite columns.
- **Після:** Tables whose rows are unique per a combination of columns declare a composite
  uniqueIndex in the Drizzle schema instead of checking uniqueness in application code.
- **Доказ:** [server/src/db/schema/core.ts:45-46](https://github.com/equalizer2k9/dev-digest/blob/c6af1e452969dcad9f451e29c0a4e461a41405ae/server/src/db/schema/core.ts#L45-L46)

Початкове формулювання описувало факт, а не правило, яке можна порушити; нове каже, що робити і
чого уникати.

## 3. Результат

| | |
|---|---|
| Скіл | `repo-conventions` (`cb6e4f60-d8f7-4b1a-9637-6be30b2354e2`) |
| Тип / джерело / версія | `convention` / `extracted` / v8 — тіло байт-у-байт дорівнює v1 |
| Зміст | 10 правил, кожне з цитатою коду й `file:line`; файли-докази: 6 |
| Прилінковано | API Contract Reviewer, п'ятим у порядку промпту |
| Розмір тіла | 3884 символи, 134 рядки, **1005 токенів**; у промпті з заголовком `### repo-conventions (v8)` — 1013 |

Токени пораховані тим самим лічильником, що пише трасу (js-tiktoken `cl100k_base`), локально над
тілом скіла. Траса прогону `6ab27432-b768-42fb-9e27-df45fddac49f` (PR #9, той, що в демо-відео)
показує для блоку `repo-conventions` ті самі 1013 токенів.

### Стан після запису демо

Скіл створено як v1 з 10 прийнятих правил. Під час запису демо сцена «ReScan → Create skill»
кілька разів пересоздала його, і версії v2–v7 мали інший набір правил. Потім тіло v1 повернуто
через Versioning → Restore; Restore завжди додає нову версію, тому поточна — **v8** з тілом v1.
Саме v8 прилінкована до API Contract Reviewer і саме її видно у відео.

Що у відео не збігається з таблицями вище, і чому:

- **Опис на картці скіла — «15 house conventions extracted from dev-digest».** Restore повертає
  лише тіло; опис лишився від проміжної версії. У тілі 10 правил.
- **У модалці Create skill — «17 house conventions».** Це чернетка з поточного списку кандидатів,
  а не скіл: повторні скани додали кандидатів, і зараз прийнято 17, ще 11 очікують рішення. У
  відео модалку закрито через Cancel, скіл не змінено.
- **Скан у відео — повторний** (ReScan): 16 файлів-зразків, 2 кандидати відкинуто перевіркою
  доказів. Числа розділів 1–2 описують перший скан.

## 4. Висновок

Extractor добре тримає докази: кожен із 29 кандидатів мав цитату, що збіглася з реальними
рядками, а правила про схему БД, API-клієнт і стилі — справжні звички цього коду, придатні для
рев'ю. Шумить він на конфігах: 19 із 29 кандидатів (66%) — про `tsconfig`, і 18 з них довелося
відхилити вручну. Причина в відборі зразків — `tsconfig.json` кожного пакета додається до
вибірки навмисно, і модель видає по кандидату на кожну опцію. Покращити варто дві речі:
обмежити частку кандидатів із конфігів (або подавати конфіги лише як контекст, без права бути
доказом) і додати у вибірку тестові файли — зараз `getConventionSamples` відсікає шляхи з
`.test.` / `.spec.` / `__tests__/`, тож конвенцій про тести скан не знаходить узагалі.
