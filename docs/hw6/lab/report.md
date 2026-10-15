# Лаба L06 — евали harness: звіт

Пакет — `evals/` (з upstream `l06-evals`, див. `evals/README.md`). Усі прогони — локально, бекенд
за замовчуванням: підписка Claude Code через Agent SDK. Модель задачі — `claude-haiku-4-5`,
суддя — `claude-sonnet-5`. Серія — 3 прогони (`eval:repeat … -n 3`), workflow — 2; з n = 3 одна
зміна в одному прогоні — це ±33 п. п., тому все, що рухається на один прогін, читаємо як шум.

Експеримент 1 (Skill Creator на скілі `zod`) — окремий звіт [exp1-skill-creator.md](exp1-skill-creator.md); CI (експеримент 5) — наприкінці.

**Спільний висновок експериментів 2 і 3.** Однорядкова правка поведінку не змінила, бо правило
повторене в кількох місцях: евал показав дубль, який можна прибрати без втрат. Повне прибирання
правила дало дельту саме на пов'язаній практиці, а контрольні практики не зрушили: скіл — P2.1
100% → 33%, агент — «доказ називає правило» 100% → 0%. Кейси, практики й суддя між A і B не
змінювались, тож бази onion-v1 і arch-a чинні.

**Що довелося виправити в пакеті до прогонів** (коміт `1b9ae84`):
- `run-claude.ts`: список інструментів тепер передається в опцію SDK `tools`. Опція `allowedTools`
  лише автоматично схвалює інструменти, тож сесії з `bypassPermissions`, задумані як read-only
  або «без інструментів», мали Bash/Write/Edit над живим репо.
- `repeat.ts`: ліміт прогонів 2 → 3, бо `-n 3` мовчки обрізався до 2.
- У records додано токени судді та кешовані токени. Без них вартість кейсу з суддею занижена в
  рази: SDK не включає кешовані токени в `input_tokens`.
- `proxy/docker-compose.yml` (коміт `7553999`): LiteLLM-проксі тепер слухає лише `127.0.0.1:4000`.
  Він працює без `master_key` і витрачає `OPENROUTER_API_KEY`, тож прив'язка до `0.0.0.0` давала
  ключ будь-кому в локальній мережі.

---

## Експеримент 2 — власний евал скіла `onion-architecture`

`evals/skills/onion-architecture/`: `onion-architecture.eval.ts`, `onion-architecture.cases.ts`,
`fixtures/`. SKILL.md подається моделі як системний промпт, інструментів у сесії нема. Спершу
працює `patternMatch` (конкретні факти — файл, виклик, імпорт); суддя оцінює лише те, що
підрядком не перевірити, і ставить PASS тільки з дослівною цитатою.

### Кейси

| Кейс | Фікстура (реальний diff з server) | Запит розробника, суть | patternMatch |
|---|---|---|---|
| К1 route → DB | `agents-route-name.diff` — дослівно diff `server/src/modules/agents/routes.ts` з PR #19 (`test/hw5-violates-invariant`, `16e0813`): `drizzle-orm`, `db/schema` і `app.container.db.select(…)` прямо в роуті | «Додав GET /agents/:id/name для хлібних крихт… чи нормально так по структурі?» | `routes.ts`, `container.db`, `drizzle-orm` |
| К2 service → адаптер | `repos-service-git-client.diff` — на основі реального `repos/service.ts`: `runCloneJob` робить `new SimpleGitClient(this.container.config.cloneDir)` замість `this.container.git` | «Створюю git-клієнт прямо в сервісі, щоб клон ішов у cloneDir… чи це ок?» | `SimpleGitClient`, `container.git` |
| К3 чистий рефакторинг (негативний) | `repos-service-refactor.diff` — той самий файл, винесено приватні `authenticatedUrl()` і `enqueueClone()`, шари не змінюються | «Виніс побудову clone URL і постановку джоби в приватні методи… чи нічого не порушив по шарах?» | `authenticatedUrl` |

Обидва змінені варіанти `repos/service.ts` проходять `tsc --noEmit` у server. У фікстурах нема
коментарів про те, що саме порушено.

### Курація практик — `eval:benchmark -n 3` (зі скілом / без скіла)

Без скіла: у 2 з 3 прогонів К1 модель відповіла «Структура нормальна, можна мерджити», тобто
прийняла порушення з PR #19. Patternmatch-гейт відсік ці прогони ще до судді. Щоб усе ж
побачити практики К1 без скіла і перевірити переписані практики, збережені відповіді
benchmark оцінено суддею повторно (15 викликів судді, без нових сесій задачі).

| Практика | Зі скілом | Без скіла | Рішення |
|---|---|---|---|
| К3: «explicitly concludes that the diff introduces no layer-boundary violation» | 3/3 | 3/3 | **прибрано** — проходить і без скіла (`non_discriminating`); замінено на P3.2 |
| К3: «extracted private methods belong in the service layer…» | 2/3 | 1/3 | **прибрано** — слабкий приріст; цитата судді та сама, що для висновку «порушень нема», тобто це перефраз |
| К2: «building the client bypasses the test seam — `buildApp({ overrides })` / `mocks.ts`» | 1/3 | 0/3 | **прибрано** — запит не питає про тести, тож навіть зі скілом лише 1/3 і падіння на серії не побачити; замінено на P2.3 |
| К3: «service still depends on the Container…» (кандидат на заміну) | 3/3 | 2/3 | **не взято** — проходить без скіла |
| P2.3 «fix: `this.container.git`, cloneDir — у `container.ts` / `AppConfig`» (заміна) | 3/3 | 1/3 | взято |
| P3.2 «no-violation verdict justified with a named onion rule» (заміна) | 2/3 | 0/3 | взято |
| P1.1–P1.3 (К1) | 2/3 · 3/3 · 3/3 | 0/3 · 0/3 · 1/3 (повторна оцінка без гейта) | лишено |
| P2.1, P2.2 (К2), P3.1 (К3) | 3/3 | 0/3 | лишено |

