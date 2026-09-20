# Design reference — reading `DevDigest Design (standalone).html`

The design in [docs/](.) is a self-unpacking bundle, not plain HTML. A raw `grep` finds only
artboard labels; the React sources are gzip+base64 blobs inside `<script type="__bundler/manifest">`.

## Decoding it

```python
import re, json, base64, gzip
src = open('docs/DevDigest Design (standalone).html', encoding='utf-8', errors='replace').read()
man = json.loads(re.search(r'<script type="__bundler/manifest"[^>]*>(.*?)</script>', src, re.S).group(1))
for uid, entry in man.items():         # keys are UUIDs, values are {mime, compressed, data}
    raw = base64.b64decode(entry['data'])
    data = gzip.decompress(raw) if entry['compressed'] else raw   # fonts: compressed=False
```

An entry is an object, not a bare blob — reading `man[uid]` as a string fails with
`TypeError: argument should be a bytes-like object or ASCII string, not 'dict'` on every one of
the 44 entries, which reads like a broken bundle rather than a wrong key.

44 entries: 26 `application/javascript` blobs, each opening with `/* <name>.jsx — <what it is> */`
— that header is how you identify a file. The other 18 carry no header: 2 `text/jsx`,
3 `text/javascript` and 13 `font/woff2`.

| File | Covers |
|---|---|
| `primitives.jsx` | `SEV` map, `Chip`, `SeverityBadge`, `Badge`, `CircularScore`, `Toggle`, `CostBadge` |
| `findings.jsx` | `FindingCard`, `FindingsPanel`, `VerdictBanner` |
| `prdetail_runs.jsx` | Agent runs tab: `Timeline`, `RunFindings`, `FindingsTooltip`, `ReviewRunCard` |
| `screen_dashboard.jsx` | PR list + filters |
| `screen_trace.jsx` | Run Trace + Live Log drawer |

## Severity UI, as the design actually draws it

`SEV` (`primitives.jsx:3`) has FOUR entries — `CRITICAL`, `WARNING`, `SUGGESTION`, `INFO` —
but the wire contract only ever emits the first three. Derive severity UI from the findings,
never from `Object.keys(SEV)`; see `client/INSIGHTS.md`.

**Counter pills — `RunFindings` (`prdetail_runs.jsx:57`).** Not clickable. Icon + number only,
no label, `borderBottom: "1px dotted <sev colour>"`, and only severities that are present:

```js
["CRITICAL", "WARNING", "SUGGESTION"].filter((sv) => counts[sv])
```

**Filter chips — `FindingsPanel` (`findings.jsx:112`).** `Chip` per severity, ALL THREE always,
count included even at zero (`counts[sv] || 0`), then a 1px divider, an "All categories" chip, and
"Hide low confidence" pushed right with `marginLeft: "auto"`:

```js
["CRITICAL", "WARNING", "SUGGESTION"].map((sv) => Chip({
  active: sevFilter[sv],
  onClick: () => setSevFilter((s) => ({ ...s, [sv]: !s[sv] })),
  icon: SEV[sv].icon, count: counts[sv] || 0, color: SEV[sv].c,
}, SEV[sv].label))
```

`Chip` is already ported at `client/src/vendor/ui/primitives/Chip.tsx` with the same props
(`active`, `onClick`, `icon`, `count`, `color`), so a filter row needs no new primitive.

**Where the design does NOT put chips:** `ReviewRunCard` (`prdetail_runs.jsx:114`) renders the
verdict block (`CircularScore` + `PR SCORE`) and then `FindingCard`s directly — no filter row.

## Deliberate departures from the design

- **Filter is single-select, the design's is multi-select.** The design keeps a `{CRITICAL: true,
  WARNING: true, SUGGESTION: true}` map and toggles each independently. We keep one active
  severity; clicking it again clears the filter. The course criteria specify this behaviour.
- **Counter pills and filter chips are separate rows** inside the expanded review-run card, which
  the design has as one combined row in a panel that the run card never uses.
- **Filter chips carry no count.** The design puts `counts[sv] || 0` on each chip; we keep the
  numbers in the counter row above, so a chip is a label alone and the two rows never disagree.
- **Run Trace drawer cost formatting** — see `server/specs/run-cost-badge.md`.
