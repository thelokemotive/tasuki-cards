# Tasuki Cards: build brief for Claude Code

You're building "Tasuki Cards", a web app for Fabian Loke, Head of Trail Running at Harrow International School Appi Japan. The full specification is below this brief. Where this brief and the spec disagree, the spec wins, except on where to build and how to deliver (this brief wins there).

## Where and how

- This is a Windows laptop with Node 24. Check that `node`, `npm` and `git` work before you start.
- Build in `C:\Users\finga\Documents\tasuki-cards`. Create the folder if it doesn't exist. Install dependencies with npm inside the project folder only. Don't install anything system-wide.
- Run `git init` and commit after each milestone.
- Clone https://github.com/AlanLyttonJones/Age-Grade-Tables into `C:\Users\finga\Documents\tasuki-cards-data` for the age-grading tables, as section 3.4 of the spec says. If the clone fails, use the spec's fallback table and mark ratings provisional.
- Work through the milestones in section 10, in order. Don't stop to ask questions. Where something is unclear, take the simplest reasonable option, keep it configurable, and log it in `DECISIONS.md`.
- If you run short of context, stop at the last milestone that fully works and say clearly what is and isn't done.
- Never put real student names in code, tests or demo data. Demo names must be obviously invented.
- Run the unit tests, plus every acceptance check in section 11 that you can automate. Report the results honestly.

## Delivery

1. Build the single-file HTML (`dist-single\tasuki-cards.html`). Also copy it to `C:\Users\finga\Documents\tasuki-cards\TASUKI-CARDS-OPEN-ME.html` so Fabian can double-click it.
2. Write `C:\Users\finga\Documents\tasuki-cards\BUILD-REPORT.md` covering:
   - what was built in each milestone
   - test results
   - what's provisional
   - up to 5 open questions for Fabian
   - the next three steps
3. Finish with a short summary in plain British English for a busy coach. Say where the file is, that the first thing to do is import the roster, and anything that failed.

---

# Tasuki Cards — Build Spec v1 (Stage 1)

Owner: Fabian Loke, Head of Trail Running, Harrow International School Appi Japan.
This spec reconciles four research reports and the coach's decisions. Where earlier documents conflict with this one, this one wins.

---

## 0. How to work (read first, builder)

- You are building unattended. Do not stop to ask questions. When something is unclear, choose the simplest reasonable option, keep it configurable, and log it in `DECISIONS.md`.
- Build in the milestone order in section 10. Each milestone must work end to end before you start the next, so a partial build is still useful.
- Stack: Vite + React + TypeScript. IndexedDB via Dexie. Vitest for tests. No backend, no accounts, no API keys, no runtime network calls (bundle fonts or use system fonts). Also produce a single self-contained HTML build with `vite-plugin-singlefile`.
- Put all persistence behind a `Store` interface (`src/store/`) so a shared database can replace IndexedDB later without touching UI or engine code.
- Put all scoring in pure functions in `src/engine/` with unit tests. UI components never calculate ratings themselves.
- Every constant in section 3 lives in one versioned `config` object, editable in Settings (section 8). Derived ratings record the config version they were computed with.
- Demo data must be obviously fictional (invented names). Provide "Load demo data" and "Clear all demo data" buttons. Real students arrive only through import. Never put real student names in code or tests.
- Raw measurements are stored exactly as entered, separately from derived ratings. Every rating must be reproducible from inputs + config version.
- Any rating based on a provisional table or formula shows a small "provisional" marker in the coach view (not on printed cards).

---

## 1. What this is

Tasuki Cards turns the academy's results into trading cards and leaderboards that students chase. The coach enters or pastes a result once; every rating, personal best, streak, badge, card and board updates automatically. Race performance is the headline. Year 7s must be able to compete fairly with Year 13s and staff. Improvement and participation are rewarded visibly, but never inflate ability ratings. Nothing may reward unsafe training.

Stage 1 is a coach-operated tool on the coach's laptop. Student logins, a shared database and phone customisation are Stage 3 and must not be built now, but the data model must allow them.

