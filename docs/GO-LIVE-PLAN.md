# Go-live plan (coach's brief, 5 Nov 2026)

Fabian's requirements after reviewing Stage 1. The next build session works through these in order. Each one ends with tests passing, a rebuild of `TASUKI-CARDS-OPEN-ME.html`, and a commit.

**Status (5 Nov 2026): all seven built**, one commit each, 723 unit tests and 9/9 print checks passing. Details and the choices made are in `DECISIONS.md` → "Go-live changes"; what to check by hand is in `BUILD-REPORT.md` → "Go-live build". One deliberate difference from the plan: `spd.raceMaxKmEff` is **3.5**, not 3.0, so that the plan's own example (a 3 km race with 40 m of climb = 3.4 km effort) counts for SPD.

## 1. Paste results in and get SPD, END and CLB straight away

- Today SPD only comes from the Campus Circuit, and CLB only from a climb course. Add **race pathways** (configurable, and explained on the athlete page):
  - **SPD from short races**: verified race, relay leg or parkrun with effective distance ≤ 3.0 km (`spd.raceMaxKmEff`). SPD = the best of Circuit and short races.
  - **CLB from hill races**: any verified timed run with climb ≥ 150 m and ≥ 50 m per km (`clb.raceMinClimbM`, `clb.raceMinClimbPerKm`). Scored on effective distance (the ITRA km-effort equation: distance + climb ÷ 100). The climb course still counts.
  - END already works from any race or long run of 5 km+.
- Where to change it: `perfFeeds()` in `src/engine/scoring.ts` decides which stats a result counts towards; `stats.ts` then picks the best per stat automatically. Update the lock hints and `basisLabel()` ("from Hachimantai Hill Race, 12 Oct").

## 2. Nothing provisional

- Turn off the provisional markers: `end.bleepProvisional`, `nav.provisional` and `arm.provisional` become `false` in `DEFAULT_CONFIG`.
- Add a one-off migration on load: if the stored current config still has them `true`, apply a new config version with them `false` and the note "Go-live: provisional markers removed", so the change is visible in the version history.
- Keep the spec tables as they are, but record in DECISIONS.md that the coach accepted them for go-live.

## 3. No spreadsheet needed: build the roster from pasted results

- In the Paste & Match review table, an unmatched or outsider row gets a **"New athlete"** action: the name as written (kanji is kept as an alias), with sex inferred from the category column (男子/女子, 男/女, M/F, Men/Women, Boys/Girls) and a year-group picker. One action is enough per runner.
- Add **"Our school"** names in Settings (e.g. `Harrow`, `ハロウ`, `安比`, `Appi`). Rows whose club column (所属 / Club / Team) matches become academy candidates ("New athlete?") instead of outsiders. Add a bulk button: "Add all N academy runners".
- The roster import stays for anyone who does have a spreadsheet.

## 4. Show the working behind every rating ("defensible, not a black box")

- Athlete page: click any stat for a plain-English breakdown generated from the data, for example:
  "SPD 84 comes from Hachimantai 3K on 12 Oct: 3.0 km + 40 m climb = 3.4 km effort. The world-standard time for a 13.6-year-old girl at 3.4 km is 13:21. Aiko ran 16:40, an age grade of 80.1%. Run Score = 99 × 80.1% ÷ 80% = 99. The result is 0 months old, so there is no freshness penalty."
  It also lists every result that was considered and why the others did not win (older, lower, unverified, not a clean run…).
- The results table gains columns for pace, effective distance, standard time, age grade %, score, freshness penalty and the stats fed.
- A shareable version a student can read (no DOB, display name only).
- Implementation: a pure `explainStat(athleteDerived, key, config)` in `src/engine/explain.ts`, unit-tested, used by the UI.

## 5. Descent benchmarks "against Mr Loke"

- Course editor (fixed-benchmark courses): **"Set the benchmark from a reference run"**. Pick the athlete (e.g. the coach), their time on the course, and what that run should score (default 90). Compute t99 for that athlete's sex with the existing age adjustment, and derive the other sex's value from the ratio of the open 5 km standards (834 / 769). Store the reference in the course notes so the benchmark is explainable.
- Race descent profiles stay out of DSC: technical descent courses dominate, as the coach said. Possible later idea: a weak descent signal from races with big descent, if it ever seems useful.

## 6. Orienteering (score-O, butterfly courses) → NAV

- The coach pastes orienteering results only: `# event: Butterfly O | 2026-11-12 | nav | 3.2 km | climb 60 m`, then one line per runner such as `Aiko Testfield 24:10 errors 1`. The route distance is taken from the header. This already parses.
- Make the reference speed available from **any** race. If there is no Circuit and no race ≤ 5 km, predict the route time from the athlete's best recent race at any distance using Riegel scaling (`T × (route / race distance)^1.06`, with the exponent in config). The explanation shows which race set the reference speed.
- Score-O variant: allow `points <n>` (and the time limit in the header) as a later extension. For now a score-O is entered as the coach's measured route km.

## 7. "Drop in data by whatever"

- Drag and drop files onto Paste & Match: `.csv` and `.txt` are read as text, and `.xlsx` reads the first sheet. Chrome has `DecompressionStream('deflate-raw')`, so no library is needed; port the zip reader from `scripts/convert-age-tables.mjs`. PDFs: keep copy and paste (selecting text in the PDF viewer works).

## Notes for whoever continues

- Run `npm install`, then `npm test` (598 tests) and `npm run build:single`. The print check (`npm run check:print`) needs Chrome installed.
- On a machine with Node 24 installed normally, ignore `.tools/`. On a machine with plenty of memory, `maxWorkers: 1` in `vite.config.ts` can be removed.
- Spec: `docs/TASUKI-BUILD-BRIEF.md` (the original brief and spec). Decisions so far: `DECISIONS.md`.
