# Tasuki Cards: brief for an outside reviewer

You are being asked to criticise this app as hard and as deeply as you can. Your feedback goes back to the agent that maintains the code, which will act on it. Praise is not useful. Specific, checkable criticism is.

Read this brief first. The other files in the pack hold the full source and the project's own documents; this brief tells you what the app is for, how it works, where its author already suspects it is weak, and the form your answer should take.

## 1. What it is, in one paragraph

Tasuki Cards turns a school trail-running squad's results into FIFA-style trading cards: six stats (speed, endurance, climb, descent, navigation, injury armour), a RACE rating, an overall rating (OVR), a tier (Bronze, Silver, Gold, Icon), streaks, badges and leaderboards. Under the playful surface every number is meant to be defensible sports science: times are age-graded against world-class standards for the runner's age and sex, hills are converted to effective distance, old results fade, thin evidence is discounted, and each number has a plain-English "Why?" that shows the arithmetic. "Tasuki" is the sash passed between runners in a Japanese ekiden relay.

## 2. Where and by whom it is used

- **The school.** An international boarding school in the mountains of northern Japan, pupils aged 11 to 18 (Year 7 to Year 13, British system), plus staff who run. Boys' and girls' boarding houses. Results arrive in English and Japanese (kanji and kana names, Japanese race websites and PDFs).
- **The academy.** A trail running squad run by one head coach, a teacher and not a software developer. Training is on a measured campus circuit (1.3 km), climb and descent courses on the ski hill, navigation courses, bleep tests, and ankle, calf and balance tests. Racing is local cross-country, hill races, ekiden relays and parkrun. Once a year the whole school runs a hill race (the Green Long Ducker), which produces finishing places for every pupil but no times.
- **Scale.** A squad of tens of runners; the whole school is a few hundred pupils, who are held as "whole-school runners" so names match and field sizes are right.
- **Who uses it.**
  - *The head coach*: enters and corrects everything, prints cards, runs a Friday "reveal" on a projector, plans groups and handicap starts, sets targets.
  - *Other coaches*: enter results on a phone or iPad at the track or on the hill.
  - *Pupils*: a view-only website on their phones (cards, boards, their own "how your ratings are worked out" sheet, next 5 km target). They are the audience the app has to excite.
  - *Parents*: see printed cards and whatever the school chooses to show. Not users yet.
  - *The school's safeguarding lead*: has to be content with what is stored and who can see it.
- **What success looks like.** Pupils turn up more often and train the right things because the card shows them what to do next. The coach spends minutes, not hours, on data. The numbers survive scrutiny from a sceptical PE department or a parent. The school is proud to show it. It keeps working for one to two years with little maintenance.

## 3. Typical jobs

1. After a session or race the coach pastes a results table (from a website, PDF, spreadsheet, a Forms export, or typed shorthand) into Paste & Match. Rows are matched to athletes by name in any script; the coach reviews and approves; ratings update.
2. One result is typed on a phone (Quick Entry), which previews exactly what will change before saving.
3. parkrun: the coach copies the whole results page; our runners are picked out, everyone else counts towards field size.
4. The whole-school race workbook (one sheet per house) is dropped in; places become a climb score and a "top X% of the school" comparison.
5. Friday: the projector shows who levelled up that week, with card flips.
6. Before a time trial: a handicap start list from each runner's predicted time.
7. Termly: every runner gets a predicted 5 km, a realistic and a stretch target, and a printed card.
8. A pupil opens the site on a phone to see their card and what would unlock or raise a stat.

## 4. Constraints that are not negotiable