---

## 2. Data model

**Athlete**
- `id` (uuid, permanent; names are never keys)
- `givenName`, `familyName`, `preferredName`
- `aliases: string[]` — any script (romaji, kanji, katakana), any order, nicknames, typos learned from imports
- `sex: 'M' | 'F'`
- `yearGroup: 'Y7'…'Y13' | 'Staff'`
- `dob?: string` (ISO date, coach-only, never displayed on cards or boards)
- `displayMode: 'full' | 'first_initial' | 'alias'`, `publicAlias?: string`
- `absoluteBoardOptOut: boolean` (still appears on In-Form, Streak and Surge boards)
- `house?: string`
- `avatar: { seed, skinTone, hairStyle, hairColour, kitColour, accessory }`
- `active: boolean`, `notes?: string`

**Course** (fixed, repeatable routes and tests)
- `id`, `name`, `kind: 'circuit' | 'climb' | 'descent' | 'nav' | 'race_course' | 'other'`
- `distanceKm`, `climbM`, `terrainFactor` (default 1.00)
- `benchmarkMode: 'age_grade' | 'fixed'`; for fixed: `t99OpenM?`, `t99OpenF?` (seconds, 18–30-year-old standard)
- `version`, `notes`
- Seed one course: "Campus Circuit", circuit, 1.30 km, climb 0, age_grade.

**Event**
- `id`, `name`, `date`, `kind: 'race' | 'relay' | 'parkrun' | 'time_trial' | 'session' | 'test'`, `courseId?`, `distanceKm?`, `climbM?`, `official: boolean`, `notes`

**Performance**
- `id`, `athleteId`, `eventId?`, `date`
- `kind: 'race' | 'relay_leg' | 'parkrun' | 'long_run' | 'circuit' | 'climb' | 'descent' | 'bleep' | 'nav' | 'arm'`
- `distanceKm?`, `climbM?`, `timeSec?`, `place?`, `fieldSize?`, `category?`
- relay: `legNumber?`, `teamName?`, `racedEarlierSameDay?: boolean`
- bleep: `bleepLaps?`
- nav: `navErrors?`, `navVariant?`, `routeKmEff?`
- arm: `arm?: { ankleCm?, calfReps?, storkSec?, hopStickBothLegs?: boolean }` (all "weaker side")
- descent: `cleanRun?: boolean`
- `verified: boolean` (coach entry defaults true; student-reported defaults false until the coach ticks it)
- `source: 'coach' | 'paste' | 'voice' | 'form'`, `rawInput: string`
- `history: { at, by, before, after, reason }[]` (corrections are never destructive)

**Participation**: `{ athleteId, isoWeek, type: 'circuit' | 'saturday_run' | 'freeze', date }`. Circuit performances create participation automatically.

**Calendar**: list of holiday weeks (they neither count toward nor break a streak), half-term boundaries (one freeze allowed per half-term).

**Manual achievement**: `{ id, athleteId, type: 'expedition' | 'custom', name, date, icon }` (e.g. "Matsushima Escape 2026").

All other achievements are derived, not stored.

---

## 3. Scoring engine (`src/engine/`)

### 3.1 Time parsing
Accept and unit-test at least: `16:15`, `1:02:33`, `16.15` (when context is a time column), `16m15s`, `16m 15s`, `16 min 15`, `975s`, `7'45"`, `7′45″`, full-width digits `１６：１５`, spoken forms from dictation like `seven fifty five`, `eight minutes ten`, `one hour two minutes thirty three`. Reject implausible values with a warning, never silently.

### 3.2 Age on a date
- With `dob`: decimal age = (date − dob) / 365.25 days.
- Without `dob` (expected for most students): estimate from year group. Age on 1 September of the academic year: Y7 = 11, Y8 = 12, … Y13 = 17. Add 0.5 (mid-year birthday) plus the fraction of the year elapsed since 1 September. Show "estimated age" in the coach view.
- Staff without `dob`: 30.

