# Decisions log

Every choice made while building unattended, why, and what is configurable. Open questions for the coach are at the end.

## Build environment

- **Node.js was not installed system-wide** (the brief expected Node 24). An official Node v24.19.0 binary, signed by the OpenJS Foundation, was already on the laptop inside the Codex runtime cache (`~/.cache/codex-runtimes/.../node.exe`). It was copied into `tasuki-cards/.tools/node/`. npm 11.21.0 was downloaded from registry.npmjs.org (sha512 integrity verified) into `tasuki-cards/.tools/npm/`. Nothing was installed system-wide and nothing was added to PATH; `.tools/` is git-ignored. In Git Bash, `source .tools/env.sh` puts both on PATH for that shell. After installing Node 24 LTS normally, `npm install` and `npm run build:single` work without `.tools`.
- **Pinned dependency versions**, each published at least two weeks before the build (exact versions in `package.json`). **Vite 7.3.7, not Vite 8**: Vite 8 bundles with Rolldown, while `vite-plugin-singlefile` 2.3.3 needs Rollup 4, and the single-file HTML is a hard deliverable. TypeScript 5.9.3 (most widely compatible), React 19.3.0, Dexie 4.4.6, Vitest 5.0.3.
- npm 11's new install-script gate skipped esbuild's `postinstall` (a binary self-check only). The platform binary `@esbuild/win32-x64` installs as an optional dependency and was verified to work.

## Age-grading tables (spec 3.4)

- **Source:** Alan Jones road age-grading standards, public domain, https://github.com/AlanLyttonJones/Age-Grade-Tables, cloned to `C:\Users\finga\Documents\tasuki-cards-data`.
- **Commit:** `4aac6737cb9f216c90a0a610355667cd3d921c61` (committed 2025-07-27, "Updated AgeGrade.1mi file for RunScore").
- **Files:** `2025 Files/MaleRoadStd2025.xlsx` (sheet `AgeStdSec`, "Version 2025-07-27") and `2025 Files/FemaleRoadStd2025.xlsx` (sheet `AgeStanSec`). These are the most recent road standard tables (2025, approved by USATF MLDR on 2025-01-10).
- **Converted** on 2026-10-22 by `scripts/convert-age-tables.mjs` (dependency-free xlsx reader) to `src/engine/data/ageGradeRoad2025.json`: ages 5–100 in single years, 22 distances from 1 mile to 200 km, standard times in whole seconds. Re-run with `npm run convert-tables`.
- The clone succeeded, so age-graded ratings are **not** provisional. The spec's fallback table is still implemented (Settings → age-grade table → "fallback (provisional)") and, when selected, marks every age-graded rating provisional.
- Spot checks (also unit tests): M14 5 km = 800 s, M25 5 km = 769 s, F12 5 km = 945 s, F25 5 km = 834 s, M50 10 km = 1783 s. The open 5 km standards (769 / 834 s) match the spec's fallback values.
- Interpolation follows the spec, not the source spreadsheet's internal method: log(time) against log(distance) between adjacent table distances; extrapolation below 1 mile along the 1 mile–5 km slope (so the 1.30 km Campus Circuit is extrapolated, e.g. M25 standard ≈ 180.4 s); linear in decimal age between single-year rows; ages below 5 use age 5.

## Data model (spec 2)

- The spec's `Event` type is called `TasukiEvent` in code, to avoid clashing with the browser's built-in `Event` type.
- `Performance` has an optional `courseId` (and an optional `terrainFactor` override). Quick Entry picks a course directly, and a stat such as SPD needs to know which course a Circuit result was run on. Resolution order: performance course, then the event's course.
- **Deleting a performance is a soft delete** (`deleted: true` plus a history entry with the reason). It is ignored by every calculation but kept, because the spec says corrections are never destructive.
- **Circuit participation is derived** from Circuit performances, not stored, so correcting or deleting a Circuit result can never leave a stale participation record. Only `saturday_run` and `freeze` participation is stored.
- `Athlete.yearGroupYear` (optional) records which academic year the year group refers to. Age estimates for results from earlier years then use the age the athlete had at the time. If absent, the academic year of the as-of date is used.
- Every record created by "Load demo data" carries `demo: true`, so "Clear all demo data" removes exactly those records and nothing imported.
- Outsiders (non-roster competitors in pasted results) are never stored. Only the field size and each category winner's time (no name) are kept on the event.
- `displayMode: 'first_initial'` shows "Aiko T."; `'alias'` shows the public alias, or the first-initial form if no alias is set.

## Scoring (spec 3)

- **Months old (freshness, spec 3.7)** means whole calendar months elapsed (a result from 15 Jan is 6 months old on 15 Jul). Ratings step down once a month rather than drifting daily, which is easier to explain to students.
- Course records and year bands use the athlete's year group **at the time of the run**, which is the recorded year group shifted by the number of academic years.