- **Children's data.** Names, year group, sex, house and (coach-only) date of birth. No photos, contact details or location. Pupils see a separate published copy with no dates of birth, notes, aliases or correction history; families can opt a child out.
- **Two builds from one codebase.** A single self-contained HTML file that works offline from a laptop (IndexedDB), and a website (Firebase Hosting, Firestore, sign-in through the school's Microsoft directory).
- **The engine is pure.** The UI never calculates a rating. `deriveAll(snapshot, asOf, config)` produces everything, and every constant lives in one versioned config object so past ratings can be reproduced.
- **A number is never invented.** A stat with no evidence is locked and says how to unlock it.
- **Maintained by an AI coding agent directed by a non-developer.** Whatever you recommend has to be something that arrangement can keep healthy.
- **No real pupil names** in code, tests or demo data.

## 5. Map of the code

TypeScript, React 19, Vite, Vitest (about 790 unit tests, nearly all on the engine), Dexie for IndexedDB, Firebase for the website. No router library (hash routes), no state library, no component library, no CSS framework.

| Area | Where | What it does |
|---|---|---|
| Data model | `src/types.ts` | Raw records only: athletes, courses, events, performances, participation, achievements, calendar. |
| Scoring engine | `src/engine/*.ts` | Age on a date, standards, per-result scoring, the six stats, RACE, OVR, tiers, streaks, relay "Surge", personal bests, badges, boards, 5 km prediction, national comparison, coaching suggestions, explanations. |
| Intake | `src/engine/parse/*`, `names.ts`, `time.ts` | Table detection, the line format, results booklets, parkrun pages, whole-school workbooks, a dependency-free .xlsx reader, time parsing (including Japanese and spoken forms), name matching across scripts, the import plan. |
| Persistence | `src/store/*` | A `Store` interface; IndexedDB and in-memory versions; backup export and import. |
| Website | `src/cloud/*`, `firestore.rules`, `src/ui/cloud/*` | Firestore store (tables split into bucket documents), Microsoft sign-in, the coach list, the published view-only copy for pupils. |
| Interface | `src/ui/*` | Fourteen routes: home, quick entry, paste and match, roster, athlete, events, event, cards and print, boards, projector, handicap, squad, settings, help. Generated SVG landscapes and avatars. |

## 6. How a rating is produced

All constants below are defaults in `src/engine/config.ts`.

**Age.** From date of birth if known; otherwise from year group (Y7 = 11 on 1 September, plus half a year, plus time elapsed). Staff default to 30.

**Effective distance.** `(distance + climb ÷ 100) × terrain factor`. So 4 km with 200 m of climb counts as 6 km. Descent, altitude and technicality are not modelled except through a hand-set terrain factor.

**Standard time.** Alan Jones 2025 road age-grading tables (ages 5 to 100, 1 mile to 200 km), interpolated on log time against log distance and linearly on age. Below 1 mile the runner's mile standard is scaled along the track world records from 200 m to the mile.

**Run score.** `age grade = standard ÷ time`; `score = clamp(round(99 × age grade ÷ 0.80), 40, 99)`. An 80% age grade is 99; 60% is 74; anything under about 32% is 40.

**Other per-result scores.**
- *Descent*: against a fixed course benchmark set by the coach (a reference run and the score it should get), adjusted for age.
- *Bleep test*: laps to a percentile from a table attributed to Tomkinson et al. 2017, then `40 + 0.59 × percentile`, with a top band above the 95th percentile.
- *Navigation*: `efficiency = (route km-effort × the runner's own best pace × 1.15) ÷ (time + 120 s × errors)`; `40 + 59 × (efficiency − 0.5) ÷ 0.5`.
- *Armour*: ankle (knee-to-wall cm), calf (single-leg heel raises) and balance (eyes-closed stance) each give a level 1 to 5; `40 + (sum − 3) × 59 ÷ 12`.
- *A place with no time in the whole-school hill race*: 80 for first down to 40 for last, linear in place.

**Freshness.** No penalty for 6 months, then 1 point a month; results over 24 months old leave the ratings.

**Which results feed which stat.**
- SPD: the campus circuit, and any race, relay leg or parkrun of up to 3.5 km effort.
- END: bleep test, or any race, relay leg, parkrun or long run of 5 km effort or more.
- CLB: climb courses, and races or long runs with at least 150 m of climb and 50 m per km.
- DSC, NAV, ARM: their own courses and tests.
- RACE: official races and relay legs only; top three weighted 50/30/20. Not part of OVR.

**A stat's value** is the best fresh score among the results that feed it (the maximum, not an average). While the runner's attendance streak is alive, a stat never shows more than 2 below its best of the last 12 months (the "Growth Shield").

**OVR** (changed in November 2026). Each stat's evidence is the number of separate days with a current result behind it; a place with no time counts 0.5, an unofficial event 0.75, an effort under 1 km 0.5, a result over 12 months old 0.5. Stats are averaged in proportion to `n ÷ (n + 1.5)`. Then `OVR = 50 + proven × (average − 50)` with `proven = N ÷ (N + 1.5)`, N being all the evidence. At least two stats must be unlocked.

**Tier.** Silver from OVR 65, Gold from 75 with at least one race cap, Icon for three caps and RACE 85 or more.

**Next 5 km.** Every timed result of the last 18 months is converted to 5 km with a youth-adjusted Riegel exponent (1.115 at age 11 falling to 1.063 at 18, more from very short sources), brought forward for natural maturation, and combined by inverse-variance weighting into an estimate with a 90% interval. Targets add one term of maturation and a training gain.

**Also derived.** Weekly attendance streaks with holidays and freezes; relay "Surge" (leg time against a prediction from a recent baseline, with a sanity gate across the event); personal bests and course records by sex and year band; badges; a house cup; a comparison with Japanese national fitness-survey means.

## 7. Where the author already suspects it is weak

Do not stop at these. They are here so you can go past them.

*The science*
- Road age-grading tables built for adult road racing are being applied to 11 to 18 year olds on trails. The youth end of those tables is the least certain part.
- The 80% anchor and the 40 floor were chosen, not derived. Most pupils may be squeezed into a narrow band.
- A stat is the maximum of noisy results, which rises with the number of attempts regardless of ability.
- Below the mile, the age factor is borrowed from the mile.
- `climb ÷ 100` ignores gradient, descent, surface and altitude (the school is at about 700 m, races go to 1,300 m).
- The place-to-score rule for the whole-school race is linear and ignores how strong each field is.
- The bleep table has not been checked against the paper it is attributed to. The armour thresholds have no cited source.
- NAV is scored against the runner's own pace, so a slow runner can outscore a fast one who navigated equally well.
- The OVR constants (50, 1.5, the evidence weights) are judgement, not fitted to data. The six stats are weighted equally although several measure the same underlying fitness.
- The 5 km prediction has never been back-tested against actual results. Its uncertainty terms are assumed.
- Linear freshness decay is arbitrary. Detraining is not linear and differs by quality.
- Age estimated from year group is up to half a year out, which matters at 11 to 14.
- Sex is binary and maturation (the biggest driver at these ages) is handled only by chronological age.

*Motivation and fairness*
- Ranking children by ability, even age-graded, may discourage the ones the coach most wants to keep. Pupils see only the top ten on ability boards; is that enough?
- Does the card tell a 12-year-old what to do next in words they would act on?
- Could a pupil game it (one all-out short effort, cherry-picked events, never retesting)?

*Engineering*
- Everything is loaded into memory and `deriveAll` recomputes every athlete on every change.
- The website's main script is about 770 KB in one chunk. It is not an installable app and the website has no offline mode.
- Almost no interface tests, no end-to-end tests, no linting, and no checks run on pull requests; tests run only after merging.
- Built files (two 800 KB HTML files) are committed on every change.
- The Firebase project sits under the coach's personal account, and the owner's address is written into the security rules.
- The pupil copy is published from a coach's device, so it is stale until a coach next opens the site.
- Several page components are 400 to 500 lines with inline styles. Phone layouts have had little attention (thirteen media queries in the whole interface).
- Accessibility has not been audited. No Japanese-language interface although many families are Japanese.
- Imports read tables and workbooks, but not GPX or watch files.
- One person holds all the knowledge.

## 8. What to examine

Take whichever of these you are best placed to judge. Depth on one beats a skim of all.

1. **Sports science and physiology.** Is each formula in section 6 valid for adolescents on trails? What does the literature say that this contradicts? What should replace it, with sources?
2. **Statistics and measurement.** Reliability, validity, regression to the mean, max-of-samples bias, the shrinkage design, the prediction model. How would you validate each with the data this app already holds?
3. **Youth development and motivation.** Risks of rating children; what the evidence says about feedback, rankings and long-term athlete development; what to show, hide or reword.
4. **Product and experience.** For each user in section 2: what is confusing, slow, missing or childish? What would make a pupil open it weekly on a phone?
5. **Software engineering.** Architecture, correctness, performance, testing, maintainability over two years with an AI maintainer, dependency risk.
6. **Security and privacy.** Read `firestore.rules`, `src/cloud/*` and the published-copy code as an attacker and as a data-protection officer (Japanese APPI and UK-style school safeguarding both apply in spirit).
7. **Data intake.** What will break the parsers and name matching? How should GPX and watch files be handled so that a file becomes a trustworthy scored result?

## 9. The form your answer should take

So the maintaining agent can act without guessing, give each finding as:

```
### <short title>
Severity: critical | high | medium | low
Lens: science | statistics | motivation | product | engineering | security | intake
Where: <file path and function, or formula name from section 6>
Problem: <what is wrong, in two to four sentences>
Evidence: <the code or formula you read, a worked example with numbers, or a citation>
Change: <the specific change you recommend>
How to check it worked: <a test, a calculation, or a measurement>
Confidence: high | medium | low
```

Then finish with:
- the five changes you would make first, in order;
- anything you could not judge because information was missing;
- any place where you think this brief itself is wrong about the code. Check the code; do not trust the brief.

Rules for reviewers:
- Quote file paths exactly as they appear in the pack.
- If you cite research, give authors and year, and say plainly when you are unsure a citation is exact. A wrong citation is worse than none.
- Show numbers. "The floor is too high" is weak; "a Year 8 girl running 5 km in 34:00 has an age grade of X and scores Y" is strong.
- Do not propose rewriting in another framework unless you can name the specific failure that forces it.

## 10. What is in the pack

| File | Contents |
|---|---|
| `00-BRIEF.md` | This document. |
| `01-engine-scoring.md` | The data model and the whole scoring engine. |
| `02-engine-intake.md` | Parsers, name matching and time parsing. |
| `03-store-cloud-security.md` | Persistence, the Firestore layer, security rules, the published pupil copy. |
| `04-ui.md` | Every screen, component and stylesheet. |
| `05-project-docs.md` | The original build spec, the decisions log, the build report, plans, and the safeguarding note. |
| `06-tests.md` | The unit tests, which double as worked examples. |
| `ALL-IN-ONE.md` | Files 00 to 05 joined, for models with a very large context. |

Personal names, email addresses, the school's sign-in directory ID and any keys have been replaced with placeholders. Generated art data, the age-grade table itself (a large JSON of standard times), the lock file and built output are left out.