### 3.3 Effective distance
`D_eff = (distanceKm + climbM / 100) × terrainFactor` (ITRA km-effort convention; terrainFactor from the course or the performance, default 1.00).

### 3.4 Age-graded standard time
Source: Alan Jones age-grading road tables, public domain, `https://github.com/AlanLyttonJones/Age-Grade-Tables`.
- At build time, `git clone` the repo. Use the most recent male and female **road** standard tables (2025 if present). Convert to JSON in `src/engine/data/` and record the commit hash, file names and date in `DECISIONS.md`.
- `Std(age, sex, D)`: the age- and sex-specific standard time in seconds at distance D.
  - Between table distances: interpolate log(time) against log(distance).
  - Below the shortest table distance (expected to be 1 mile): extrapolate along the log-log slope between the two shortest distances.
  - Above the longest: extrapolate along the slope of the two longest.
  - Decimal age: interpolate linearly between single-year columns. Ages below the table's minimum use the minimum.
- **Fallback if the clone fails:** use this provisional table and mark every age-graded rating provisional.
  - Open 5 km standard: M 769 s, F 834 s. Distance scaling from 5 km: exponent 1.10 for D ≤ 5 km, 1.06 for D > 5 km.
  - Age factor (multiply speed; i.e. `Std = OpenStd / AF`), linearly interpolated:
    - M: {10: 0.837, 11: 0.855, 12: 0.882, 13: 0.910, 14: 0.940, 15: 0.966, 16: 0.985, 17: 0.994, 18–30: 1.000, 35: 0.985, 40: 0.955, 45: 0.920, 50: 0.885, 55: 0.848, 60: 0.810}
    - F: {10: 0.855, 11: 0.878, 12: 0.905, 13: 0.930, 14: 0.952, 15: 0.968, 16: 0.982, 17: 0.992, 18–30: 1.000, 35: 0.982, 40: 0.952, 45: 0.915, 50: 0.875, 55: 0.835, 60: 0.795}
- `AG% = Std(age, sex, D_eff) / timeSec`.

### 3.5 Run Score (the universal 40–99 number)
`RunScore = clamp(round(99 × AG% / anchorAG), 40, 99)`, `anchorAG = 0.80` (config). 80% age grade ("national class") = 99.

### 3.6 Fixed-benchmark courses
For courses with `benchmarkMode = 'fixed'` (default for descents; optional for others):
`ageAdj = Std(age, sex, 5) / Std(25, sex, 5)` (≥ 1 for juniors and older staff)
`Score = clamp(round(99 × (t99Open(sex) × ageAdj) / timeSec), 40, 99)`.
If the coach has not set `t99Open` for that course and sex, the stat stays locked with the message "set this course's benchmark in Settings".

### 3.7 Freshness ("the Ronaldo rule")
For every performance: `monthsOld` at the as-of date (default today).
- `monthsOld ≤ 6`: no penalty.
- `6 < monthsOld ≤ 24`: penalty = `(monthsOld − 6) × 1` point (config: `decayPointsPerMonth = 1`, `decayGraceMonths = 6`).
- `monthsOld > 24`: excluded from current ratings (config `expireMonths = 24`), kept forever in the Career Vault and PB lists.
`FreshScore = clamp(Score − penalty, 40, 99)`. Cards show the date of the performance behind each stat.

### 3.8 Growth Shield
Config `growthShield = true`. If the athlete's streak is active or frozen, each displayed stat = `max(current, peak12m − 2)`, where peak12m is the highest unpenalised score for that stat in the last 12 months.

### 3.9 Stats
Each stat is either a number or **locked** (with a one-line "how to unlock"). Never manufacture a number.

