# THE ARMOURY: the ARM test, definitive version (18 Nov 2026)

This is the rulebook for ARM. The app (`src/engine/arm.ts`, config `arm`) and the posters (`docs/ARMOURY-DESIGN-PROMPTS.md`) both follow it. If they ever disagree, this file and the app's Settings → Scoring are right, and the poster is reprinted.

## What ARM is, and what it is not

ARM is a snapshot of three lower-leg capacities that trail running asks for and that we train: **ankle mobility**, **calf endurance** and **single-leg landing control**. It is a game rating built from three honest field tests.

It is **not** an injury test. It does not predict injury, and a high ARM does not make anyone injury-proof. No poster, card or coach line says otherwise.

## The three plates

| Plate | Test | What it measures | Recorded | Level 1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|---|---|---|
| ANKLE (teal) | **The Lunge** | Weight-bearing ankle dorsiflexion (knee-to-wall) | cm, big toe to wall, to 0.5, each leg | 6 | 8 | 10 | 12 | 14 |
| CALF (amber) | **The Wall** | Single-leg heel-raise endurance at 60 bpm | clean reps, each leg, stop at 40 | 20 | 25 | 30 | 35 | 40 |
| LANDING (violet) | **The Landing** | Single-leg hop-and-stick control | furthest rung stuck 2 of 3, each leg | 80 cm | 95 | 110 | 125 | 140 |

- **The weaker leg sets the level.** Both legs are recorded and kept; the app works out the weaker one. A plate needs both legs before it counts.
- **Below level 1 on any plate: ARM stays locked**, and that plate is the pupil's target. Nothing is manufactured.
- **ARM = round(40 + (sum of the three levels − 3) × 59 ÷ 12)**: 3→40 · 4→45 · 5→50 · 6→55 · 7→60 · 8→65 · 9→70 · 10→74 · 11→79 · 12→84 · 13→89 · 14→94 · 15→99.
- **Best level per plate from the last 12 months.** A bad retest never lowers ARM. Tests drop out after 12 months.
- **Tests from before 19 Nov 2026 keep the old levels** (Lunge 5–14 cm, Wall 10–30 reps, the Stork rule). The new thresholds never lower an old result.
- Avatar unlocks: **Ankle guards at 70 (9 levels)**. **Armour Glow at 89 (13 levels)**. (The config value is 85; on the lookup the first score at or above 85 is 89, so the posters say 89.)

## Why these tests and these numbers (the decisions)

Three outside reviews (a deep-research synthesis, a scientific critique and a game-design critique) were read in full. Where they agreed, that was adopted. Where they disagreed, the tie-breaks were: can a 14-year-old Squire judge it with a yes/no? does it fit 35 minutes for 20 pupils? would a pupil see it as fair?

1. **The Stork is no longer scored.** Eyes-closed single-leg stance has high trial-to-trial noise (session CVs near 30%), a median of about 7 s on the weaker leg in teenagers (so about a third would have been locked out at level 1), and only about 2% reach 30 s on both legs, which locked the hop-and-stick away from almost everyone. It also measures quiet standing, not "the reflex that catches you on a root". It stays as the warm-up game (Stork Duels) and as homework (the Toothbrush Stork, eyes open first).
2. **The Landing replaces it, as a ladder everyone climbs.** Hop-and-stick is the most trail-like and most watchable test in the room, every rung is a yes/no a Squire can judge, and every pupil gets to jump from the first minute. The rungs are 15 cm apart, larger than the test's trial-to-trial wobble.
3. **The Wall: cap raised from 30 to 40, levels 20–40.** On a flat floor at 60 bpm, healthy teenagers average low 30s on the weaker leg, so a 30 cap would have put about half of them at level 5. The levels are 5 reps apart, bigger than the test's measured error (about 3–4 reps). The height target is now a **book pressed flat on the wall** at the top of the first rep, not a hand held in the air, so it cannot drift down as the Squire tires. Backs of the fingers on the wall (no pushing). The heel touches the floor every rep.
4. **The Lunge: level 1 from 6 cm (was 5).** 5 cm sat inside clinical "very stiff". The levels stay 2 cm apart, wider than the test's measured error (about 1.6–1.9 cm), so a level change is a real change. Knee touches a vertical tape line on the wall, second toe on a floor line, paper under the heel.
5. **No fourth "Brakes" plate yet.** A step-down test needs a judge to rate knee position, which peers do poorly, and a fourth plate breaks the 35 minutes. The Brakes stay as Anvil 2 in Iron Ekiden. Revisit after the pilot.
6. **The sum stays, and the plates are always shown.** Two pupils can share ARM 79 with different profiles; the slip, the athlete page and the explanation always show all three plates and which leg was weaker. The weakest plate is the pupil's next job, and below level 1 locks ARM.

### Known limits (said out loud, so nobody is surprised)

- **Height.** A taller pupil gets slightly more cm on the Lunge, and a longer hop, for the same ankle or the same control (up to about one level between a 150 cm and a 190 cm pupil at the top of the Lunge). Raw numbers are kept, so this can be corrected later (for example by foot length) without retesting.
- **Age.** ARM is not age-graded. Y7 pupils will usually score lower than Y13. The levels are a training ladder, not a national standard.
- **The thresholds are our best estimate from published teen data**, not yet from our own pupils. See the pilot below.

## The session (35 minutes of testing, 14–20 pupils)

Pairs: one tests, one is the **Squire** (judge and counter), then swap. Three stations, three rotations of about 10 minutes. Staff verify every number before it goes in.

