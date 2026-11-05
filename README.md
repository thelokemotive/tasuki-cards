# Tasuki Cards

_Like FIFA cards, but for my trail runners._

Trading cards and leaderboards for Harrow International School Appi Japan Trail Running. Stage 1: coach-operated on one laptop. No accounts, no backend, no network calls at runtime.

- **Use it**: double-click `TASUKI-CARDS-OPEN-ME.html` (a copy of `dist-single/tasuki-cards.html`). See `HOW-TO-USE.md`.
- **Decisions and open questions**: `DECISIONS.md`. **What was built and tested**: `BUILD-REPORT.md`.

## Structure

- `docs/GO-LIVE-PLAN.md`: the coach's go-live requirements (all seven built, 5 Nov 2026).
- `src/engine/`: pure scoring functions with unit tests (time parsing, name matching, age-grading with the Alan Jones 2025 road tables, every stat, freshness, Growth Shield, tiers, streaks, Tasuki Surge, PBs, badges, handicap, boards). `deriveAll()` turns raw data plus a config version into every rating. UI code never calculates a rating itself.
- `src/engine/explain.ts`: the plain-English working behind every rating (athlete page and student sheet). `src/engine/benchmark.ts`: descent benchmarks from a reference run.
- `src/engine/parse/`: Paste-and-Match (plus `newAthletes.ts`, the roster from pasted results, and `xlsx.ts`, the dependency-free .xlsx reader): the Tasuki line format (`docs/LINE-FORMAT.md`), results tables, Forms CSV, roster import, and the import plan (review, then one change set).
- `src/store/`: persistence behind the `Store` interface (`dexieStore.ts` = IndexedDB via Dexie; `memoryStore.ts` for tests and as a fallback). Export and import live in `exportImport.ts`. A shared database can replace IndexedDB later by implementing `Store`.
- `src/ui/`: React screens. Every change goes through `commit(changes)` in `ui/data/DataContext.tsx`, which autosaves.
- `src/demo/demoData.ts`: obviously fictional demo data (every record is tagged `demo: true`).
- `scripts/convert-age-tables.mjs`: regenerates `src/engine/data/ageGradeRoad2025.json` from the cloned tables.
- `scripts/check-print.mjs`: automated print acceptance check using the installed Chrome.

## Develop

Node 24 + npm. This laptop had no system Node, so a project-local copy lives in `.tools/` (git-ignored). In Git Bash:

```bash
source .tools/env.sh
```

Then:

```bash
npm install
npm test               # unit tests (Vitest)
npm run dev            # dev server at http://localhost:5173
npm run build:single   # dist-single/tasuki-cards.html (one self-contained file)
npm run check:print    # print acceptance check (after build:single; set CHROME=/path/to/chrome if it is not found)
npm run convert-tables # rebuild the age-grade JSON from ../tasuki-cards-data
```

Stage 2 hooks (not built): NAV butterfly course generator, termly report drafts, ekiden line-up advisor. Stage 3 (not built): shared database, student logins, student view and avatar customisation. The data model already carries stable ids, aliases, display modes and per-record provenance for these.