- **RACE (headline banner, not part of OVR):** verified performances of kind `race`, `relay_leg`, `parkrun`. Use FreshScores (RunScore by default; a race course set to fixed mode uses 3.6). Top three weighted 0.50/0.30/0.20; two races 0.60/0.40; one race 1.00. Locked if none.
- **SPD:** best FreshScore on any course of kind `circuit`. Locked if none.
- **END:** `max(bleepRating, longRunRating)`.
  - `bleepRating`: laps → percentile using the table below for the athlete's sex and floor(age) (18+ uses 18; under 11 uses 11). Interpolate linearly between percentile points; below P5 interpolate from 0 laps = P0. Rating = `clamp(round(40 + 0.59 × P), 40, 96)` up to P95; above P95, linear from 96 at L_P95 to 99 at 1.20 × L_P95.
  - Provisional table (laps of the 20 m shuttle run; columns P5, P10, P20, P30, P40, P50, P60, P70, P80, P90, P95), attributed to Tomkinson et al. 2017, BJSM, international 20 m shuttle run norms. Mark provisional until verified; log in DECISIONS.md that it needs checking against the paper.
    - Boys 11: 9, 15, 22, 27, 31, 36, 40, 45, 51, 60, 67
    - Boys 12: 9, 16, 24, 29, 34, 39, 45, 50, 57, 67, 75
    - Boys 13: 11, 18, 26, 33, 39, 44, 50, 56, 64, 75, 84
    - Boys 14: 13, 20, 29, 36, 43, 48, 55, 62, 70, 81, 92
    - Boys 15: 14, 22, 31, 39, 45, 52, 58, 66, 74, 86, 97
    - Boys 16: 15, 23, 33, 41, 48, 54, 61, 69, 78, 91, 102
    - Boys 17: 16, 25, 35, 43, 50, 57, 64, 72, 81, 95, 107
    - Boys 18+: 17, 26, 37, 45, 52, 60, 67, 75, 84, 99, 112
    - Girls 11: 6, 11, 16, 21, 24, 28, 31, 35, 40, 46, 52
    - Girls 12: 5, 10, 16, 21, 25, 28, 32, 36, 41, 48, 54
    - Girls 13: 5, 10, 17, 21, 25, 29, 33, 37, 42, 50, 56
    - Girls 14: 5, 10, 17, 21, 25, 29, 33, 38, 43, 50, 57
    - Girls 15: 5, 10, 17, 22, 26, 30, 34, 38, 44, 51, 58
    - Girls 16: 5, 10, 17, 22, 26, 30, 34, 39, 44, 52, 59
    - Girls 17: 5, 11, 17, 22, 26, 30, 35, 39, 45, 53, 60
    - Girls 18+: 5, 11, 17, 22, 26, 30, 35, 40, 46, 54, 61
  - `longRunRating` (config `endAllowLongRuns = true`): best FreshScore among verified `race`, `relay_leg`, `parkrun`, `long_run` performances with `D_eff ≥ 5.0` km (config).
  - The card shows which pathway set END ("from bleep test, 10 Nov" or "from 10 km, 12 Aug").
