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
# test: arm | 2026-11-19 | note Season 0 screening
Aiko Testfield ankle 12/9 calf 22/25 throne 3/2 height 158
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
| `# event: <name> \| <date> \| <kind> \| …` | kind is one of `race`, `relay_leg` (or `relay`), `parkrun`, `long_run`, `circuit`, `climb`, `descent`, `nav`, `treadmill`. Optional fields: `<n> km` (distance), `climb <n> m`, `place <p>/<n>` (place and field size), `field <n>` (field size), `course <course name>`, `unofficial`. |
| `# test: bleep \| <date>` | 20 m shuttle run; result lines give laps. |
| `# test: arm \| <date>` | ARM (Armour) tests; result lines give ankle / calf / throne (and hop, pistol, height). Optional `note <text>`: saved as the event's notes. |
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
- ARM lines, left/right: `ankle 12/9` (the Lunge, cm), `calf 22/25` (the Wall, reps at 60 bpm, counted up to 100), `throne 3/2` (the Throne number passed, 0–5), in any order. `-` means not tested (`ankle 12/-`); one leg alone does not count until both are tested. A single number is the weaker side (`ankle 11`), as in lines written before Season 0.
- Also recorded but not scored: `hop 215/185` (cm; under 5 is read as metres, so `hop 2.15/1.85` works), `pistol yes/no` (full pistol squat per leg: the No Throne badge), `stork 30/44` (seconds, before Season 0). `height 172` saves the pupil's height (coach only). The old `hop yes|no` still reads as hop-and-stick.
- Calf is always reps. A timed calf test is converted before entry: at 60 bpm, 2 s = 1 rep, rounded down, capped at 100.

### Names

Names are matched against the roster using every stored alias: romaji or kanji or kana, either name order, initials (`Ken S`, `H. Mockridge`), and spelling slips. Kanji names match only through a stored alias. A fuzzy match is only ever a suggestion: you confirm it, and the app then remembers that spelling as a new alias.

## White Season: the Gym Log sheet (Dec–Apr)

Claude turns the photo of the paper Gym Log sheet into this block. Paste it into **Paste & Match**; it gets its own review table and nothing is saved until you approve.

```
# gym | 2027-01-11
Aiko Tanaka | Mon A2 | Thu E1!
Ben Carter | Tue S1 | Fri X2 | Sat A3
Chika Mori | RF
```

- `# gym | date`: the date is the **Monday** of the week. Any other date is moved to its Monday, with a warning.
- Each line: the runner's name, then day tokens (`Mon` to `Sun`, any case), each followed by a code. The `|` bars are optional.
- A **code** is a card letter, a tier digit, and an optional `!`: `A2` = Armour, Mid; `E1!` = Engine, Base, something hurt. A tierless card (`R`, run outside) has no digit. One day can hold several codes (`Mon A2 E1`).
- `RF` anywhere on a line is a self recovery week (freeze) for that week.
- Cards and tier names come from **Settings → White Season** (default E Engine, A Armour, S Ski Fix, X Express, H Holiday Express, R Run outside; tiers 1 Base, 2 Mid, 3 Summit).
- Warnings in the review: unknown code or day, the same date twice (the second is not credited), over the weekly cap, Summit without a pass, `!` (amber), RF over the half-term allowance, RF in a week that already qualifies, a date outside White Season, and already imported (same runner, date and card: skipped, so pasting the same block twice adds nothing).
- Gym sessions never change any rating. They drive the streak, freezes, the freshness pause, badges and the Winter Ekiden board.

## White Season: Summit passes and medical freezes

```
# summit | 2027-01-12
Aiko Tanaka, Ben Carter
# freeze: medical | 2027-01-18
Chika Mori
```

- `# summit | date`: gives each runner a Summit pass (▲) from that date, so they may log tier 3. Names separated by commas or one per line.
- `# freeze: medical | date`: a medical freeze for that week (no limit). `# freeze: coach` is a coach freeze. A freeze never stores a reason.

## White Season: the holiday Form

Paste (or drop) the Microsoft Form's CSV export into **Paste & Match**. Choose the columns once (they are remembered), check the review and approve. "Family, Given" names are matched; a confirmed respondent's email is remembered as an alias. Responses that cannot be matched are listed on the **Coach radar**.
