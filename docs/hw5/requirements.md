# ДЗ №5 — PR Why + Risk Brief через SDD-конвеєр: вимоги

Джерело: урок L05 і сторінка ДЗ на edu.goit.global (зібрано 2026-10-03). Дедлайн 04.10.2026 23:45 — минув.

## Що робимо

Рев'юер відкриває чужий PR «холодним»: не знає, навіщо зміна, що в ній ризиковано і з якого файла почати. Частину вже закривають Smart Diff (ДЗ №3) і Blast Radius (ДЗ №4). Завдання — зібрати все в одну картку **PR Brief** на вкладці Overview і додати дві нові частини від моделі:

- **Risk areas** — конкретні ризики PR, кожен із посиланням на файл;
- **Review focus** — з яких рядків почати рев'ю і чому.

Модель викликається **рівно один раз** і отримує вже пораховані факти: intent (якщо є), підсумок blast radius, статистику diff, опис PR, пов'язаний issue, прикріплені спеки (якщо є). **Код diff вона не читає.**

**Головне в цьому ДЗ — процес.** Фіча проходить SDD-конвеєр: spec-creator → implementation-planner → run-plan → plan-verifier. Людина відповідає на уточнення й переглядає артефакти; спеку й план руками не пише.

Здача: PR у форку з описом реалізації + демо-відео 1–3 хв. DoD: усі P1 видно у відео; P2/P3 не блокують.

## Передумова — SDD-конвеєр (лаба L05, крок 1)

| Що | Вимога |
| --- | --- |
| `spec-creator` (`.claude/agents/`) | розпитує про все неясне за 6 категоріями (Data & loading · Display & sorting · Interactions · State & persistence · Feedback · Edge cases); без відповіді — `[NEEDS CLARIFICATION]`, не здогадка; спершу блокуючі питання, решта інлайн; AC у форматі EARS; пише лише файл спеки; стан системи може читати через devdigest-mcp; мова спеки — англійська; без деталей імплементації (файли, порядок робіт — у плані); фінальний self-check |
| `planner` → `implementation-planner` | лише плани, без уточнення вимог; кожна задача посилається на AC-ID; traceability задача → AC → тест |
| `run-plan` (команда в `.claude/commands/`) | бере затверджені спеку й план; implementer → architecture-reviewer → ітерації фіксів → plan-verifier; spec-creator і implementation-planner запускаються окремо вручну; test-writer не використовуємо |
| `plan-verifier` | уже є; фінальна матриця AC → задача → тест → коміт, без незакритих рядків |
| README реєстру агентів | оновити |

### Шаблон feature spec

```
# Spec: <назва фічі>
Spec ID: SPEC-NN
Status: draft | approved | implemented
Supersedes: <посилання, якщо замінює попереднє рішення>

## Problem and user
## Goals / Non-goals
## User stories
## Acceptance criteria (EARS)
## Edge cases
## Non-functional requirements
## Inputs and provenance
## Untrusted inputs
## Open questions
```

- EARS: Ubiquitous (The system shall…) · Event-driven (WHEN … the system shall …) · State-driven (WHILE …) · Unwanted (IF … THEN …) · Optional (WHERE …). Кожен AC — одна перевірювана річ з ID (AC-1…).
- Inputs and provenance: для кожного входу — `[reused: …]` / `[deterministic: …]` / `[new: 1 LLM call]`; бюджет входу моделі з одиницею виміру (напр. 8 000 токенів).
- Untrusted inputs: опис PR, issue, спеки з клону — дані, не інструкції (delimiters + injection guard, як для diff).
- Чекліст рев'ю спеки: кожен AC перевірюваний; без суперечностей; поведінка, а не деталь реалізації; non-goals явні; усі `[NEEDS CLARIFICATION]` закриті.

### Cross-model review

`plan.md` до коду віддати на рев'ю моделі **іншої родини** (не Anthropic) у ролі staff engineer, без історії діалогу, з контекстом проєкту й чеклістом. Коротку нотатку — яка модель і що знайшла — зберегти й додати в опис PR.

## Що вже є в стартері / форку

| Що | Деталі |
| --- | --- |
| Intent | таблиця `pr_intent`, `getIntent(prId)` у `server/src/modules/reviews/repository.ts`. Заповнює Intent Layer з лаби L03 — **у нашому форку не реалізований**, тож бриф працює без intent і прямо про це пише |
| Blast radius | `GET /pulls/:id/blast` з ДЗ №4; для брифу досить `summary` і файлів-викликачів |
| Diff stats | `GET /pulls/:id` → `files[]` з additions/deletions; ролі — Smart Diff з ДЗ №3 |
| Спеки | документи, прикріплені до рев'юера через Project Context Folder (лаба L05) — **у нашому форку немає**; бриф пише, що спек не прикріплено |
| Контракт | `server/src/vendor/shared/contracts/brief.ts` (+ ідентична копія в `client/…`): `Intent`, `Risk {kind, title, explanation, severity: high\|medium\|low, file_refs[]}`, `Risks`, `PrBrief {intent, blast, risks, history}`. Немає summary і review focus → додати `summary` і `review_focus[{ file, line, reason }]` в ОБИДВІ копії |
| Кеш | таблиця `pr_brief` (`pr_id`, `json`); SHA коміту зберігати всередині JSON |
| Виклик моделі | `llm.completeStructured({ model, schema, schemaName, messages })` — сам валідує Zod і перепитує при невалідному JSON; так працює рев'ю в `server/src/modules/reviews/` |
| Модель | Settings → Risk Brief (`risk_brief`); на сервері `resolveFeatureModel(container, workspaceId, 'risk_brief')` у `server/src/modules/settings/feature-models.ts` |
| i18n | `client/messages/en/brief.json`: `block.intent`, `block.blast`, `block.risks`, `noRisks`, `unavailable`, `unavailableHint` |
| UI | `VerdictBanner` (вердикт, підсумок, PR score) — є на Agent runs, можна перевикористати |