- **CLB:** best FreshScore on a course of kind `climb` (age_grade mode using D_eff; the coach can tune that course's terrainFactor).
- **DSC:** best FreshScore on a course of kind `descent` (fixed mode). A performance with `cleanRun = false` is stored and visible but never scored.
- **NAV (provisional):** `refPace` = the athlete's best-ever Circuit pace in s/km (a PB, so jogging a later test cannot help); if no Circuit, best verified race pace with D_eff ≤ 5 km; else locked.
  `predicted = routeKmEff × refPace × navAllowance` (`navAllowance = 1.15`, config)
  `eff = predicted / (timeSec + navPenaltySec × navErrors)` (`navPenaltySec = 120`)
  `NAV = clamp(round(40 + 59 × (eff − 0.5) / 0.5), 40, 99)`; `navErrors ≥ 3` → 40. Best FreshScore counts.
- **ARM (Armour):** three domains, levels 1–5, scored on the weaker side; thresholds in config and marked provisional.
  - Ankle (knee-to-wall, cm): L1 ≥ 5, L2 ≥ 8, L3 ≥ 10, L4 ≥ 12, L5 ≥ 14.
  - Calf (single-leg heel raises, full range, steady tempo, capped count): L1 ≥ 10, L2 ≥ 15, L3 ≥ 20, L4 ≥ 25, L5 ≥ 30.
  - Balance and landing (eyes-closed single-leg stance, seconds): L1 ≥ 5, L2 ≥ 10, L3 ≥ 20, L4 ≥ 30, L5 = L4 and hop-and-stick passed on both legs.
  - Each domain uses the best level achieved in the last 12 months (ARM never falls on a bad retest).
  - `ARM = round(40 + (sumOfLevels − 3) × 59 / 12)` once all three domains have a level; otherwise locked, showing which domains are missing.
- **OVR:** round(mean of the unlocked stats among SPD, END, CLB, DSC, NAV, ARM). Show "n/6". If fewer than 2 are unlocked, show "—".

### 3.10 Tiers and In-Form
- Bronze: OVR < 65. Silver: 65–74. Gold: OVR ≥ 75 **and** at least 1 race cap (otherwise shown as Silver). Icon: at least 3 race caps **and** RACE ≥ 85.
- In-Form: any PB in the last 7 days — a raw PB on the same course/test/distance, or a new best RunScore for that stat. The card gets the special In-Form style for that week and shows "PB −12 s".

### 3.11 Streak
- Weeks run Monday–Sunday, Asia/Tokyo.
- A week counts if the athlete has a Circuit performance or a `saturday_run` participation.
- Holiday weeks are skipped (they neither count nor break a streak). A verified parkrun or long run in a holiday week adds a "holiday bonus" flame but doesn't change the count.
- One freeze per half-term, applied by the coach.
- Track `currentStreak` and `bestStreak`.

### 3.12 Tasuki Surge (relay legs)
- Baseline: the athlete's best verified solo performance in the 90 days before the relay (race, parkrun or Circuit), converted to the leg's distance: `Tpred = Tsolo × (DlegEff / DsoloEff)^1.10 × (racedEarlierSameDay ? 1.02 : 1.00)`. Use whichever baseline gives the fastest prediction.
- `TS% = (Tpred − Tleg) / Tleg × 100`. Bronze ≥ +3.0%, Gold ≥ +5.0%.
- Course sanity gate: if the median TS% across academy runners on legs of the same event and distance is above +2.0%, subtract (median − 0.7) from everyone's TS% for that event.
- No baseline → show the leg time only, no surge.
- Surge is a badge and its own board. It never changes RACE or OVR.

### 3.13 Derived badges
Race caps ★ (verified `race` and `relay_leg`); parkrun counter; distance badges (first verified 5K, 10K, half marathon, marathon, ultra > 42.2 km); Mountain badge (a verified run with ≥ 1,000 m climb); streak milestones (4, 8, 12, 20 weeks); ARM level-ups; Tasuki Surge bronze/gold; course record holder (raw, by sex and year band); expedition badges (manual). Racing more earns caps and badges, never rating points.

### 3.14 Circuit handicap start sheet
For the next Circuit: `offset_i = slowestPB − PB_i`, rounded to 5 s. Runners without a PB start with the first wave (offset 0). Printable as a start list in start order.

---

## 4. Input — the most important feature

### 4.1 Quick Entry
One screen, phone-friendly:
- athlete picker (type-ahead on any alias, any script)
- date (default today)
- kind; course (pre-fills distance and climb)
- the relevant measurement (time, laps, ARM measures, NAV errors)
- verified tick
- **live preview**: "SPD 71 → 74, new PB −9 s, In-Form" before saving.

### 4.2 Paste-and-Match
One large text box. Accepts:
1. copied results tables from race websites, PDFs and Excel (tabs, commas, runs of spaces; Japanese headers such as 順位 氏名 所属 記録 タイム)
2. the Tasuki line format (4.3)
3. Microsoft Forms / Google Forms CSV exports (students reporting holiday results)

Flow:
1. Pick or create the event (or read it from `#` header lines).
2. Parse rows; detect columns heuristically (time pattern, place = small integer, name = text).
3. Match names to the roster.
4. Show a review table: parsed name; proposed athlete; match type (exact alias / normalised / fuzzy suggestion / unmatched / outsider); time; distance; warnings (duplicate of an existing performance, implausible pace faster than 2:30/km or slower than 12:00/km, two athletes matched, missing time).
5. Outsiders (non-roster competitors) are not stored as athletes, but are counted for field size, and the category winner's time is kept on the event for reference.
6. **Nothing commits until the coach approves.** Fuzzy matches are suggestions only. When the coach confirms a fuzzy or manual match, store that string as a new alias.

Name normalisation: lowercase; strip punctuation and diacritics; full-width to half-width; collapse spaces; try both "Given Family" and "Family Given" orders; support initials ("Takuto K", "T. Kobori"); treat hiragana and katakana as equivalent; kanji matches only via stored aliases. Fuzzy suggestions: Jaro–Winkler ≥ 0.88.

### 4.3 Tasuki line format
Document this on an in-app Help page. Claude prepares imports in this format, so the parser must handle it exactly.

```
# event: Hachimantai Ekiden | 2026-11-01 | relay_leg | 2.0 km | climb 20 m
Aiko Tanaka, 8:10, leg 2, team Peregrine
Ken S, 7:55, leg 4, team Golden Eagle, raced earlier
# event: Campus Circuit | 2026-11-04 | circuit
Ben Carter 4:52
# event: Higashi-Matsushima XC | 2026-11-29 | race | 4.0 km | place 7/23
Aiko Tanaka 16:15
# test: bleep | 2026-11-10
Ben Carter 64 laps
# test: arm | 2026-11-10
Aiko Tanaka ankle 11 calf 18 stork 22 hop yes
# participation: saturday_run | 2026-11-07
Aiko Tanaka, Ben Carter
# event: Chiang Mai Trail 64K | 2026-12-20 | race | 64 km | climb 2800 m
Coach Example 9:45:00
```

### 4.4 Voice
- A microphone button (Web Speech API; language selectable en-GB / ja-JP) dictates into the Paste-and-Match box.
- The same parser handles it, including spoken times. Dictation always produces a draft for review, never a saved result. No audio is stored.
- Hide the button where the API is unsupported.

### 4.5 Roster import
Paste tab- or comma-separated rows with interactive column mapping. It must handle the school's spreadsheet layout (`Surname | Preferred Name | …`) and simple lines `Surname, Preferred name, Year, Sex[, DOB][, alias; alias]`. Duplicate detection on name + year.

### 4.6 Corrections
Any performance can be edited or deleted with a reason. History is kept, and everything dependent recalculates.

---

## 5. Cards and avatars

**Card**
- Standard trading-card size: 63 × 88 mm.
- Top: big OVR, tier, year group, display name (per displayMode).
- **RACE banner**: rating, ★ caps, and the best race line (e.g. "Hachimantai XC 4 km · 16:15").
- The avatar.
- Six stats: a locked stat shows a lock and a 3-word unlock hint.
- Streak flame count; badge row (up to 5 icons).
- Footer: "Tasuki Cards · Harrow Appi Trail Running".
- An original diagonal tasuki-sash motif across the card.
- Styles: Bronze, Silver, Gold, Icon, and a special In-Form style.
- Do not copy any existing trading-card or video-game design.

**Avatar**
- An original, modular SVG runner in a clean, anime-inspired, flat-colour style. No photos, and no copyrighted characters or styles.
- Components: skin tone (6), hair style (8), hair colour (6), kit colour (academy and house palette), accessory (cap, headband, glasses, none).
- The default is generated deterministically from the athlete id; the coach can edit it on the athlete page.
- Unlocks driven by data:
  - NAV ≥ 70: compass in hand; ≥ 85: compass floating above the hand
  - ARM ≥ 70: ankle guards; ≥ 85: armour glow
  - SPD ≥ 70: motion lines; ≥ 85: lightning trail
  - CLB ≥ 75: contour-line wings
  - DSC ≥ 75: dust burst at the feet
  - 1+ race cap: tasuki sash; 3+ caps: gold-edged sash
  - Tasuki Surge: flame on the sash
  - streak ≥ 8: headband
- Never link body type or skin tone to any rating.

**Print studio**
- Select cards: all, In-Form this week, year group, or hand-picked.
- Lay out A4 portrait 3 × 3 with crop marks, using `@media print`.
- Verify in Chrome print preview at 100% scale that nothing clips.

---

## 6. Boards (screen, projector mode, A4/A3 print)

- **RACE rating board**
- **SPD raw Circuit times**, by sex and year band (Y7–8, Y9–11, Y12–13, Staff)
- **Course records** for each course
- **END** (bleep laps and rating)
- **In-Form this week**: everyone with a PB, showing the improvement
- **Streak board**: everyone on 2+ weeks
- **Tasuki Surge board** (after a relay)
- **Caps board**

Absolute boards show the top 10 by default (toggle to full) and exclude `absoluteBoardOptOut` athletes. In-Form, Streak and Surge boards show everyone. Names follow each athlete's displayMode.

---

## 7. Athlete page and Career Vault

- The card.
- Stat history sparklines.
- Every performance, with source and verification.
- PBs by course and distance.
- Badges.
- The streak calendar.
- An all-time Career Vault, including expired results.

---

## 8. Settings (coach calibration)

- Every constant above is editable.
- Changing a value shows an impact preview ("14 ratings change; largest +4 for …") before applying.
- Config is versioned.
- Holiday weeks and half-terms are set here.
- Course management lives here too (create, edit, set fixed benchmarks).

---

## 9. Persistence and safety

- IndexedDB (Dexie), with autosave and a visible "Saved" indicator.
- One-click **Export everything (.json)** and **Import (.json)** (replace or merge), covering roster, aliases, performances, config, badges and avatars.
- A weekly backup reminder banner.
- No network requests at runtime.
- DOB never appears on cards, boards or exports labelled "for printing".

---

## 10. Milestones (in order)

1. **Engine and tests:** time parser, name matcher, age and standards (real tables), RunScore, freshness, every stat, tiers, streaks, Surge, badges. Unit tests for each, with worked examples.
2. **Roster, Quick Entry, Paste-and-Match, persistence, export/import, corrections.**
3. **Cards, avatars, print studio.**
4. **Boards, projector mode, print.**
5. **In-Form, streak calendar, Tasuki Surge board, handicap start sheet, badges UI.**
6. **Voice input, settings impact preview, Help page (including the line format), polish.**

**Stage 2 (do not build now; leave hooks):** NAV butterfly course generator (needs basket coordinates), termly report paragraph drafts, ekiden line-up advisor.

**Stage 3:** shared database, student logins and avatar customisation, student view.

---

## 11. Acceptance tests (must pass before you call it done)

- Paste a messy fictional results table containing outsiders, family-name-first names, initials, a typo, a duplicate row, a katakana name with a stored alias and a missing time. Correct matches are proposed, the duplicate and missing time are flagged, and nothing commits before approval.
- Approving updates the athlete pages, cards and boards. Correcting a time recalculates PBs, ratings and rankings, and keeps history.
- Export → clear → import restores everything identically.
- Nine cards print on one A4 sheet with no clipped names, stats or borders.
- Locked stats never show numbers. Provisional ratings are marked in the coach view.
- Unit tests cover: 20+ time formats; age-grade lookup spot-checked against the source table; one worked RunScore per stat; freshness at 3, 12 and 30 months; ARM levels; a streak across a holiday week and a freeze; a Tasuki Surge example including the sanity gate.
- Demo data is fictional; "Clear all demo data" leaves an empty app.

---

## 12. Deliverables

- Source in a git repository with `README.md`, `DECISIONS.md` (every choice made, the table source and commit, and open questions for the coach) and `HOW-TO-USE.md` (one page for the coach: first import, weekly routine, printing, backups).
- `dist-single/tasuki-cards.html` (works by opening the file in Chrome).
