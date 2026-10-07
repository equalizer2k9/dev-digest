# Voice-over — Suno settings and scripts

One clip per scene. Generate each with the same settings, save it as the file named below in
`docs/hw2/voiceover/`, then run `docs/hw2/mix-voice.sh`.

## Settings (identical for every clip)

- Mode: **Advanced**
- Vocal Gender: pick one and keep it for all five clips
- Background music: **Off**
- Variety: minimum

## Tone (same text for every clip)

```
Calm, clear narrator for a software demo screencast. Neutral and confident, moderate pace, short pauses between sentences. Ukrainian language, no music, no sound effects.
```

## Scenes

The target is 85–90% of the scene, so the voice ends before the picture changes. A clip longer
than its scene overlaps the next one — `mix-voice.sh` warns about it.
| Scene | File | Scene length | Target clip length | Words |
|---|---|---|---|---|
| 1 — Conventions: ReScan, curate, Create skill | `s1.mp3` | 40.3 s | 34–36 s | 78 |
| 2 — Skills: repo-conventions card, preview, versions | `s2.mp3` | 23.9 s | 20–22 s | 45 |
| 3 — Agents: API Contract Reviewer, Skills tab, reorder | `s3.mp3` | 22.6 s | 19–20 s | 44 |
| 4 — PR #9: Run Review, skills block in the trace, run without skills | `s4.mp3` | 40.4 s | 34–36 s | 76 |
| 5 — Settings: Feature Models, Conventions model dropdown | `s5.mp3` | 14.3 s | 12–13 s | 27 |

### Scene 1 → `s1.mp3` · target 34–36 s (scene 40.3 s)

Script:

```
Це DevDigest, домашнє завдання два. Сторінка Conventions: натискаю ReScan — код сам відбирає зразки з репозиторію, дешева модель пропонує правила, а кожен доказ перевіряється по реальному файлу. На картці кандидата — правило, файл із рядком і впевненість у відсотках. Один кандидат приймаю, один відхиляю — він зникає зі списку, — ще один редагую просто на місці й зберігаю. Кнопка Create skill відкриває модальне вікно: назва repo-conventions, тіло зібране з прийнятих правил, і його можна правити. Скіл уже створено раніше, тому закриваю вікно.
```

### Scene 2 → `s2.mp3` · target 20–22 s (scene 23.9 s)

Script:

```
Сторінка Skills: новий скіл repo-conventions у загальному списку, з типом, версією і кількістю агентів. Клік по картці відкриває перегляд збоку, не залишаючи сторінку. На сторінці скіла — вкладки Config, Preview з відрендереним markdown і Versioning: список усіх версій, а кнопка Diff показує різницю з поточною версією.
```

### Scene 3 → `s3.mp3` · target 19–20 s (scene 22.6 s)

Script:

```
Agents тепер у секції Skills Lab. Відкриваю API Contract Reviewer і переходжу на вкладку Skills: тут усі скіли системи з перемикачами й типом, repo-conventions увімкнений. Є пошук за назвою, а увімкнені скіли можна перетягувати мишею — саме в цьому порядку їхні блоки потрапляють у промпт.
```

### Scene 4 → `s4.mp3` · target 34–36 s (scene 40.4 s)

Script:

```
Pull request номер дев'ять зі зміною сигнатури роуту: поле у відповіді перейменовано. Натискаю Run Review і обираю API Contract Reviewer. Коли прогін завершено, відкриваю вкладку Agent runs і трасу цього прогону. У збірці промпта — окремий блок Skills: п'ять скілів у тому порядку, що на вкладці агента, з кількістю токенів кожного і блоку загалом. Для порівняння — попередній прогін того самого агента без скілів: блоку Skills немає, одна знахідка проти чотирьох, і breaking change помічено лише зі скілами.
```

### Scene 5 → `s5.mp3` · target 12–13 s (scene 14.3 s)

Script:

```
Settings, розділ Feature Models: модель для класифікації конвенцій обирається з випадного списку з пошуком, вона не зашита в код. На цьому все, дякую за увагу до демо.
```