Benchmark загалом: кейси пройдені 100% зі скілом проти 11% без нього (+89 п. п.); вихідних
токенів стільки ж (1 207 проти 1 220).

Практики після курації:

- **К1:** P1.1 select переїжджає в `AgentsRepository` і викликається через `AgentsService`;
  P1.2 лише repository торкається Drizzle (`container.db`, drizzle-orm, schema imports не в роуті);
  P1.3 запит лишається workspace-scoped.
- **К2:** P2.1 адаптери створюються лише в `src/platform/container.ts`; P2.2 без імпорту конкретного
  класу, інтерфейс `GitClient` з Container; P2.3 фікс.
- **К3:** P3.1 `this.container.secrets` у сервісі — дозволений шлях (SecretsProvider); P3.2 вердикт
  «порушень нема» обґрунтовано названим правилом onion, а не DRY чи назвами.

У К3 лишилось 2 практики, а не 3–5. Курація важливіша за число: інші кандидати проходили і без
скіла.

### Серії: v1 → v2 (один рядок) → v2c (правило повністю) → v3 (повернуто)

**Яке правило прибрано і чому не правило 2.** У v1 практика правила 2 (P1.2) — лише 67%,
тож падіння з n = 3 не відрізнити від шуму. Практика правила 4 (P2.1) у v1 — 3/3, а дві
сусідні практики того ж кейсу служать контролем. Тому v2 — без правила 4:

```diff
-  src/platform/container.ts        composition root — the ONLY place adapters are constructed
+  src/platform/container.ts        composition root
-4. **Adapters are constructed only in `src/platform/container.ts`.** New outside dependency = an
-   interface + an adapter folder + a lazy getter on `Container` + an entry in `ContainerOverrides`.
```

У v2 P2.1 лишилась 3/3, тож проведено ще одну серію, v2b: додатково прибрано рядок
`src/platform/container.ts` зі схеми шарів. Після v2b SKILL.md повернуто з git (`git checkout`), і
v3 прогнано на незміненому скілі. Зміна SKILL.md не закомічена.

**v2c — правило 4 прибрано повністю:** тіло, рядок у схемі шарів і згадка `platform/container.ts`
у frontmatter `description` (`skillContent()` подає моделі й frontmatter). Прогнано лише К2
(`-t`), `-n 3`; після серії SKILL.md повернуто з git.

```diff
-description: "… a routes.ts, service.ts, repository.ts, a new module, platform/container.ts, an adapter in src/adapters/** …"
+description: "… a routes.ts, service.ts, repository.ts, a new module, an adapter in src/adapters/** …"
-  src/platform/container.ts        composition root — the ONLY place adapters are constructed
-4. **Adapters are constructed only in `src/platform/container.ts`.** New outside dependency = an
-   interface + an adapter folder + a lazy getter on `Container` + an entry in `ContainerOverrides`.
```

