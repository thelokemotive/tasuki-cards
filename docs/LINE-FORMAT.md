# Tasuki line format (v1)

A plain-text way to enter many results at once. Paste it into **Paste & Match**; nothing is saved until you approve the review table. Claude prepares imports in this format, so the parser follows these rules exactly.

## Example

```
# event: Hachimantai Ekiden | 2026-11-01 | relay_leg | 2.0 km | climb 20 m
Aiko Testfield, 8:10, leg 2, team Peregrine
Ken S, 7:55, leg 4, team Golden Eagle, raced earlier
# event: Campus Circuit | 2026-11-04 | circuit
Ben Sampleton 4:52
# event: Higashi-Matsushima XC | 2026-11-29 | race | 4.0 km | place 7/23
Aiko Testfield 16:15
# test: bleep | 2026-11-10
Ben Sampleton 64 laps
# test: arm | 2026-11-10
Aiko Testfield ankle 11 calf 18 stork 22 hop yes
# participation: saturday_run | 2026-11-07
Aiko Testfield, Ben Sampleton
# event: Chiang Mai Trail 64K | 2026-12-20 | race | 64 km | climb 2800 m
Coach Example 9:45:00
```

## Rules

- One result per line. Blank lines are ignored. A line starting with `#` that is not one of the headers below is a comment.
- A **header** sets the context for every line after it, until the next header. Header fields are separated by `|`. Field order after the date does not matter.
- Dates are `YYYY-MM-DD`. If a header has no date, today is used and the review table warns you.

### Headers

| Header | Fields |
|---|---|
| `# event: <name> \| <date> \| <kind> \| …` | kind is one of `race`, `relay_leg` (or `relay`), `parkrun`, `long_run`, `circuit`, `climb`, `descent`, `nav`. Optional fields: `<n> km` (distance), `climb <n> m`, `place <p>/<n>` (place and field size), `field <n>` (field size), `course <course name>`, `unofficial`. |
| `# test: bleep \| <date>` | 20 m shuttle run; result lines give laps. |
| `# test: arm \| <date>` | ARM (Armour) tests; result lines give ankle / calf / stork / hop. |
| `# test: nav \| <date> \| course <course name> \| <n> km` | Navigation test; `<n> km` is the effective route distance. |
| `# participation: saturday_run \| <date>` | Names only (comma-separated, or one per line). Also `freeze` (a streak freeze applied by the coach). |

- If the event name matches an existing event on the same date, results are added to that event. Otherwise a new event is created when you approve.
- `circuit`, `climb`, `descent` and `nav` look up the course by `course <name>`, then by the event name (so `# event: Campus Circuit | … | circuit` uses the Campus Circuit course and its 1.30 km distance).
- Distance and climb come from the header, else from the course.
- `place 7/23` in a header applies to the single result that follows it; with several results, give places on each line instead. `/23` (or `field 23`) also records the field size.

### Result lines

```
<name>[,] <time> [, leg <n>] [, team <team name>] [, raced earlier] [, place <p>[/<n>]] [, unverified]
```

- The name is everything before the first time or measurement. A comma after the name is optional (`Ben Sampleton 4:52` and `Ben Sampleton, 4:52` are the same).
- Times can be written any way the app understands: `16:15`, `1:02:33`, `16m15s`, `975s`, `7'45"`, `１６：１５`, or dictated words such as `sixteen fifteen`.
- `leg <n>`, `team <name>` and `raced earlier` (raced earlier the same day) are for relay legs.
- `unverified` marks a student-reported result that the coach has not checked yet.
- Descents: add `not clean` if the run was not a clean run (it is stored but never scored).
- Navigation: add `errors <n>` (control errors) and optionally `variant <x>` and `route <n> km`.
- Bleep test lines: `<name> <laps> laps` (or just the number).
- ARM lines: any of `ankle <cm>`, `calf <reps>`, `stork <seconds>`, `hop yes|no`, in any order. Everything is measured on the weaker side.

### Names

Names are matched against the roster using every stored alias: romaji or kanji or kana, either name order, initials (`Ken S`, `H. Mockridge`), and spelling slips. Kanji names match only through a stored alias. A fuzzy match is only ever a suggestion: you confirm it, and the app then remembers that spelling as a new alias.
