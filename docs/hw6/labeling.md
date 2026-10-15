# ДЗ №6 — розмітка знахідок для eval-набору

| | |
| --- | --- |
| Дата | 2026-10-15 |
| Що | 46 нерозмічених знахідок на PR з patch файла: General Reviewer (#6, #7, #11, #19) і API Contract Reviewer (#9) |
| Хто вирішив | пропозиції — субагент, який прочитав diff кожної знахідки й код у head-гілці PR; рішення підтвердив користувач |
| Як застосовано | `POST /findings/:id/accept` або `POST /findings/:id/dismiss` — той самий API, що й кнопки Accept / Dismiss у студії |
| Підсумок | 30 accept / 16 dismiss: General Reviewer 11 / 2, API Contract Reviewer 19 / 14 |

Правила, ухвалені під час розмітки:
- **«Missing MAJOR version bump» → dismiss.** Пакет server приватний, `0.0.0`, не публікується, а API не має версії, тож bump нікого не захищає.
- **Дублі на тих самих рядках → accept.** Відхилений дубль став би `must_not_flag` і карав би агента за правильну знахідку.
- **Протилежні рішення на тих самих рядках кейсами не стають.** Правило AC-45 у SPEC-03 відмовляє в такому кейсі, наприклад «unfinished review» 156-188 проти SSRF 153-180 у `reviews/routes.ts`.

Номери рядків — нова сторона diff кожного PR.

| # | id (first 8 chars) | PR | file:line | title | proposal | why |
|---|---|---|---|---|---|---|
| 1 | `6554f54d` | #6 | `server/src/modules/pulls/routes.ts:341-343` | Missing pagination or limit on PR query | **dismiss** | Speculative: the dashboard needs a row per PR and sibling /repos/:id/pulls is also unpaged; the real cost is the N+1, flagged separately. |
| 2 | `d880bbac` | #6 | `server/src/modules/pulls/routes.ts:344-362` | N+1 query pattern inside loop causes excessive database queries | **accept** | True: one reviews query per PR plus one findings query per review, fetching full rows only to count them; a single GROUP BY suffices. |
| 3 | `55aaf152` | #7 | `server/src/modules/reviews/routes.ts:153-180` | Server-Side Request Forgery (SSRF) via user-controlled webhook URL | **accept** | ShareBody is z.object({ url: z.string() }) and the handler POSTs to it unchecked, so callers can reach loopback, metadata or internal hosts. |
| 4 | `5b0f9831` | #7 | `server/src/modules/reviews/routes.ts:156-188` | Unfinished review can be shared | **dismiss** | reviews has no status column, and run-executor inserts a review row only after the run completes, so no unfinished review can be shared. |
| 5 | `be4724f4` | #7 | `server/src/modules/reviews/routes.ts:169-182` | Missing error handling and timeout for webhook fetch | **accept** | True: fetch has no AbortSignal, no try/catch and no response.ok check; a network error becomes a 500 carrying the raw error message. |
| 6 | `808e3033` | #7 | `server/src/modules/reviews/routes.ts:169-182` | SSRF via user-controlled webhook URL in POST /reviews/:id/share | **accept** | Correct SSRF: req.body.url goes straight to fetch with no scheme, host or private-IP check (duplicate of the other SSRF findings). |
| 7 | `242b7b5e` | #7 | `server/src/modules/reviews/routes.ts:170-175` | Unvalidated webhook URL allows Server-Side Request Forgery (SSRF) | **accept** | Correct: the user-supplied url reaches fetch at line 173 with no URL parsing, scheme allowlist or private-range block. |
| 8 | `b6aea3c0` | #7 | `server/src/modules/reviews/routes.ts:170-180` | No timeout on outbound HTTP request | **accept** | fetch has no signal; undici's 300 s defaults make 'indefinitely' overstated, but a slow webhook still holds the request for minutes. |
| 9 | `baef1212` | #7 | `server/src/modules/reviews/routes.ts:170-180` | Webhook failure silently treated as success | **accept** | The fetch Response is discarded and the handler always returns { ok: true }, so a 4xx/5xx webhook reply is reported as success. |
| 10 | `2af20544` | #7 | `server/src/modules/reviews/routes.ts:174-183` | No fetch timeout – dangling requests can exhaust server resources | **accept** | True: no AbortSignal.timeout on the outbound fetch, so a hanging webhook ties up the request until undici's 300 s defaults fire. |
| 11 | `2b4208bd` | #7 | `server/src/modules/reviews/routes.ts:174-186` | Webhook response status not checked – user receives false success | **accept** | True: the fetch result is never inspected, so non-2xx webhook replies still return { ok: true } and nothing is logged. |
| 12 | `f485acf5` | #11 | `server/src/platform/retry-delay.ts:8-10` | retryDelayMs returns NaN for invalid base strings | **accept** | ms@2.1.3 returns undefined for unparseable input like 'xyz' (the cast hides it), giving NaN; issue #18 requires an unparseable base to throw. |
| 13 | `7d50a754` | #19 | `server/src/modules/agents/routes.ts:85-92` | Route handler directly queries database, violating INV-1 | **accept** | True: the new handler imports drizzle and db/schema and queries app.container.db; agents is not an INV-1 legacy exception. |
| 14 | `ce640993` | #9 | `server/src/modules/pulls/routes.ts:255` | Producer at routes.ts:255 still emits old key `additions` instead of `added_lines` | **dismiss** | Line 255 builds a pr_files insert row whose DB column is still `additions`; `additions: f.added_lines` is correct, not a response producer. |
| 15 | `6ec82a9d` | #9 | `server/src/modules/pulls/routes.ts:255` | Response-schema mismatch in pulls route | **dismiss** | That object goes into t.prFiles, not a PrFile response; the column is `additions`, so renaming the key would break the insert. |
| 16 | `acbf5f5e` | #9 | `server/src/modules/pulls/routes.ts:255-307` | Response-schema mismatch: route handlers produce wrong keys | **dismiss** | Both claims false: 255 inserts into pr_files.additions, and 307 reads f.additions from a pr_files DB row, where that column still exists. |
| 17 | `4851df5e` | #9 | `server/src/modules/pulls/routes.ts:256` | Response schema mismatch in producer | **dismiss** | Wrong object: lines 252-258 map adapter files into t.prFiles rows (column `additions`); no PrFile response schema applies there. |
| 18 | `c3422e15` | #9 | `server/src/modules/pulls/routes.ts:258` | Producer-schema mismatch in route handler | **dismiss** | The mapped object is a t.prFiles insert, whose column is `additions`; the refresh branch returns `detail` from the adapter, already using added_lines. |
| 19 | `41c52ec2` | #9 | `server/src/modules/pulls/routes.ts:304` | Response handler at routes.ts:304 references old field name `f.additions` which is now `undefined` | **dismiss** | In the offline fallback, f is a pr_files DB row whose column is still `additions`, so f.additions is defined; line 304 is `body:`. |
| 20 | `b8ae1420` | #9 | `server/src/modules/pulls/routes.ts:304` | API response field `added_lines` is always undefined due to stale property access | **dismiss** | False: `files` comes from select().from(t.prFiles), so f.additions is the DB column, not the renamed PrFile field. |
| 21 | `64925871` | #9 | `server/src/vendor/shared/contracts/platform.ts:189` | PrFile field rename without alias | **accept** | True: `additions` is replaced, not aliased; client FileCard still reads file.additions and shows +undefined. Cites 189, one line above the rename. |
| 22 | `540a5bcf` | #9 | `server/src/vendor/shared/contracts/platform.ts:189` | Missing semver major bump | **dismiss** | Not applicable: server/package.json is private, version 0.0.0, unpublished, with no API version prefix; nobody pins ^x.y, so a bump changes nothing. |
| 23 | `9dc28188` | #9 | `server/src/vendor/shared/contracts/platform.ts:189` | Violation of deprecation policy | **accept** | True: `additions` is dropped with no overlap or @deprecated marker; serving both fields would avoid the client break. Restates the breaking-change finding. |
| 24 | `32a03b82` | #9 | `server/src/vendor/shared/contracts/platform.ts:189` | Breaking change: field rename without alias | **accept** | True: the old key vanishes from GET /pulls/:id files while the client still reads `additions`; an alias would keep it working. |
| 25 | `ee8e207a` | #9 | `server/src/vendor/shared/contracts/platform.ts:189` | Missing major version bump for breaking change | **dismiss** | Not applicable: the package is private 0.0.0 and the API is unversioned; client and server ship from one repo, so no caret consumer exists. |
| 26 | `e06858bf` | #9 | `server/src/vendor/shared/contracts/platform.ts:189` | PrFile field removal without deprecation | **accept** | True: no @deprecated marker and no overlap window, so existing readers of `additions` break at once; serving both fields fixes it. |
| 27 | `c4b8f0c7` | #9 | `server/src/vendor/shared/contracts/platform.ts:189` | Breaking change: field renamed without alias | **accept** | True: renamed with no alias, and the client copy and FileCard still use `additions`, so the diff view loses its line counts. |
| 28 | `1785c6c1` | #9 | `server/src/vendor/shared/contracts/platform.ts:189` | Deprecation policy violation: field removed without announcement or overlap | **accept** | True: old and new keys are never served together, so the unchanged client breaks immediately; same root cause as the breaking-change finding. |
| 29 | `b27d32ea` | #9 | `server/src/vendor/shared/contracts/platform.ts:189` | Missing major version bump for breaking change | **dismiss** | Version bump is irrelevant here: private 0.0.0 package, no published contract, no API version; the real fix is aliasing or updating the client. |
| 30 | `09851e3f` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Client-side contract copy not updated to match server schema | **accept** | True: client/src/vendor/shared/contracts/platform.ts still declares `additions`, and DiffTab/FileCard consume it, so the two copies now disagree. |
| 31 | `ba28416f` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Breaking change: field `additions` renamed to `added_lines` with no alias | **accept** | True: renamed with no alias; any reader of PrFile.additions, including the studio's FileCard, now gets undefined. |
| 32 | `55179bf5` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Response-schema mismatch: client contract copy not updated | **accept** | True: only the server copy changed; the client vendor copy keeps `additions`, so the client's PrFile type no longer matches the wire shape. |
| 33 | `d00d659c` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Deprecation policy violation: field removed without deprecation marker or overlap | **accept** | True: `additions` removed with no deprecation marker or overlap, so the unchanged client breaks; restates the breaking-change finding. |
| 34 | `0a79c0db` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Semver discipline violation: breaking change with no version bump | **dismiss** | Not applicable: server/package.json is private 0.0.0 and unpublished; no consumer pins a semver range, so a MAJOR bump protects nobody. |
| 35 | `3b3375c1` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Breaking change: field `additions` removed from `PrFile` without alias or transition | **accept** | Core claim true for GET /pulls/:id; 'list endpoints' is overstated, since the PR list returns PrMeta, not PrFile. |
| 36 | `d9482ba1` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Client-side contract copy not updated – server and client schemas out of sync | **accept** | True: only the server vendor copy was renamed; client/src/vendor/shared still expects `additions`, so the client reads undefined. |
| 37 | `94c32288` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Deprecation policy violated: field removed without prior deprecation or overlap | **accept** | True: no overlap release in which both keys are served, so the client breaks the moment the server ships; same root cause as the rename. |
| 38 | `c007d29b` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Breaking change shipped without MAJOR version bump | **dismiss** | Not applicable: no version constant or path prefix exists and package.json is private 0.0.0; bumping it would not help any consumer. |
| 39 | `151d8bc7` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Breaking rename of `additions` to `added_lines` without alias, deprecation, or version bump | **accept** | Rename-without-alias is true; but GET /pulls/:id/files does not exist, and the version-bump part does not apply to this private package. |
| 40 | `51bffef5` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Breaking change: field `additions` removed from PrFile schema without alias | **accept** | True: `additions` removed with no alias or transition, so prFile.additions is undefined for the studio client still on the old copy. |
| 41 | `e2e5d4df` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Client-side contract copy not updated to match server schema | **accept** | True: the client contract copy was not touched and still declares `additions`, so server and client copies have diverged. |
| 42 | `34886ea1` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Field removed without prior deprecation or overlap window | **accept** | True: removal skips any overlap window, so the unchanged client loses the field at once; restates the breaking-change finding. |
| 43 | `35652229` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Breaking change shipped without a MAJOR version bump | **dismiss** | Not applicable: the server package is private 0.0.0 with no published contract or API version, so the caret-range harm cannot occur. |
| 44 | `3c6e25d2` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Breaking change: field `additions` renamed to `added_lines` without alias | **accept** | True: no old key is kept, so readers of files[i].additions get undefined; the client FileCard is one such reader. |
| 45 | `1e4e8db5` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Client-side contract copy not updated to match server schema | **accept** | True: only server/src/vendor/shared was edited; client/src/vendor/shared still declares `additions`, so the field is lost client-side. |
| 46 | `df1f6b95` | #9 | `server/src/vendor/shared/contracts/platform.ts:190` | Breaking change shipped without MAJOR version bump | **dismiss** | Not applicable: private 0.0.0 package, never published, no versioned API; a MAJOR bump would not prevent the client break. |

## Full ids (for applying via API)

| # | full id | proposal |
|---|---|---|
| 1 | `6554f54d-6e1a-4454-ac92-64d225d9b1ef` | dismiss |
| 2 | `d880bbac-0472-45c4-9340-995d006fc9e2` | accept |
| 3 | `55aaf152-df71-4fa8-914f-3ece84434ae4` | accept |
| 4 | `5b0f9831-ae70-4821-8c04-e3ead6d64260` | dismiss |
| 5 | `be4724f4-0163-4907-aa4f-289027d8bec0` | accept |
| 6 | `808e3033-0e8f-4133-8bd9-3715493d9454` | accept |
| 7 | `242b7b5e-c9ff-4543-aa5d-73d40fd87f15` | accept |
| 8 | `b6aea3c0-d656-441b-be2f-787e43dfdd18` | accept |
| 9 | `baef1212-ad93-4e22-9d85-6ec78af044c3` | accept |
| 10 | `2af20544-2b27-4f2c-b4c6-6d2af795260d` | accept |
| 11 | `2b4208bd-3a83-4ecb-b42e-ab55641de587` | accept |
| 12 | `f485acf5-de0e-4762-8efa-e1719c11cc45` | accept |
| 13 | `7d50a754-cf7a-464e-b254-00c90e9c5a2e` | accept |
| 14 | `ce640993-307e-4d48-9297-a8b7d7eeae26` | dismiss |
| 15 | `6ec82a9d-270e-4560-9537-0da542d934dc` | dismiss |
| 16 | `acbf5f5e-dde0-486e-b183-d9f9bbfc33eb` | dismiss |
| 17 | `4851df5e-6524-44d0-9bbe-ca561a28d19a` | dismiss |
| 18 | `c3422e15-7d13-425e-9c5e-defbc5079b54` | dismiss |
| 19 | `41c52ec2-03ca-4c43-b5da-25d584aedaed` | dismiss |
| 20 | `b8ae1420-e717-4835-9640-48f79b85efad` | dismiss |
| 21 | `64925871-afc8-4c05-a8aa-2f78b9e15a9a` | accept |
| 22 | `540a5bcf-a5c3-488b-ba44-053a36708ba1` | dismiss |
| 23 | `9dc28188-3428-4b93-85d6-01ad26e06870` | accept |
| 24 | `32a03b82-429e-4faf-b0ba-91a27ff346fe` | accept |
| 25 | `ee8e207a-ed4c-4621-9c74-626e0c889286` | dismiss |
| 26 | `e06858bf-f04c-4b62-84fd-9ba1d5793378` | accept |
| 27 | `c4b8f0c7-2de6-4ac4-96f5-4a3a0bb00956` | accept |
| 28 | `1785c6c1-12ed-4928-a48e-fad3cca0b616` | accept |
| 29 | `b27d32ea-8eef-480a-8154-49c97af78ca2` | dismiss |
| 30 | `09851e3f-6924-44e4-961d-ef7648082e50` | accept |
| 31 | `ba28416f-ada9-42b7-916c-92b80b6a6401` | accept |
| 32 | `55179bf5-88bc-47cc-82a8-a5dd0b8306e6` | accept |
| 33 | `d00d659c-161a-4c6a-86e8-f637868fd155` | accept |
| 34 | `0a79c0db-a184-4746-ac40-7ab9886a462c` | dismiss |
| 35 | `3b3375c1-1028-4747-8af6-b82a359a33ef` | accept |
| 36 | `d9482ba1-43f9-46c4-8c32-e9fde07f47e8` | accept |
| 37 | `94c32288-bf8d-4a3d-a613-9f0a3fa1f27e` | accept |
| 38 | `c007d29b-d633-4664-b722-2719cc04d298` | dismiss |
| 39 | `151d8bc7-8e9f-4be6-b2a6-71cfbce71bb7` | accept |
| 40 | `51bffef5-652c-42bb-8309-3b0a1b233407` | accept |
| 41 | `e2e5d4df-1545-4983-948c-63e0abccd4f4` | accept |
| 42 | `34886ea1-15f8-474e-b2ad-40100ed587a6` | accept |
| 43 | `35652229-cbb5-496f-adb0-1971d71a0abc` | dismiss |
| 44 | `3c6e25d2-6919-451d-b44f-adfeae2586f4` | accept |
| 45 | `1e4e8db5-c2e4-4e93-bf31-edc510f52901` | accept |
| 46 | `df1f6b95-168b-4387-a3cc-4eb8c6fa2138` | dismiss |

## PR #21 — тестовий PR для General Reviewer

[#21](https://github.com/equalizer2k9/dev-digest/pull/21) («do not merge») містить 3 справжні дефекти й правильні зміни-приманки, кожна у своєму файлі. Ціль — дати агенту, який майже не шумить, місця для `must_not_flag`. General Reviewer (`deepseek/deepseek-v4-flash`) прогнано чотири рази, по два на кожен head.

### Розмітка (застосовано, head `f5669db9`)

| # | id (first 8 chars) | PR | file:line | title | proposal | why |
|---|---|---|---|---|---|---|
| 47 | `51d3d859` | #21 | `server/src/modules/pulls/routes.ts:87-88` | SQL injection via raw interpolation of `?q=` parameter in PR list query | **accept** | True: `?q=` reaches `sql.raw` unescaped at line 88. |
| 48 | `23542960` | #21 | `server/src/modules/pulls/routes.ts:87-88` | SQL injection via raw interpolation of user input in ILIKE filter | **accept** | Same defect, a duplicate on the same lines. |
| 49 | `7cef667c` | #21 | `server/src/modules/repos/service.ts:145` | Missing `await` on `rm()` when deleting local clone on repo removal | **accept** | True; cites 145, while the `rm` call is on 147. |
| 50 | `e098b869` | #21 | `server/src/modules/repos/service.ts:144-145` | Missing `await` on `rm()` causes unhandled rejection and incomplete file deletion | **accept** | True: without `force`, a missing clone rejects with ENOENT and nothing catches it; same offset from line 147. |
| 51 | `48c18aaf` | #21 | `server/src/modules/reviews/routes.ts:113` | Off-by-one error in pagination start index for run history | **accept** | True defect, but line 113 is the route schema; the defect is on 117. Not turned into a case. |
| 52 | `7d0569c9` | #21 | `server/src/modules/reviews/routes.ts:117` | Off-by-one error in pagination start index causes first page to skip first 20 items | **accept** | True, exact line: `page * pageSize` with `page ≥ 1`. The only source of the off-by-one case. |

Full ids: `51d3d859-c531-4ae8-a74a-504f480456a6` · `23542960-1544-4829-b45f-3b4c007b4f8d` · `7cef667c-0e46-439a-818e-cb4b139f66d3` · `e098b869-0b51-4621-a338-d7009d1d0adc` · `48c18aaf-cb18-40c2-906c-4729c6823bee` · `7d0569c9-ade7-46a2-bd9d-7a1bde46bca3`.

### Раунд приманок (head `7c93af09`)

Перша версія мала третю приманку — `.parse` у handler із приведенням типу. Її прибрано: `server/CLAUDE.md` забороняє `Schema.parse(req.body)` у handler, тож знахідка на ній була б частково правдивою.

| Приманка | Файл:рядок | Чому код правильний |
|---|---|---|
| `sql` з інтерполяцією | `server/src/modules/repos/repository.ts:31` | Drizzle передає `${fullName}` як параметр запиту; імена на GitHub не залежать від регістру. |
| широкий catch з повторним throw | `server/src/modules/settings/routes.ts:52-66` | Логує й кидає ту саму помилку далі; транзакція відкочується. |
| рядок, схожий на токен | `server/src/modules/repos/helpers.test.ts:4` | `ghp_test…` — фікстура юніт-тесту, а не справжній ключ. |
| `Math.random()` у затримці | `server/src/platform/job-backoff.ts:8` | Jitter розносить у часі повтори фонових джоб; випадковість тут не для безпеки. |
| послідовні `await` у циклі | `server/src/modules/_shared/post-review-comments.ts:16-17` | Паралельні запити, що створюють контент, GitHub карає вторинним rate limit; порядок коментарів зберігається. |

Результат: 4 прогони дали 12 знахідок, усі на трьох дефектах. Жодної знахідки на п'яти приманках. Шість нових знахідок другого раунду — дублі на тих самих рядках, пропозиція для всіх **accept**; поки не розмічено:

| id (first 8 chars) | file:line | title | proposal |
|---|---|---|---|
| `35edd272` | `server/src/modules/pulls/routes.ts:87-88` | SQL injection via raw string interpolation in title filter | accept |
| `32ede58c` | `server/src/modules/pulls/routes.ts:87-88` | SQL injection in PR title filter via `sql.raw` with unsanitized user input | accept |
| `cc7b77bc` | `server/src/modules/repos/service.ts:145` | Missing `await` on `rm()` call when deleting local clone | accept |
| `a7c43a56` | `server/src/modules/repos/service.ts:145` | Missing `await` on `rm()` when deleting local clone on repo removal | accept |
| `b1dbbf78` | `server/src/modules/reviews/routes.ts:117` | Off-by-one error in run history pagination: first page is skipped | accept |
| `f98c9bbb` | `server/src/modules/reviews/routes.ts:118` | Off-by-one in run-history pagination: first page skips first `pageSize` items | accept |

### Висновок

- **Агент на DeepSeek майже не шумить, тому даних для `must_not_flag` мало.** За 4 прогони — 0 хибних знахідок на 5 приманках, а у всіх рев'ю General Reviewer відхилено лише 2 знахідки. Це висновок про агента, а не про набір. Зупиняємось на одному `must_not_flag` (#6 `pulls/routes.ts:341-343`), нових раундів не робимо.
- **Зона `repos/service.ts:144-145` не покриває рядок 147, де стоїть `rm()`.** Збіг рахується лише за файлом і рядками (NFR-16): прогін із точною цитатою 147 стане промахом для цього кейсу, а прогін із цитатою 145 — влучанням. Усі чотири прогони цитували 144–145.
