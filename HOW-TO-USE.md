# Tasuki Cards: how to use it (one page)

Open **`TASUKI-CARDS-OPEN-ME.html`** (in this folder) by double-clicking it. It opens in Chrome and works with no internet. Everything is saved automatically in Chrome on this laptop (look for **Saved** at the top right).

## 1. First time: import the roster

1. If you loaded demo data to try things out, first go to **Settings → Data → Clear all demo data**.
2. **Roster → Import roster.** In the school spreadsheet, select the rows (with the header row: Surname, Preferred Name, Year, Gender…), copy, and paste into the box. Check the column mapping, look over the preview (duplicates are flagged), then click **Import**.
   No spreadsheet to hand? Type simple lines instead: `Testfield, Aiko, Y9, F` (add `, 2012-05-04` for a date of birth and `, テストフィールド アイコ; Ai` for aliases).
3. **Settings → Calendar**: add the half-terms (one streak freeze each) and the holiday weeks.
4. **Settings → Courses**: Campus Circuit is already there. Add your climb, descent and nav courses, and set the 99-point times for descents (fixed benchmark).

## 2. Weekly routine

- **After a Circuit or a race**: **Paste & Match**. Paste the results table (from a website, a PDF, Excel, Japanese headers included) or type the Tasuki line format (**Help** has the full format). Every row is matched to an athlete; check the yellow rows (suggestions, typos, implausible paces), tick to confirm, then **Approve**. Nothing is saved before you approve.
- **One result at a time**: **Quick Entry**. It shows exactly what will change before you save ("SPD 71 → 74 · new PB −9 s · In-Form"). Works on a phone too.
- **Dictation**: in Paste & Match, press 🎤 and say "Aiko Testfield sixteen fifteen". It types for you to review; it never saves on its own.
- **Holiday results from students** (Microsoft/Google Forms): export the responses as CSV and paste them in. They arrive *unverified* and count only once you tick them (the athlete page has **Verify**).
- **Mistakes**: on the athlete or event page, click **Edit** on a result, correct it, and give a reason. Everything recalculates, and the history is kept. Delete also needs a reason and can be undone.
- **Streak freeze**: athlete page → **Apply freeze…** (one per half-term).
- **Expedition badges**: athlete page → **Add achievement…** (tick everyone who went).

## 3. Printing

- **Cards**: **Cards & Print** → choose *Everyone*, *In-Form this week*, a year group, or hand-pick → **Print**. In Chrome's print dialog: paper **A4**, **Portrait**, scale **100%** (Default), **Background graphics** ticked. Nine cards per sheet; cut along the crop marks.
- **Boards**: **Boards** → pick a board → choose A4 or A3 → **Print**. For the projector, click **Projector mode** (← → change board, C cycles every 20 s, F full screen, Esc to leave).
- **Circuit handicap start**: **Handicap Start** → tick the runners → **Print start list**.

## 4. Backups (weekly)

**Settings → Data → Export everything** saves one `.json` file with everything (roster, aliases, results and their history, settings). A yellow banner reminds you after 7 days. Keep the file private: it contains dates of birth. To restore, use **Import a backup…** (*Replace everything*, or *Merge*).

Chrome keeps the data per browser and per computer, so use the same Chrome profile on this laptop. Clearing Chrome's "site data" deletes it, which is why the weekly export matters.

## Good to know

- Ratings are age-graded, so a Year 7 and a Year 13 compete fairly. Racing more earns caps (★) and badges, never rating points.
- A stat with 🔒 is locked: the card says how to unlock it, and it never shows a made-up number.
- **prov** next to a rating (coach view only, never printed) means it uses a table still to be verified (the bleep norms, NAV, ARM thresholds).
- **Settings → Scoring constants** lets you change every number, with a preview of how many ratings would change before you apply.
