# Tasuki Cards: build report (Stage 1)

Built 22–23 Oct 2026 in `C:\Users\finga\Documents\tasuki-cards`, one git commit per milestone.
**Open the app:** double-click `TASUKI-CARDS-OPEN-ME.html` (a copy of `dist-single\tasuki-cards.html`, about 640 KB, works offline in Chrome).

## What was built

| Milestone | Commit | What it delivers |
|---|---|---|
| Scaffold | `2e027ca` | Vite + React + TypeScript project, pinned dependencies, the Alan Jones 2025 road age-grade tables converted to JSON, shared data model and config. |
| 1 · Engine and tests | `b58e80e` | Time parser (colon, unit, prime, full-width, Japanese and spoken forms), name matcher (aliases in any script, kana ≡ kana, initials, Jaro–Winkler suggestions), age on a date, age-graded standards, RunScore, fixed benchmarks, freshness, Growth Shield, all six stats plus RACE and OVR, tiers, In-Form, streaks with holidays and freezes, Tasuki Surge with the sanity gate, PBs, course records, badges, handicap, boards, fictional demo data. |
| 2 · Input and persistence | `e3ff17a` | Roster import with column mapping and duplicate detection; athlete editor; Quick Entry with a live preview; Paste & Match for results tables (incl. Japanese headers), the Tasuki line format and Forms CSV, with a review table (match type, duplicates, implausible pace, two athletes matched, missing time, outsiders); alias learning; corrections with reasons and history; IndexedDB autosave with a "Saved" indicator; export and import (replace or merge); demo data load and clear; events; weekly backup reminder. |
| 3 · Cards, avatars, print | `336afa0` | Original 63 × 88 mm card (Bronze, Silver, Gold, Icon, In-Form) with the tasuki sash motif; modular SVG runner avatar with data-driven unlocks and an avatar editor; Print Studio (everyone, In-Form, year group, hand-picked) printing 3 × 3 on A4 with crop marks. |
| 4 · Boards | `eedf5ef` | RACE, SPD (by sex and year band), course records, END, In-Form, Streaks, Tasuki Surge and Caps boards; top 10 / everyone; opt-outs; projector mode; A4/A3 printing. |
| 5 · In-Form, streaks, Surge, handicap, badges | `35ced94` | Circuit handicap start sheet in waves; coach-applied streak freezes (one per half-term, with warnings); manual expedition achievements for one or many athletes. In-Form, the streak calendar, the Surge board and badges shipped with milestones 2–4. |
| 6 · Voice, settings, help, polish | final commit | Dictation (English or Japanese) into Paste & Match; Scoring constants editor covering every constant, with an impact preview ("104 ratings change for 26 athletes; largest −3 for …") and version history; Help page (line format, how ratings work, privacy); phone-friendly Quick Entry; this report, `HOW-TO-USE.md`, `README.md`. |

## Test results

- **Unit tests: 598 passed, 0 failed** (15 files, Vitest), plus a clean TypeScript typecheck.
- **Print check: 9 / 9 passed** (`npm run check:print`, headless Chrome on the single-file build opened from disk).

| Acceptance test (spec 11) | How it was checked | Result |
|---|---|---|
| Messy table: outsiders, family-name-first, initials, a typo, a duplicate row, katakana with a stored alias, a missing time. Correct proposals, duplicate and missing time flagged, nothing commits before approval. | Automated (`src/engine/parse/parse.test.ts`), plus a manual run in the browser | Pass |
| Approving updates athlete pages, cards and boards; correcting a time recalculates PBs, ratings and rankings and keeps history | Automated at engine level (`parse.test.ts`, `derive.test.ts`); checked by hand in the browser (paste → approve → athlete page and boards) | Pass |
| Export → clear → import restores everything identically | Automated against a simulated IndexedDB (`src/store/store.test.ts`). The real file picker was not automated. | Pass |
| Nine cards on one A4 sheet with no clipped names, stats or borders | Automated: Chrome prints the demo cards to PDF at 100% scale. Every card measures 63 × 88 mm inside its sheet, no text overflows, one A4 portrait page per 9 cards. The printed sheet was also inspected visually (`test-output/sheet1-print.png`). | Pass |
| Locked stats never show numbers; provisional ratings marked in the coach view | Automated (`derive.test.ts`, print check: no numbers in locked cells, markers hidden in print) | Pass |
| Unit tests cover 20+ time formats, age-grade spot checks against the source table, a worked RunScore per stat, freshness at 3/12/30 months, ARM levels, a streak across a holiday week and a freeze, and a Surge example with the sanity gate | Automated (`time`, `standards`, `scoring`, `stats`, `streak`, `surge` tests) | Pass |
| Demo data is fictional; "Clear all demo data" leaves an empty app | Automated (`derive.test.ts`: every record tagged, every name on an invented-name list, clearing leaves only the seeded Campus Circuit) | Pass |
| Data persists when the file is opened from disk | Automated (load demo data, reload, still there, IndexedDB in use) | Pass |
| No network requests at runtime | The built file was scanned: no external scripts, styles, fonts or fetches | Pass (dictation excepted, see below) |