Чого немає: модуля `brief/`, роутів, кнопки Generate brief, блоків Risk areas і Review focus, переходу з Overview до файла на Files changed.

## Можлива реалізація

1. spec-creator → spec.md (переглянути goals, non-goals, EARS, provenance; бюджет входу моделі з одиницею) → implementation-planner → plan.md → cross-model review → закомітити spec.md і plan.md **до коду**.
2. Через run-plan — модуль `brief/`: `GET /pulls/:id/brief` (з кешу), `POST /pulls/:id/brief` (генерація). Вхід: intent, blast summary, diff stats, опис PR, пов'язаний issue, прикріплені спеки; тіла diff hunks не передавати.
3. Один `completeStructured` зі схемою `{ summary, risks[], review_focus[] }`, модель з `risk_brief`.
4. Постфільтр: відкинути ризики й пункти review focus, чиїх файлів немає ні в PR, ні в карті blast radius — модель не вигадує шляхи.
5. Кеш у `pr_brief` разом із SHA коміту; той самий стан PR → кеш без виклику моделі.
6. Overview: Generate brief, підсумок, Blast radius, Risk areas, Review focus; клік на пункт → `?tab=diff` + потрібний файл.
7. Перед merge — plan-verifier.

## Тестовий PR

Бажано той, де працює Blast Radius; добре, якщо зачіпає ризиковане — конфіг, нову залежність, спільний хелпер, міграцію.

## UI (за скріншотами прототипу)

- Overview → секція «PR BRIEF»: зверху банер (вердикт, підсумок, PR score) + іконка оновлення.
- Дві колонки: ліворуч Intent і під ним RISK AREAS (іконка кольору severity, назва, `файл:рядки`, шеврон розгортання); праворуч Blast radius.
- Внизу «REVIEW FOCUS — READ THESE FIRST N»: `src/config.ts:12 — live Stripe key committed in plaintext` тощо, у порядку читання.
- Обов'язкове — лише текст підсумку; банер з вердиктом і score — P3; розгортання ризику — P3. Простий список теж зараховується.

## Критерії

| Рівень | № | Критерій |
| --- | --- | --- |
| P1 | 1 | На Overview є блок PR Brief; поки брифу немає — кнопка Generate brief |
| P1 | 2 | Після генерації — підсумок (що робить PR і навіщо), Risk areas, Review focus; Intent і Blast radius поруч, якщо є у форку, інакше бриф прямо пише, яких даних бракує |
| P1 | 3 | Кожен ризик — назва + файл; кожен пункт Review focus — `файл:рядок` + причина |
| P1 | 4 | Усі файли в Risk areas і Review focus є в цьому PR або в карті Blast radius — вигаданих шляхів немає |
| P1 | 5 | Клік на пункт Review focus відкриває Files changed на цьому файлі |
| P1 | 6 | Після перезавантаження бриф одразу на місці без генерації; кнопка оновлення генерує заново |
| P1 | 7 | У PR є spec.md і plan.md, створені spec-creator і implementation-planner |
| P1 | 8 | Відкритий PR з описом реалізації + демо-відео |
| P2 | 1 | spec.md і plan.md закомічені раніше за код фічі |
| P2 | 2 | В описі PR — нотатка cross-model review: яка модель рев'юїла план і що знайшла |
| P2 | 3 | Фінальний звіт plan-verifier доданий до PR, без незакритих вимог |
| P2 | 4 | Генерація — рівно один виклик моделі, видно в trace/логах |
| P2 | 5 | Вхід виклику ≤ бюджету зі спеки; тіла diff hunks у модель не потрапляють |
| P2 | 6 | Відповідь проходить валідацію контрактом; summary і review_focus в обох копіях brief.ts |
| P2 | 7 | Модель з налаштування `risk_brief`, не зашита в код |
| P2 | 8 | Кеш прив'язаний до SHA: після нового коміту бриф позначено застарілим або згенеровано заново |
| P2 | 9 | Клік на пункт Review focus прокручує diff саме до потрібного рядка |
| P3 | 1 | Банер з вердиктом і PR score з останнього рев'ю (VerdictBanner) |
| P3 | 2 | Ризик розгортається й показує explanation |
| P3 | 3 | Клік на ризик теж веде до файла на Files changed |
| P3 | 4 | Файла немає в diff цього PR → коротке «File not in this PR's diff» |
| P3 | 5 | Під час генерації — skeleton замість порожнечі |
| P3 | 6 | Підписи блоків з `client/messages/en/brief.json`, не зашиті |
| P3 | 7 | До PR додано результат workflow-retro і cost report |

## Сценарій відео

1. Тестовий PR → Overview → кнопка Generate brief → натиснути.
2. Готовий бриф: підсумок, Risk areas, Review focus (+ Blast radius; про відсутній intent бриф пише прямо).
3. Клік на пункт Review focus → Files changed на цьому файлі.
4. Перезавантажити → бриф на місці без генерації.
5. Коротко показати в PR spec.md, plan.md і звіт plan-verifier.
6. Одним реченням: чому модель отримує готові факти, а не код diff.
