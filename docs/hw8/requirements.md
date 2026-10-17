# ДЗ №8 (опційне) — Agent Performance Dashboard: вимоги

Режим швидкий: рішення D1–D14 фінальні, spec-creator їх не перепитує.

## Текст завдання (зі сторінки ДЗ)

Глобальний екран Agent Performance. Вкладка Stats агента «вже має per-agent metrics»; dashboard агрегує ті самі дані по всіх агентах. Global sidebar; 1 day / 30 days / custom; Total runs, Total cost, Avg accept rate, Most-active agent; таблиця Agent, Runs, Avg cost, Avg duration, Accept rate, Last run, View; cost breakdown за agents і models; ті самі API й правила агрегації, що Stats; loading / empty / error; без model calls; знаменник accept rate і кількість runs; сортування за accept rate лише при достатній вибірці або з позначкою малої вибірки.

Критерії: runs, cost, duration, accept rate = Stats того самого агента за той самий період; Total cost = сума, breakdown сходиться; Most-active — за runs у періоді; агент без запусків і порожній dashboard — різні стани; loading/error без вигаданих нулів; reload, сортування, розгортання рядка не запускають review/model call; видно, де оцінка DevDigest, а де звірений billing.

Здача: окремий PR + коротке демо (dashboard з даними, звірка зі Stats одного агента, один empty або error state).

## Що є у форку (перевірено 17.10, `feat/homework-7` = `fe2a3b5`)

| Що | Стан |
| --- | --- |
| Контракт `AgentStats` (`vendor/shared/contracts/observability.ts`): runs, accepted/dismissed/pending, accept_rate, avg cost/latency, by severity, trend | є |
| Endpoint `GET /agents/:id/stats` | **нема** (лише в коментарі контракту) |
| Вкладка Stats агента | **нема** — `AgentEditor/constants.ts`: «Stats is later work» |
| Ключ сайдбару `agent-performance` | є, сторінки нема |
| `agent_runs`: model, duration_ms, cost_usd, status, source local/ci, ran_at, agent_id (set null при видаленні агента) | є |
| Дизайн v7 з екраном Agent Performance | `docs/DevDigest Design (standalone).html` |

Висновок: як і в ДЗ №7, текст завдання каже «вже є», а в коді нема. Критерій «збігається зі Stats» без Stats не перевірити — тому будуємо **і Stats-вкладку, і dashboard на одній функції агрегації**.

## Рішення

| # | Рішення | Чому |
| --- | --- | --- |
| D1 | Одна чиста функція агрегації на сервері; `GET /agents/:id/stats?from&to` і `GET /agent-performance?from&to` обидва через неї | критерій «ті самі правила»; збіг стає властивістю коду, а не випадком |
| D2 | Run = рядок `agent_runs` зі status завершений або failed, `ran_at` у [from, to), обидва source (local, ci); eval-прогони не рахуються, якщо вони пишуть в іншу таблицю (перевірити; якщо в ту саму — виключити за ознакою) | dashboard про рев'ю PR; failed run теж коштував грошей |
| D3 | Avg cost — по runs з відомою ціною; у підписі — «N of M runs priced»; avg duration — по runs з duration | null ≠ 0; без вигаданих нулів |
| D4 | Accept rate = accepted / (accepted + dismissed) по знахідках цих runs; поруч знаменник «x / y decided»; pending не в знаменнику | так у контракті |
| D5 | Мала вибірка: < 5 рішень — позначка «low sample», такі рядки при сортуванні за accept rate йдуть у кінець | вимога ДЗ; поріг — константа |
| D6 | Періоди: 1 day, 30 days (rolling від now), custom (дати from/to, UTC, to включно до кінця дня); дефолт 30 days; період у URL query | reload зберігає вибір |
| D7 | Most-active = max runs у періоді; нічия — за останнім run | однозначно |
| D8 | Агенти без runs у періоді — у таблиці з «No runs in period» (не нулі), окремо від повністю порожнього стану «No runs in this period» з порадою змінити період | дві різні умови з критеріїв |
| D9 | Runs з `agent_id = null` (агент видалений) — один рядок «Deleted agent» | інакше Total ≠ сума рядків |
| D10 | Breakdown: за агентами і за моделями, кожен сходиться з Total cost (unpriced runs — окремим рядком «unpriced») ; розгортання рядка агента — його розбивка за моделями, з того самого відповіді API | розгортання не робить запитів до моделі |
| D11 | Cost: бейдж «Estimated by DevDigest (token prices)» — звіреного billing нема, так і написано | вимога ДЗ: видно, де оцінка, а де billing |
| D12 | Stats-вкладка агента (нова, 6-та): ті самі картки для одного агента, той самий селектор періоду, + by severity і trend з контракту, якщо дешево; посилання «View» з dashboard → ця вкладка з тим самим періодом | критерій звірки |
| D13 | Без нових таблиць і міграцій; агрегація — SQL з групуванням або вибірка + чиста функція; індекс лише якщо EXPLAIN покаже потребу | дані вже є |
| D14 | Тести: чиста функція (суми сходяться, null-cost, low sample, нічия, deleted agent, межі періоду), роут (той самий агент: stats == рядок dashboard), компонентні (loading, empty, agent without runs, error без нулів, сортування не робить запит до review/model API) | критерії ДЗ один в один |

## Не робимо

Звірку з billing OpenRouter; графіки поза breakdown і trend; експорт; фонове оновлення.

## Гілки

- `feat/homework-8` від `feat/homework-7` — інтеграційна; спека й план комітяться в неї.
- `feat/hw8-agent-performance` від `feat/homework-8` — код; PR → `feat/homework-8`.

## Здача

PR + відео ≤ 1 хв `docs/hw8/hw8-dashboard-demo.mp4` (у `.gitignore`): dashboard з даними → View → Stats того самого агента за той самий період (цифри збігаються) → empty-стан (період без runs).