**Set-up (before pupils arrive)**
- **Lunge lanes (3–4):** a strip of tape up the wall (the knee line) and a tape measure on the floor at right angles to it, zero at the wall. A sheet of paper per lane.
- **Wall spots (3–4):** a clear wall, a hardback book per spot. One speaker playing a 60 bpm metronome for the whole room.
- **Landing ladders (3–4):** a start line, then lines at **80, 95, 110, 125, 140 cm** from the start line, and a centre line along the ladder. Label each line with its number.

**Run sheet**
| Time | What | Who |
|---|---|---|
| 0:00 | Stork Freeze Tag and Stork Duels (warm-up, not scored) | Lead |
| 0:08 | Brief: weaker leg counts, best try counts, a bad day never lowers it. Squire's Oath read aloud. | Lead |
| 0:12 | Rotation 1 (Lunge / Wall / Landing) | Co-lead on Lunge, Lead on Wall, both glance at Landing |
| 0:22 | Rotation 2 | |
| 0:32 | Rotation 3 | |
| 0:42 | Read Your Armour: pupils work out their own levels and ARM on the slip | Pupils; staff check |
| 0:48 | Shoes on, teams, treadmill rules | |
| 0:55 | BREAK: type the slips into **The Armoury** page (about 5 minutes for 20 pupils), save | Lead |
| 1:10 | Card reveal | |

**Getting the numbers into the app (the quick way)**
1. Before the session: open **The Armoury** page, add the group (by year group or name), press **Print score sheet**. You get the same grid on paper with the names filled in. That, or the pupils' A5 slips, is the paper record.
2. During or after testing: type each leg into the grid. The app outlines the weaker leg, shows the level and the ARM on the card, and flags anything odd ("other leg missing", "check 90", "Landing below L1: target 80 cm").
3. Press **Save**. One "The Armoury" test event with one ARM test per pupil, both legs kept. Mistakes are corrected later on the pupil's page, with a reason, never lost.
4. The grid is kept on that device if the page is closed mid-session.

Typed instead? Paste & Match takes `# test: arm | 2026-11-25` then lines like `Aiko Tanaka lunge 9.5/11 wall 24/27 landing 95/110 by FL`.

## The three tests, word for word (what the station posters say)

### THE LUNGE (Ankle)
1. Barefoot. Face the wall. Front foot on the tape, second toe on the floor line.
2. Bend the front knee forward to touch the tape line on the wall. Back foot wherever is comfortable.
3. Heel stays down: the Squire holds a sheet of paper under the heel and gently pulls. Slide the foot back to the furthest spot where the knee still touches.
4. Measure big toe to wall. Three tries each leg. Best counts.
- DOWN when: the paper slides out (heel lifted) · the knee misses the tape line · the foot turns out.
- Score: cm, to the nearest 0.5, each leg.

### THE WALL (Calf)
1. Barefoot, flat floor, facing the wall, on one leg. Knee straight. Backs of your fingers touch the wall.
2. Rise as high as you can. Your Squire presses a book flat on the wall, its bottom edge on top of your head. The book stays there.
3. With the 60 bpm beat: UP on one beat, DOWN on the next. Head touches the book every rep. Heel touches the floor every rep.
4. Stop at 40.
- Faults: head misses the book · off the beat · knee bends · fingers push or grip. First fault = warning. Second fault = stop.
- Score: clean reps, each leg.

### THE LANDING (Landing)
1. Barefoot. Toes behind the start line, on one leg. Hands on hips.
2. Hop forward and land on the SAME leg with your heel past the line.
3. FREEZE for 3 seconds. The Squire counts "one armour, two armour, three armour".
4. 2 clean out of 3 = rung cleared: move up. Start at 80 (or start higher; miss it and you drop back one rung). Then the other leg.
- DOWN when: a hand leaves a hip · the other foot touches · an extra hop or shuffle · the heel lands short of the line.
- Score: the furthest rung cleared, each leg (0 if 80 is not cleared yet).
- Coaching cue, not a scoring rule: "knee over toes on landing".

## Safety (non-negotiable on every poster and the staff card)

- Sharp pain = stop and tell a member of staff. Any pupil, any year group.
- A pupil with current heel, shin or front-of-knee pain, or a health plan that says so, does not do the Landing or step-downs; they are tested later.
- The barefoot zone and the weights never mix.
- Homework is progressive (easier first) and has a "when to stop" line. The Toothbrush Stork starts eyes open, next to a sink, on a dry floor. Eyes-closed balance only on a clear, dry, non-slip floor with something to hold within reach.
- Treadmills are staff-set and staff-supervised; pupils know where the stop button is.

## The pilot (how the numbers earn trust)

The first session is also the pilot. Because every leg's raw number is kept, the thresholds can be checked against our own pupils without retesting anyone.

1. After the first session, look at how many pupils sit in each level per plate (Settings → Data export, or ask for a report). Aim: roughly 15% below L1, 10% at L5 on each plate.
2. If a plate is badly off (more than about a third at L5, or more than about a third locked), change the thresholds in Settings → Scoring. The app saves a new config version and re-derives every card from the raw numbers.
3. **Only ever make thresholds easier during a season.** Making them harder would lower cards, which breaks the promise "a bad day never lowers it". Harder thresholds wait for the start of the next season and are announced.
4. Optional, for confidence: retest 10–12 volunteers 5–7 days later with a different Squire. If more than about one in five change level with no training in between, widen that plate's levels.