| Кейс / практика | onion-v1 | onion-v2 | onion-v2b | onion-v3 |
|---|---|---|---|---|
| **К1 route → DB (PR #19)** — кейс | **67% (2/3)** | **33% (1/3)** | **100% (3/3)** | **100% (3/3)** |
| · P1.1 select → AgentsRepository через AgentsService | 67% (2/3) | 100% (1/1) | 100% (3/3) | 100% (3/3) |
| · P1.2 лише repository торкається Drizzle | 67% (2/3) | 100% (1/1) | 100% (3/3) | 100% (3/3) |
| · P1.3 запит лишається workspace-scoped | 100% (3/3) | 100% (1/1) | 100% (3/3) | 100% (3/3) |
| · вихідні токени, середнє ± σ | 1528 ± 271 | 1306 ± 186 | 1685 ± 249 | 1445 ± 180 |
| · час сесії, с, середнє ± σ | 14 ± 2 | 12 ± 1 | 16 ± 2 | 13 ± 2 |
| **К2 service → new SimpleGitClient** — кейс | **100% (3/3)** | **100% (3/3)** | **100% (3/3)** | **100% (3/3)** |
| · **P2.1 адаптери лише в `platform/container.ts`** ← прибране правило | **100% (3/3)** | **100% (3/3)** | **67% (2/3)** | **100% (3/3)** |
| · P2.2 без конкретного класу, інтерфейс `GitClient` з Container | 100% (3/3) | 100% (3/3) | 100% (3/3) | 100% (3/3) |
| · P2.3 фікс: `this.container.git`, cloneDir — у container/AppConfig | 100% (3/3) | 67% (2/3) | 100% (3/3) | 100% (3/3) |
| · вихідні токени, середнє ± σ | 1336 ± 85 | 1662 ± 176 | 1356 ± 97 | 1122 ± 108 |
| · час сесії, с, середнє ± σ | 15 ± 1 | 18 ± 2 | 14 ± 1 | 13 ± 1 |
| **К3 чистий рефакторинг (негативний)** — кейс | **67% (2/3)** | **33% (1/3)** | **33% (1/3)** | **100% (3/3)** |
| · P3.1 `this.container.secrets` — дозволений шлях | 67% (2/3) | 67% (2/3) | 100% (3/3) | 100% (3/3) |
| · P3.2 «порушень нема» обґрунтовано названим правилом | 100% (3/3) | 67% (2/3) | 33% (1/3) | 100% (3/3) |
| · вихідні токени, середнє ± σ | 1343 ± 153 | 1501 ± 237 | 1202 ± 161 | 1298 ± 162 |
| · час сесії, с, середнє ± σ | 15 ± 2 | 16 ± 3 | 14 ± 2 | 14 ± 2 |

`x/1` — суддю викликали лише в одному прогоні: у двох інших не пройшов patternMatch (у тексті
нема `drizzle-orm` або `container.db`). Кожна сесія — 1 хід, ~2 960 вхідних токенів.

К2 по всіх серіях, разом із v2c (`eval:delta onion-v1 onion-v2c`):

| Кейс / практика | onion-v1 | onion-v2 | onion-v2b | onion-v2c | onion-v3 |
|---|---|---|---|---|---|
| **К2 service → new SimpleGitClient** — кейс | **100% (3/3)** | **100% (3/3)** | **100% (3/3)** | **100% (3/3)** | **100% (3/3)** |
| · **P2.1 адаптери лише в `platform/container.ts`** ← прибране правило | 100% (3/3) | 100% (3/3) | 67% (2/3) | 33% (1/3) | 100% (3/3) |
| · P2.2 без конкретного класу, інтерфейс `GitClient` з Container | 100% (3/3) | 100% (3/3) | 100% (3/3) | 100% (3/3) | 100% (3/3) |
| · P2.3 фікс: `this.container.git`, cloneDir — у container/AppConfig | 100% (3/3) | 67% (2/3) | 100% (3/3) | 100% (3/3) | 100% (3/3) |
| · вихідні токени, середнє ± σ | 1336 ± 85 | 1662 ± 176 | 1356 ± 97 | 1254 ± 239 | 1122 ± 108 |
| · час сесії, с, середнє ± σ | 15 ± 1 | 18 ± 2 | 14 ± 1 | 14 ± 3 | 13 ± 1 |

**Що показали серії.**
- **Один рядок — без ефекту.** v2: P2.1 100 → 100; v2b (ще й рядок схеми): 100 → 67, тобто один
  прогін, на рівні шуму.
- **Причина — дубль.** `skillContent()` подає моделі SKILL.md разом із frontmatter, а
  `description` прямо називає `platform/container.ts`. У v2b 2/3 відповідей усе ще називають
  `container.ts`, без скіла — 0/3. Тобто знання жило в трьох місцях.
- **Повне прибирання — дельта на пов'язаній практиці.** v2c: P2.1 100% → 33% (−67), а контрольні
  P2.2 і P2.3 — 100%. Дві з трьох відповідей v2c ще згадують `container.ts`, але лише одна каже,
  що це єдине місце для залежностей: «Composition root — контейнер — єдине місце, де вирішуються
  залежності». Це загальне DI-знання моделі; суддя зарахував його за PASS.
- **Суддя частково м'який.** У v2b він зарахував «Адаптер інстанціюється з конфігом один раз при
  bootstrap», хоча шляху там нема.
- **Відновлення пройшло.** v3 ≥ v1 за кожною практикою (усе 100%); провали v1 — це один прогін,
  де модель перенесла `container.db` з роуту в сервіс замість repository. Суддя поставив FAIL
  правильно.

### Витрати (експеримент 2)

| Фаза | Сесії задачі | Виклики судді | Вхід (з кешем) / вихід, задача | Вхід / вихід, суддя | Стіна |
|---|---|---|---|---|---|
| smoke | 1 | 1 | 2 782 / 1 431 | 2 / 325 | 23 с |
| benchmark (×2 конфігурації) | 18 | 15 | 36 375 / 21 844 | 20 088 / 9 063 | 392 с |
| повторна оцінка збережених відповідей | — | 15 | не записано | не записано | ~100 с |
| v1, v2, v2b, v3 | 36 | 34 | 106 860 / 50 352 | 48 743 / 15 948 | 820 с |
| v2c (лише К2) | 3 | 3 | 8 112 / 3 762 | 4 182 / 961 | 68 с |
| **Разом** | **58** | **68** | **154 129 / 77 389** | **≈ 73 тис. / ≈ 26 тис.** + повторна оцінка | **≈ 23 хв** |

У сумі ≈ 227 тис. вхідних і ≈ 104 тис. вихідних токенів (без повторної оцінки). Час моделі:
816 с задача + 299 с суддя.

**Висновок:** однорядкова правка скіла поведінку не змінила, бо правило 4 повторене у frontmatter
і схемі шарів (евал показав дубль, який можна прибрати без втрат); повне прибирання дало −67 п. п.
саме на пов'язаній практиці P2.1 при незмінних контрольних, а v3 ≈ v1 підтвердив відновлення.

---

## Експеримент 3 — `architecture-reviewer`, A/B серіями

`evals/agents/architecture-reviewer/` переписано під нашого агента
(`.claude/agents/architecture-reviewer.md`). Формат знахідки —
`file:line | CRITICAL / WARNING / SUGGESTION | що | доказ`, далі рядок `Verdict: BLOCK|PASS`; доказ
має називати порушене правило (скіл або розділ AGENTS.md). Агент працює з інструментами зі свого
frontmatter (`Read, Grep, Glob`) з кореня репо, ліміт — до 25 ходів.

**Фікстури upstream замінено всі.** Жоден їхній шлях у нас не існує: `server/src/modules/checkout/**`
(і шару `domain/` у модулях нема), `server/src/modules/blast/score.ts`,
`reviewer-core/src/pipeline/run.ts`. Агент читає файли з диска, тому на неіснуючих шляхах він би
вимірював галюцинацію, а не рев'ю.

| Кейс | Фікстура | patternMatch | Практики (суддя) |
|---|---|---|---|
| А1 route → DB | diff PR #19 (той самий, що в К1) | `routes.ts`, `Verdict`, `BLOCK` | формат рядка з `routes.ts:line`; CRITICAL; **доказ називає правило** |
| А2 контракт в одній копії | `shared-finding-category.diff` — `'architecture'` додано до `FindingCategory` лише в `server/src/vendor/shared/contracts/findings.ts` (перевірка №5 агента, Cross-package gotchas в AGENTS.md) | `client/src/vendor/shared`, `Verdict`, `BLOCK` | формат рядка; CRITICAL — бракує зміни в client-копії; **доказ називає правило** |
| А3 чистий рефакторинг (негативний) | `repos-service-refactor.diff` (той самий, що в К3) | `service.ts`, `Verdict`, `PASS` | жодного CRITICAL / WARNING; називає перевірені файли |

У запиті сказано, що diff на диску не застосований: агент читає поточні файли як контекст і
оцінює diff.

**Перша серія (arch-a0) — помилка кейсу, не агента.** Спершу вердикт перевірявся підрядком
`Verdict: BLOCK`, а агент пише `Verdict: **BLOCK**` або `**Verdict: PASS**`. Через це 4 з 9
прогонів не дійшли до судді. Вердикт тепер перевіряється двома підрядками, `container.db`
прибрано (агент цитує `.select()` або імпорти — теж доказ), arch-a прогнано заново.

**Дві версії B** (після кожної агента повернуто з git; зміни не закомічені).

B — один рядок:

```diff
-Evidence is the concrete proof: the offending import or line quoted, and the rule it breaks
-(skill or AGENTS.md section). A finding without a `file:line` you have actually opened and
-without quoted evidence is not reported.
+Evidence is the concrete proof: the offending import or line quoted. A finding without a
+`file:line` you have actually opened and without quoted evidence is not reported.
```

B2 — прибрано все, що змушує назвати правило: та сама фраза, плюс розділ «What to read first» і
речення «These documents are the standard. Judge against what they say, not against general taste.»

```diff
-## What to read first
-
-- `.claude/skills/onion-architecture/SKILL.md` — for anything under `server/src`.
-- `.claude/skills/frontend-architecture/SKILL.md` — for anything under `client/`.
-- `<pkg>/AGENTS.md` of each touched package, and the naming table in root `CLAUDE.md`.
-
-These documents are the standard. Judge against what they say, not against general taste.
```

| Кейс / практика | arch-a | arch-b | arch-b2 |
|---|---|---|---|
| **А3 чистий рефакторинг (негативний)** — кейс | **33% (1/3)** | **33% (1/3)** | **67% (2/3)** |
| · жодного CRITICAL / WARNING | 100% (3/3) | 100% (2/2) | 67% (2/3) |
| · називає перевірені файли (повний шлях service.ts) | 33% (1/3) | 50% (1/2) | 100% (3/3) |
| · вихідні токени, середнє ± σ | 2202 ± 300 | 2005 ± 286 | 2592 ± 1324 |
| · час сесії, с, середнє ± σ | 30 ± 2 | 28 ± 7 | 31 ± 14 |
| · ходи, середнє ± σ | 10 ± 1 | 9 ± 3 | 5 ± 3 |
| **А2 контракт лише в server-копії vendor/shared** — кейс | **33% (1/3)** | **100% (3/3)** | **100% (3/3)** |
| · формат `file:line \| SEVERITY \| what \| evidence` | 33% (1/3) | 100% (3/3) | 100% (3/3) |
| · CRITICAL: бракує зміни в client-копії | 100% (3/3) | 100% (3/3) | 100% (3/3) |
| · **доказ називає правило** ← A/B | 33% (1/3) | 0% (0/3) | 0% (0/3) |
| · вихідні токени, середнє ± σ | 677 ± 125 | 709 ± 98 | 773 ± 82 |
| · час сесії, с, середнє ± σ | 9 ± 2 | 10 ± 1 | 11 ± 2 |
| · ходи, середнє ± σ | 4 ± 1 | 3 ± 0 | 3 ± 1 |
| **А1 route → DB (PR #19)** — кейс | **100% (3/3)** | **100% (3/3)** | **100% (3/3)** |
| · формат `file:line \| SEVERITY \| what \| evidence` | 100% (3/3) | 100% (3/3) | 100% (3/3) |
| · CRITICAL за доступ до БД | 100% (3/3) | 100% (3/3) | 100% (3/3) |
| · **доказ називає правило** ← A/B | 100% (3/3) | 100% (3/3) | 0% (0/3) |
| · вихідні токени, середнє ± σ | 1736 ± 548 | 1758 ± 238 | 1775 ± 400 |
| · час сесії, с, середнє ± σ | 25 ± 5 | 31 ± 8 | 26 ± 8 |
| · ходи, середнє ± σ | 10 ± 3 | 9 ± 2 | 8 ± 5 |

### Що в трейсах

| Кейс | B (один рядок) | B2 (правило прибрано повністю) |
|---|---|---|
| А1 | Дельти нема: 3/3 → 3/3. В обох версіях агент читає `.claude/skills/onion-architecture/SKILL.md` — так велить «What to read first» — і пише «violating rule 2 from onion-architecture/SKILL.md: "A route never touches the DB…"». Правило повторене: його називає сам прочитаний скіл. | **Дельта −100: 3/3 → 0/3**, контрольні формат і CRITICAL — 3/3. За 9 прогонів B2 агент жодного разу не відкрив SKILL.md чи AGENTS.md; доказ — опис без правила: «AgentsService wraps all DB access; routes must use service». |
| А2 | 1/3 → 0/3, один прогін. Агент і в A, і в B читає лише дві копії `findings.ts`; в A правило один раз названо з тексту власної перевірки №5, ще раз — приписано вигаданому `MEMORY.md` (FAIL). | 0/3. Правило не названо: «порушення правила синхронізації `vendor/shared/` контрактів» — без джерела. |
| А3 | Відомий недолік кейсу: практика «називає перевірені файли» вимагає повного шляху `server/src/modules/repos/service.ts`, а агент пише «`service.ts`», і суддя застосовує текст буквально. Кейс і практику, як домовлено, не змінюємо — бази лишаються порівнянними. | Без скіла агент частіше шумить: «жодного CRITICAL / WARNING» 3/3 → 2/3. Ходів менше (10 → 5), бо нема що читати. |

Окремо з трейсів: в A/B агент іноді шукає скіл за абсолютними шляхами-здогадами
(`/home/oles/.claude/skills/…`), і це додає 2–6 зайвих ходів.

### Витрати (експеримент 3)

| Фаза | Сесії / ходи | Виклики судді | Вхід задачі: свіжі / кеш-читання / кеш-запис | Вихід задачі | Суддя: вхід / вихід | Стіна |
|---|---|---|---|---|---|---|
| smoke + arch-a0 + arch-a + arch-b | 28 / 212 | 23 | 904 / 13 561 364 / 421 549 | 41 904 | 34 898 / 11 386 | ≈ 14 хв (835 с) |
| arch-b2 | 9 / 47 | 9 | 12 481 / 3 599 092 / 77 697 | 15 422 | 11 784 / 5 825 | ≈ 5 хв (292 с) |
| дві проби SDK (ізоляція, облік токенів) | 2 / 4 | — | не записано | — | — | ≈ 1 хв |

Тут 97% «токенів» — кеш-читання. Проба показала, що один запит звітує 137 430 кеш-токенів при
видимому контексті ≈ 8 тис., а кожна сесія ще робить прихований службовий виклик haiku
(~800 токенів). Тому кеш-читання — верхня межа, а не реальна вага контексту (відкрите питання в
`INSIGHTS.md`). Порівнянні між версіями величини — вихідні токени, ходи й час, вони в таблиці
вище. Ізоляцію підтверджено: у сесії лише `Glob, Grep, Read`, MCP-серверів і плагінів нема.

**Висновок:** однорядкова правка агента поведінку не змінила, бо вимогу назвати правило повторено
в «What to read first» і «Judge against what they say» (евал показав дубль, який можна прибрати без
втрат); повне прибирання дало −100 п. п. саме на «доказ називає правило» в А1 при незмінних
контрольних практиках.

---

## Експеримент 4 — workflow під наш AGENTS.md

`evals/workflow/review-workflow.cases.ts` переписано: 6 сесій на прогін. Сесія вантажить справжній
harness: `settingSources: ["project"]` → `CLAUDE.md` (посилання на `AGENTS.md`), `.claude/skills`,
`.claude/agents`. Інструменти — `Read, Grep, Glob, Task/Agent, Skill`. Запити написані так, як
написав би розробник: без назв файлів, скілів і агентів, які перевіряє кейс. Оцінюються лише
фактичні виклики інструментів і прочитані файли; судді нема.

Запуск — в окремому worktree, бо сесії йдуть з `bypassPermissions` над робочою копією:
`git worktree add ../dev-digest-evals HEAD` (`ed2e767`) → `cd evals && pnpm install` →
`pnpm eval:repeat workflow -n 2 --label wf-1` → `git worktree remove`.

| Кейс | Що перевіряє | Прогін 1 | Прогін 2 | Що реально викликано і прочитано |
|---|---|---|---|---|
| dispatch — «оціни план роуту GET /repos/:id/branches на відповідність шарам» | рев'ю плану йде до `architecture-reviewer` | ✗ | ✗ | Обидва прогони: `Skill(onion-architecture)`, 3 ходи, субагента нема. План оцінила основна сесія: «✅ План витримує архітектуру onion на шарах». |
| dispatch, агента названо в запиті (додатковий прогін) | те саме, з «нехай це зробить architecture-reviewer» | ✓ (1/1) | — | `Agent` → `architecture-reviewer`, 2 ходи, зупинка одразу після запуску. |
| contrast, репо — «хочу змінити системний промпт рев'ю-агента, з чого почати?» | AGENTS.md: «Writing or changing a reviewer agent prompt → `docs/agent-prompts/README.md`» | ✓ | ✗ | 1: `Read docs/agent-prompts/README.md`, 2 ходи. 2: 1 хід, жодного виклику інструмента. |
| contrast, порожня тека без конфігу | файл не має бути прочитано | ✓ | ✓ | 1: 1 хід, нічого. 2: `Glob`, 4 ходи, нічого не знайдено («Схоже, що я не можу знайти файли»). |
| trace — «хочу, щоб GET /repos віддавав ще й дату додавання; що змінити в server?» | AGENTS.md: «read `<pkg>/AGENTS.md` before working in a package» → `server/AGENTS.md` | ✗ | ✗ | Обидва: `Grep/Glob/Read` одразу по коду — `repos/routes.ts`, `db/schema/repos.ts`, `repos/service.ts`, `repos/helpers.ts`, `vendor/shared/contracts/platform.ts`; `server/AGENTS.md` не відкрито. 10 і 9 ходів, у другому — ліміт ходів. |
| activation + — щойно підтверджена причина `ERR_PNPM_IGNORED_BUILDS` | `engineering-insights` активується | ✓ | ✓ | 1: `Skill(engineering-insights)` + `Read INSIGHTS.md`, 6 ходів. 2: `Skill(engineering-insights)`, 3 ходи. |
| activation − — «поясни, що таке allowBuilds і чому install падає» | скіл не активується | ✓ | ✓ | 1: `Grep/Glob/Read` — `client/.npmrc`, `server/.npmrc`, `INSIGHTS.md`; Skill не викликано, 7 ходів. 2: `Read INSIGHTS.md`, `evals/pnpm-workspace.yaml`, 4 ходи. |

Contrast пройдено, коли в репо файл прочитано, а в порожній теці — ні: прогін 1 — так, прогін 2 —
ні. Разом по п'яти кейсах: прогін 1 — 3/5, прогін 2 — 2/5.

**Що впало і чому (з трейсів).**
- **dispatch, 0/2 — наш harness.** Опис `architecture-reviewer` каже «Use after the implementer
  finishes», тобто для рев'ю зміни, а не плану; AGENTS.md рев'ю плану на агента не маршрутизує.
  Першим спрацьовує `onion-architecture` («ALWAYS invoke when touching anything under
  server/src»), і основна сесія відповідає сама. З назвою агента в запиті — 1/1, тож сама
  механіка dispatch працює.
- **contrast, прогін 2 — модель.** Той самий AGENTS.md у прогоні 1 привів до файла, а в
  прогоні 2 відповідь дано за 1 хід без інструментів. Текст цієї відповіді втрачено через ваду
  рушія (п. 2 нижче), тож не відомо, чи назвала вона файл.
- **trace, 0/2 — наш AGENTS.md і модель.** Правило «read `<pkg>/AGENTS.md`» стоїть лише в заголовку
  таблиці Packages. Задачу сформульовано як питання, і модель іде одразу в код.

**Вади рушія upstream, знайдені тут** (не виправлені, у межах цього кроку — лише фіксація):
1. **`outcome` для workflow-кейсів = «сесія не впала».** `record()` пише `outcome = !isError`, а не
   результат перевірки, тож `eval:repeat` показав «run 1/2 ✓ 6/6 cases», хоча фактично 3/5. Таблицю
   вище пораховано з трейсів (`subagents`, `skills`, `reads` у `results/records.jsonl`).
2. **`slugify()` обрізає мітку до 80 символів.** У довгої назви contrast-кейсу губиться суфікс
   `[treatment]`/`[control]`, і текст control перезаписує текст treatment у `results/outputs/`.
   Самі трейси в records правильні.
3. **Безпека: `tools` не обмежує MCP-інструменти.** У головному репо workflow-сесія отримує
   проєктний MCP `devdigest` (`.mcp.json`), а з ним `run_agent_on_pr`, який через API на :3001
   (він був запущений) стартує платне рев'ю. У worktree MCP не стартував, бо там нема
   `devdigest-mcp/node_modules`, тож цей прогін безпечний. Для головного репо й CI потрібен
   `strictMcpConfig: true` (ігнорує `.mcp.json`) або `disallowedTools: ["mcp__*"]` у `workflowTask`.

### Витрати (експеримент 4)

| Фаза | Сесії / ходи | Вхід: свіжі / кеш-читання / кеш-запис | Вихід | Час моделі | Стіна |
|---|---|---|---|---|---|
| wf-1 (2 прогони × 6 сесій) | 12 / 53 | 5 913 / 3 537 045 / 282 561 | 17 534 | 224 с | 244 с |
| dispatch з назвою агента | 1 / 2 | не записано (ранній стоп до result-повідомлення) | 2 | 27 с | 29 с |
| проба init-повідомлення (інструменти, агенти, скіли) | 1 / 1 | не записано | — | — | ≈ 10 с |

Кеш-читання — верхня межа (див. експеримент 3).

**Висновок:** активація `engineering-insights` і негативний контроль працюють 2/2, маршрут
AGENTS.md до `docs/agent-prompts/README.md` спрацював 1/2 (у порожній теці — 0/2), а dispatch
(0/2; з назвою агента — 1/1) і читання `server/AGENTS.md` (0/2) не працюють через наш harness:
опис агента не покриває рев'ю плану, а правило про `<pkg>/AGENTS.md` сховане в заголовку таблиці.

---

## Експеримент 5 — CI: `.github/workflows/evals.yml`

| Job | Що робить | Гейт? |
|---|---|---|
| `changes` | `ci-detect.mjs` над `git diff base...head` (`fetch-depth: 0`); артефакт без евалів → рядок `SKIP <name> (no evals)`; перевіряє, чи доступний `OPENROUTER_API_KEY` | — |
| `quality` | `pnpm typecheck` + `pnpm eval:quality`, без секретів | **так** |
| `skills` | матриця по скілах з евалами, OpenRouter напряму, модель за замовчуванням `deepseek/deepseek-v4-flash` | ні (`continue-on-error`) |
| `agents` | матриця по агентах з евалами, через LiteLLM-проксі пакета, `anthropic/claude-haiku-4.5`, `max-parallel: 1` | ні |
| `workflow` | `eval:workflow` через проксі, `anthropic/claude-haiku-4.5` | ні |

- Моделі — inputs ручного запуску (`workflow_dispatch`); суддя — `deepseek/deepseek-v4-flash`.
- Один прогін на кейс.
- `permissions: contents: read`; `concurrency` з `cancel-in-progress`; `timeout-minutes` на кожному job.
- pnpm 12.10.1 — саме він читає `allowBuilds` з `evals/pnpm-workspace.yaml`; чисте `install --frozen-lockfile` перевірено локально під 10 і 12.
- Значення матриці (імена тек з PR) передаються в `run:` через `env`, не підставляються напряму; `pull_request_target` не використовується.
- Конфіг перевірено `actionlint`.

**Прогони по днях:**

| Дата | Прогін | Що сталося |
|---|---|---|
| 14.10 | PR, [38621288357](https://github.com/equalizer2k9/dev-digest/actions/runs/38621288357) | секрету ще нема → модельні jobs пропущено з рядком у лозі |
| 14.10 | PR, [38626992479](https://github.com/equalizer2k9/dev-digest/actions/runs/38626992479) | `skills` ✓; `agents` і `workflow` — LiteLLM не стартував без master key |
| 15.10 | PR — не створився; ручний — відхилено | після фіксу проксі GitHub не запускає Actions у цьому репо (нижче); доказ фіксу — локальний прогін з оточенням CI |
| 15.10 | ручний, [38735365850](https://github.com/equalizer2k9/dev-digest/actions/runs/38735365850) | Actions знову увімкнено → проксі стартував, усі модельні jobs дійшли до кейсів (нижче) |

**Тестовий PR** [#20](https://github.com/equalizer2k9/dev-digest/pull/20) (`test/hw6-evals-ci` → `feat/homework-6`,
не мерджити): нейтральні правки в `onion-architecture/SKILL.md`, `architecture-reviewer.md`,
`zod/SKILL.md`, `AGENTS.md`.

- Перший прогін [38621288357](https://github.com/equalizer2k9/dev-digest/actions/runs/38621288357)
  пройшов без секрету: модельні jobs пропущено з рядком `SKIP model evals … OPENROUTER_API_KEY is not
  available`. Так перевірено гілку «нема ключа / fork-PR».
- Після того як у форку з'явився Actions-секрет `OPENROUTER_API_KEY`, гілку оновлено merge-ем з
  `feat/homework-6` (без rebase і force-push), і запустився новий прогін
  [38626992479](https://github.com/equalizer2k9/dev-digest/actions/runs/38626992479). Старий прогін не
  перезапускали.

| Job | Результат | Тривалість | Деталі |
|---|---|---|---|
| `changes` | ✓ | 5 с | `skills → onion-architecture`, `agents → architecture-reviewer`, `workflow tier: run`, `SKIP zod (no evals)` |
| `quality` | ✓ (гейт) | 17 с | typecheck + `eval:quality`: 15 скілів, 0 FAIL |
| `skills (onion-architecture)` | ✓ | 101 с | 3/3 кейси, 8/8 практик PASS; задача й суддя — `deepseek/deepseek-v4-flash`, 1 хід на кейс |
| `agents (architecture-reviewer)` | ✗ (звіт, не гейт) | 157 с | впав на кроці `LiteLLM proxy up`; жоден кейс не запускався |
| `workflow` | ✗ (звіт, не гейт) | 160 с | впав на кроці `LiteLLM proxy up`; жоден кейс не запускався |

Підсумок прогону — **success**: модельні jobs мають `continue-on-error`, тож їхнє падіння не блокує PR.

**Чому впали `agents` і `workflow` (з логу, без правок під зелений).** Образ проксі
`ghcr.io/berriai/litellm:main-stable` у `evals/proxy/docker-compose.yml` (з upstream) має незакріплений
тег. Нова версія LiteLLM відмовляється стартувати без master key:

```
litellm.proxy.auth.master_key_boot_check.UnsafeMasterKeyError: LiteLLM proxy refused to start:
no master key is set, so every request would be accepted without authentication.
Neither general_settings.master_key nor the LITELLM_MASTER_KEY environment variable is set.
```

`evals/proxy/litellm.config.yaml` навмисно працює без `master_key` («No master_key on purpose»).
Тож це інфраструктура — тег образу плюс конфіг проксі, — а не кейси, модель чи наш AGENTS.md.
Варіанти виправлення (не застосовано):
- закріпити образ на версії до цієї перевірки;
- задати в CI випадковий `LITELLM_MASTER_KEY` на кожен job і передавати його клієнтам як bearer —
  це потребує окремої змінної в `evals/src/runtime/env.ts`, бо зараз bearer = `OPENROUTER_API_KEY`;
- `LITELLM_DANGEROUSLY_PERMIT_WEAK_OR_UNSET_MASTER_KEY=true` — LiteLLM радить його лише для
  локальної розробки.

**Вартість прогону** — з usage в артефакті `evals-skill-onion-architecture` (`records.jsonl`: задача
+ суддя) за публічними цінами OpenRouter (`/api/v1/models`):

| Job | Вхід / вихід, токени | Ціна за 1M (вхід / вихід) | Вартість |
|---|---|---|---|
| skills — задача, 3 виклики | 6 968 / 2 957 | $0,091 / $0,182 (`deepseek/deepseek-v4-flash`) | |
| skills — суддя, 3 виклики | 2 472 / 4 609 | те саме | |
| **skills разом** | **9 440 / 7 566** | | **≈ $0,0022** |
| agents, workflow | 0 — проксі не стартував, запитів до моделі не було | | $0 |

Активність самого CI-ключа на OpenRouter не перевіряли: ключ є лише в Actions-секретах, локально
його нема.

### 15.10 — фікс проксі; Actions вимкнено на боці GitHub; локальний прогін з оточенням CI

**Фікс проксі** (`dac7913`):
- образ закріплено: `ghcr.io/berriai/litellm:v1.105.1@sha256:b7b9e2c3…` — той самий digest, що на 15.10 у `main-stable`;
- проксі вимагає `LITELLM_MASTER_KEY`: випадковий на кожен job у CI (`openssl rand`, `::add-mask::`) і на кожен
  `proxy:up` локально;
- через проксі і SDK, і суддя автентифікуються master key; `OPENROUTER_API_KEY` має лише контейнер
  проксі, а в CI — лише крок `LiteLLM proxy up`.

**Actions вимкнено на боці GitHub (15.10.2026).**
- **PR-прогонів нема.** Після merge-оновлення гілки (`cffa6b8`), закриття/відкриття PR і порожнього
  коміту (`853794d`) жоден прогін не з'явився, і check-suite для цих комітів теж нема.
- **Push GitHub бачив.** Гілка (`git ls-remote`) і голова PR (`headRefOid`) — обидві `853794d`.
  Гіпотеза «PR лишився на старому коміті» не підтвердилась: не запустились саме Actions.
- **Ручний запуск відхилено.** `gh workflow run evals.yml --ref test/hw6-evals-ci` →
  `HTTP 422: Actions has been disabled for this repository`. Водночас
  `GET /repos/equalizer2k9/dev-digest/actions/permissions` віддає `{"enabled": true}`. Отже, Actions
  вимкнено на рівні платформи GitHub, а не налаштуванням репо.

**Локальний прогін з оточенням як у CI** — доказ фіксу проксі:
- окремий worktree на `372133e`;
- `pnpm install --frozen-lockfile`;
- `proxy:up` з master key;
- `EVAL_BACKEND=openrouter`, `OPENROUTER_BASE_URL` → проксі;
- модель задачі `anthropic/claude-haiku-4.5`, суддя `deepseek/deepseek-v4-flash`;
- `OPENROUTER_API_KEY` у процесі евалів не задано;
- по 1 прогону `agents/architecture-reviewer` і `eval:workflow`, далі `proxy:down`.

| Job | Результат | Тривалість | Кейси |
|---|---|---|---|
| agents (architecture-reviewer) | 2/3 | 203 с | А1 route → DB ✓ (3/3 практик, 18 ходів); А2 vendor/shared ✓ (2/3 — рядок не в форматі `file:line \| …`, поріг 0,6 пройдено); А3 чистий рефакторинг ✗ (1/2 — «називає перевірені файли» з повним шляхом, відомий недолік кейсу) |
| workflow | 3/5 | 253 с | contrast ✓ (у репо прочитано `docs/agent-prompts/README.md`, у порожній теці — ні); activation + ✓ (`Skill(engineering-insights)`); activation − ✓; dispatch ✗ — запущено `researcher` і `Explore`, не `architecture-reviewer`; trace ✗ — `server/AGENTS.md` не прочитано, модель одразу пішла в код |

Падіння ті самі, що й у wf-1 на підписці (експеримент 4), тож причина в harness, а не в проксі:
- опис агента не покриває рев'ю плану;
- правило про `<pkg>/AGENTS.md` сховане в заголовку таблиці.

Проксі з master key обслужив усі сесії, обидва типи викликів (Anthropic `/v1/messages` від SDK,
OpenAI `/chat/completions` від судді).

**Вартість** — з активності локального ключа OpenRouter (`GET /api/v1/key`, поле `usage`):
до прогону $0,1642, після — $0,6244. Тобто **≈ $0,46** за agents + workflow: 3 + 6 сесій haiku 4.5 і
судді deepseek.

### 15.10 — прогін CI після повторного ввімкнення Actions

Коли Actions увімкнули знову, `evals.yml` запущено вручну (`workflow_dispatch`) на `test/hw6-evals-ci`
(`853794d`, з фіксом проксі) — прогін
[38735365850](https://github.com/equalizer2k9/dev-digest/actions/runs/38735365850). Ручний запуск, а не
PR, бо PR-події за цей день так і не дали прогону. На ручному запуску workflow вважає зміненими всі
артефакти, але набір модельних jobs той самий: onion-architecture, architecture-reviewer, workflow.

| Job | Результат | Тривалість | Кейси |
|---|---|---|---|
| `changes` | ✓ | 5 с | |
| `quality` | ✓ (гейт) | 22 с | |
| `skills (onion-architecture)` | ✓ | 266 с | 3/3, 8/8 практик PASS (`deepseek/deepseek-v4-flash`) |
| `agents (architecture-reviewer)` | ✗ (звіт) | 159 с | А1 ✓, А2 ✓ (3/3); А3 ✗ — фінальна відповідь агента порожня (4 ходи), тож patternMatch-гейт: «missing concrete evidence» |
| `workflow` | ✗ (звіт) | 188 с | ✓ activation −. ✗ dispatch: запущено `researcher` (ліміт ходів). ✗ contrast: treatment за 1 хід відповів «Прочитайте `docs/agent-prompts/README.md`» — маршрут з AGENTS.md знайдено, але файл не відкрито. ✗ trace: одразу код, `server/AGENTS.md` не прочитано. ✗ activation +: 1 хід без виклику Skill |

Підсумок прогону — success: модельні jobs звітні.

Проксі з master key цього разу стартував і обслужив усі сесії, тож фікс підтверджено вже в CI.

Причини падінь — з логів, без правок під зелений:
- **dispatch і trace — harness**, як у wf-1 і в локальному прогоні: опис агента не покриває рев'ю
  плану; правило про `<pkg>/AGENTS.md` сховане в заголовку таблиці.
- **contrast і activation + — модель.** У CI вона частіше відповідає за 1 хід без інструментів:
  потрібну відповідь називає, але файл не відкриває і скіл не викликає. Локально з тим самим
  оточенням обидва кейси пройшли, тож у CI це коливання.
- **А3 — модель:** порожня фінальна відповідь.

**Вартість** — з usage в артефактах (`records.jsonl`: задача + суддя) за цінами OpenRouter.
haiku 4.5: $1 / $5 за 1M токенів, кеш-читання $0,10, кеш-запис $1,25; deepseek v4 flash: $0,091 / $0,182.

| Job | Вхід (з кешем) / вихід | Вартість |
|---|---|---|
| agents | 266 539 (з них 219 539 кеш-читання) / 4 992 | ≈ $0,105 |
| workflow | 215 388 (з них 144 605 кеш-читання) / 7 183 | ≈ $0,134 |
| skills | 7 126 / 13 975 | ≈ $0,006 |
| **Разом** | | **≈ $0,24** |

Це оцінка за usage: облік кеш-читання в SDK завищений (див. експеримент 3), тож реальна сума, найімовірніше, нижча.

### 15.10 — PR #22: subagent aliases through the proxy

On PR [#22](https://github.com/equalizer2k9/dev-digest/pull/22) the `workflow` job of run
[38795890116](https://github.com/equalizer2k9/dev-digest/actions/runs/38795890116) failed 3/5 (dispatch, trace, activation +).
The proxy log shows a cause that is not the model:
- a repo subagent with `model: sonnet` / `opus` makes the SDK send the bare name `claude-sonnet-5` / `claude-opus-4-8`;
- the wildcard route turned it into `openrouter/claude-sonnet-5`, and OpenRouter answered `400 … is not a valid model ID`;
- so every dispatched subagent errored, including the `trace` case, which ended in ERROR.

**Fix:** explicit routes in `evals/proxy/litellm.config.yaml`, ahead of the wildcard:
- `claude-sonnet-5` → `anthropic/claude-sonnet-5`;
- `claude-opus-4-8` → `anthropic/claude-opus-4.8`;
- `claude-haiku-4-5` → `anthropic/claude-haiku-4.5`.

The subagents run on their real models, so dispatch cases in CI cost more. Checked locally through the proxy: all three
answer `message`. Locally, port 4000 may be taken by another app; `LITELLM_PORT=4011 pnpm proxy:up` works around it.