**Not automated:** React screens have no component tests; they were checked by hand in the browser (roster, athlete page, Quick Entry preview, Paste & Match approve, boards, projector, handicap, scoring preview, phone width). Dictation was not tested with a real microphone. The Chrome print dialog itself is a manual step; the automated check uses the same print engine at 100% scale.

## What's provisional

- **Bleep test norms** (END from the bleep test): the spec's table attributed to Tomkinson et al. 2017 has not been checked against the paper. Shown with a "prov" marker.
- **NAV** formula and **ARM** thresholds: provisional as the spec says. Shown with "prov".
- **Surge sanity gate minimum group size (3)**: my addition, explained in `DECISIONS.md` (open question 1).
- **Age-grade standards are not provisional**: the clone worked (commit `4aac673`, 2025 road tables). The Campus Circuit (1.3 km) is shorter than the shortest table distance (1 mile), so its standard is extrapolated along the 1 mile–5 km slope, as the spec says.
- **Dictation** uses Chrome's built-in speech recognition, which sends audio to Google's speech service, so it needs internet and microphone permission. The app itself stores no audio and makes no network calls.
- **Demo courses** (climb, descent, nav loop) and their benchmarks are invented; real courses and descent benchmarks need setting.

## Open questions for Fabian

1. **Tasuki Surge sanity gate**: as written, a runner alone on their leg distance is their own median, so they could never medal. I applied the gate only when at least 3 legs on the same event and distance have a baseline (Settings → Scoring → Tasuki Surge). Is 3 right, or should the gate compare against a course history instead?
2. **Verified only**: I made *every* stat count only verified results (the spec says "verified" for RACE, END and the NAV reference). Student-reported results wait until you tick them. OK?
3. **Growth Shield on RACE**: I applied the shield to the six OVR stats but not to RACE, because RACE blends up to three races and lifting it to one race's peak would distort it. Do you want it on RACE too?
4. **Bleep test**: are your "laps" 20 m shuttles (the table's unit)? And can the norms be checked against Tomkinson et al. 2017 so the "prov" marker can come off?
5. **Year groups**: they don't roll over automatically in September. Re-import the roster, or edit year groups, at the start of each year. Would you like an automatic roll-over (with Y13s marked inactive) instead?

## Next three steps

1. **Go live**: clear the demo data, import the real roster, add aliases (kanji and katakana) for students whose names appear that way in results, set the half-terms and holiday weeks, and add the real climb, descent and nav courses with descent benchmarks.
2. **Calibrate**: answer the open questions above, check the bleep norms and ARM thresholds, then use Settings → Scoring constants (the impact preview shows exactly what changes) and remove the provisional flags where appropriate.
3. **Run two or three weeks**, then review: card wording, board choices, and whether the anchor (80% age grade = 99) feels right for the squad. Then plan Stage 2 (NAV butterfly course generator, termly report drafts, ekiden line-up advisor). The data model already has the hooks.

## Build environment notes

- **Node.js 24 was not installed** on the laptop. An official, OpenJS-signed Node 24.19 found in the Codex runtime folder was copied into `.tools/`, and npm 11.21 was downloaded from the npm registry (integrity-checked). Nothing was installed system-wide. To work on the project normally later, install **Node.js 24 LTS** from nodejs.org.
- **Memory**: the laptop runs close to its memory commit limit (as little as 0.3–0.8 GB free with WSL/Docker, several Claude and ChatGPT windows open). Parallel test runs crashed, so tests run one worker at a time. If Chrome or the app ever feels slow, closing Docker/WSL frees about 4 GB.
- For the in-app preview, a launch config was written to `C:\Users\finga\Documents\.claude\launch.json`. It is not part of the app and can be deleted.
