## PR self-review — uncommitted diff

**Вердикт: `MERGE ALLOWED`** — нуль critical, нуль major, нуль minor.

### Diff (4 файли, +2 / −4)

| Surface | Файл | Зміна |
|---|---|---|
| client | [client/specs/README.md](../../client/specs/README.md) | conventions-extractor: `draft` → `implemented` |
| server | [server/specs/README.md](../../server/specs/README.md) | conventions-extractor: `draft` → `implemented` |
| `.claude/` | [frontend-architecture/SKILL.md](../../.claude/skills/frontend-architecture/SKILL.md) | −`allowed-tools` |
| `.claude/` | [onion-architecture/SKILL.md](../../.claude/skills/onion-architecture/SKILL.md) | −`allowed-tools` |

Untracked файлів нема.

### Findings

| file:line | severity | rule (skill) | fix |
|---|---|---|---|
| — | — | — | нема |

- **client:** завантажив `frontend-architecture`, `react-best-practices`, `react-testing-library`. Diff — один рядок markdown-таблиці, коду нема; жодне правило не зачеплене. Статус збігається зі спекою (`**Status:** implemented`).
- **server:** завантажив `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`. Те саме: один рядок markdown, збігається зі спекою.
- **`.claude/skills/**`:** у таблиці маршрутів цієї поверхні нема, тож звірив diff вручну. Frontmatter валідний — обидва скіли щойно завантажились через Skill tool уже без `allowed-tools`.

### Guardrails (крок 4)

Жоден не спрацював: `git status` показує лише 4 файли вище. Міграції, `_journal.json`, snapshots, lock-файли, `src/vendor/shared`, секрети — не зачеплені.

### Gate (крок 5), прогнано на цьому diff

| Пакет | Команда | Результат |
|---|---|---|
| server | `pnpm typecheck` | ✅ exit 0 |
| server | `pnpm exec vitest run --exclude '**/*.it.test.ts'` | ✅ `Test Files  21 passed (21)` · `Tests  188 passed (188)` |
| client | `pnpm typecheck` | ✅ exit 0 |
| client | `pnpm test` | ✅ `Test Files  28 passed (28)` · `Tests  183 passed (183)` |

reviewer-core та e2e в diff нема — не запускав. Інтеграційні тести server у цьому прогоні не запускав.

### Поза diff

Спеки `skills-lab.md` (server і client) досі мають `**Status:** draft`, тому їхні рядки в таблицях лишились `draft`. Якщо Skills Lab уже реалізований — це окрема правка спек і таблиць, рішення за тобою.

Нічого не комітив.

---

## Додаток — решта AC-21 (перевірено 2026-10-07)

AC-21 має три частини. Прогін вище закриває третю (ручний запуск на diff `client/` + `server/`,
обидва набори скілів завантажені за один прохід). Дві інші перевірено окремо.

### 1. `pr-self-review` — Workflow-диспетчер

[.claude/skills/pr-self-review/SKILL.md](../../.claude/skills/pr-self-review/SKILL.md), frontmatter і заголовок:

```
name: pr-self-review
version: 1.0.0
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob, Skill

# PR Self-Review (workflow)
**Version:** 1.0.0 · user-invoked only (`/pr-self-review`) · subject: the **uncommitted** diff
```

- `disable-model-invocation: true` — запускається лише вручну через `/pr-self-review`.
- `Skill` в `allowed-tools` і таблиця маршрутів у кроці 3 — скіл сам правил не містить, а
  викликає скіли-власники поверхонь (`frontend-architecture`, `onion-architecture`, …).
- У `allowed-tools` нема `Write` / `Edit` — диспетчер звітує, код не змінює.

### 2. git-push хук не встановлено

| Перевірка | Команда | Результат |
|---|---|---|
| Хуки git | `ls .git/hooks \| grep -v '\.sample$'` | порожньо — лише `*.sample` |
| Перенаправлення хуків | `git config --get core.hooksPath` | не задано (exit 1) |
| Менеджери хуків | `ls -d .husky lefthook.yml .lefthook.yml .pre-commit-config.yaml` | `No such file or directory` для всіх чотирьох |
| Хуки Claude Code в репо | `.claude/settings.json`, `.claude/settings.local.json` | файлів нема; у `.claude/` лише `commands/` і `skills/` |
| Згадки в коді | `git grep -n -i "pre-push\|git push" -- ':!*.md' ':!*lock*'` | нуль збігів |

`git push origin feat/homework-2` (коміт `77abbe8`) пройшов без жодного виводу хука.
