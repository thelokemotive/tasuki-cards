# THE ARMOURY: Claude Design prompts, v2 (18 Nov 2026)

Replaces the v1 prompt file (15 pieces). Every number here matches the app (Settings → Scoring → ARM) and `docs/ARMOURY.md`.

**What changed from v1, in one breath:** the Stork is now a warm-up game, not a test; the BALANCE plate is now the **LANDING** plate, tested by **The Landing** (a hop-and-stick ladder everyone climbs); The Wall stops at 40 and uses a book on the wall; The Lunge starts at 6 cm; "It never goes down" became "A bad day never lowers it"; Armour Glow is shown at 89; no poster claims ARM prevents injury; homework is safer and progressive; Iron Ekiden has a defined rotation (10 legs, not 12); the trials score sheet is now printed by the app with names filled in.

**How to use:** in your existing Claude Design project, paste **Prompt 0 (v2 brief)** first and say "this replaces the earlier brief; update the style sheet". Then regenerate pieces 1 and 2, and make the rest. Upload a screenshot of a Tasuki Card and say "match this card's look".

**Print run:** A3 wall posters, A4 station cards in sleeves, A5 slips. Everything must read in greyscale.

**Priority if short on time:** 1 → 2 → 3, 4, 5 (the three station posters) → 8 (slip) → 6 (Oath) → 12–14 → the rest.

**Fixes to the v1 PDF:** page 1 had stray characters ("θο") above rule 2 and the words CALF and ANKLE floating near the bottom icons; page 2 said "ARMOUR GLOW unlocks (85+)" next to 89. Prompts 1 and 2 below fix both; check the regenerated pages for stray text.

---

## PROMPT 0: Brand brief v2 (paste first)

```
This replaces my earlier brief for THE ARMOURY. Update the style sheet, keep everything you already made that still fits, then wait for my poster prompts.

THE ARMOURY is a school fitness assessment that rates a student's "ARM" (Armour) stat in our trading-card system, Tasuki Cards, at Harrow International School Appi Japan's Trail Running Academy. Students are 11–18, international and Japanese, all fluent in English; write so a Year 7 (age 11) understands it. These hang in a gym and a martial arts room and are read in passing from 2–3 metres away.

IDENTITY
- Theme: an armoury that forges runners' armour before the snow season. Samurai-armour plates (yoroi) crossed with a mountain runner's kit: lacquered plates, cord lacing, a diagonal tasuki relay sash. Original artwork only. No existing game, anime, film or brand style, no copyrighted characters.
- Signature motif: a diagonal tasuki sash running corner to corner on every piece.
- Three armour "plates", each with its own colour and icon, used identically everywhere:
  • ANKLE plate: teal, icon = an ankle guard / greave. Test: THE LUNGE.
  • CALF plate: amber, icon = a calf plate with a spring. Test: THE WALL.
  • LANDING plate: violet, icon = a heron landing on one leg, frozen. Test: THE LANDING.
  (There is no longer a "Balance" plate. Replace it everywhere with LANDING.)
- Base palette: deep ink navy, off-white paper, tasuki red as the single accent. Bronze, silver and gold only for level and tier badges (L1–2 bronze, L3–4 silver, L5 gold).
- Type: one heavy condensed display face for headlines, one very readable sans for everything else. No script fonts.
- Mascot: the original flat-colour heron in a small lacquered helmet, "The Armourer". Dry, deadpan, slightly smug. Delivers the jokes in speech bubbles. Same pose sheet throughout.
- Figures: simple flat-colour runner figures (gender-neutral, varied skin tones) showing body positions. Arrows and timing marks unambiguous. No photos.

RULES FOR EVERY PIECE
- Readable from 3 m: A3 headlines ≥ 90 pt, body ≥ 24 pt (including footnotes on wall posters). A4 station cards: body ≥ 18 pt.
- One idea per poster. Generous white space. Max ~40 words of body copy on wall posters.
- Use my text verbatim. Do not add rules, numbers, statistics or health claims I haven't given you. Do not change any threshold. Never say or suggest that ARM prevents injury or makes anyone injury-proof.
- Every piece must work in black and white. Colour supports meaning but never carries it alone (icons and labels too).
- Humour: dry and short, from the Armourer only, never mocking a student.
- Optional Japanese accents (single decorative words only): 鎧 (armour), 足首 (ankle), ふくらはぎ (calf), 着地 (landing). English carries the meaning.
- No stray characters or floating labels: every label sits next to the thing it names.
- Footer on every piece: "Tasuki Cards · Harrow Appi Trail Running"
```

---

## PROMPT 1: Hero poster "What is ARM?" (A3 portrait), regenerate

```
A3 portrait hero poster. Purpose: explain in 10 seconds what ARM is. This replaces the earlier version of this poster.

HEADLINE: THE ARMOURY
SUBHEAD: Three plates. One armour. Your weakest plate is your next job.

CENTRE: a runner figure wearing three armour plates (ankle, calf, landing), each labelled with its icon, colour and test name.

THREE SHORT PANELS, one per plate:
• ANKLE · The Lunge — "How far your knee can travel over your foot. Steep climbs and descents ask for it."
• CALF · The Wall — "Pushes you up every climb and steadies every step down. The Wall counts how long it keeps going."
• LANDING · The Landing — "Hop on one leg, land, freeze. Roots, rocks and snow ask for this all day."

BOTTOM STRIP, three rules as big icons (each label directly under its own icon):
1. "Weaker leg counts." (two legs, one highlighted)
2. "Best try counts." (three attempts, one circled)
3. "A bad day never lowers it." (a padlock on a rising arrow)

SMALL LINE above the footer: "ARM measures three things we train. It is not an injury test."

ARMOURER SPEECH BUBBLE: "Your 5K time is very impressive. The Landing does not care."
```

## PROMPT 2: The scoring poster (A3 landscape), regenerate

```
A3 landscape. The master scoring poster. Accuracy matters more than anything; copy every number exactly. This replaces the earlier version.

HEADLINE: HOW YOUR ARMOUR IS RATED

TABLE 1, a level ladder: 3 rows (plates) × 5 columns (Level 1 to Level 5). Each row in its plate colour with its icon. Levels as rising steps, bronze (L1–2), silver (L3–4), gold (L5).
• ANKLE — The Lunge (cm): L1 6 · L2 8 · L3 10 · L4 12 · L5 14
• CALF — The Wall (reps): L1 20 · L2 25 · L3 30 · L4 35 · L5 40
• LANDING — The Landing (rung, cm): L1 80 · L2 95 · L3 110 · L4 125 · L5 140
Under the table: "Use your WEAKER leg. Below Level 1 on any plate = ARM stays locked (that plate is your target)."

STEP STRIP: "1. Find your level on each plate → 2. Add the three levels → 3. Read your ARM"

TABLE 2, a lookup strip (a forge thermometer or sword blade):
Levels added up → ARM
3→40 · 4→45 · 5→50 · 6→55 · 7→60 · 8→65 · 9→70 · 10→74 · 11→79 · 12→84 · 13→89 · 14→94 · 15→99

Two callouts on the strip:
• At 70 (9 levels): "ANKLE GUARDS unlock on your card avatar"
• At 89 (13 levels): "ARMOUR GLOW unlocks"

Footnote (24 pt): "Your best level on each plate from the last 12 months counts."

ARMOURER BUBBLE: "Maths is also armour."
```

---

## PROMPTS 3–5: Station posters (A3 portrait, one per test, same template)

Shared instruction, paste with each:

```
A3 portrait test-station poster. Same template for all three tests. Layout, top to bottom:
1. Test name huge, plate icon and colour, plus a one-line "This tests…"
2. SET-UP: a small diagram of the station
3. HOW TO DO IT: 4 numbered steps, each with a clear figure diagram
4. "DOWN!" box (red): the exact failure rules, as icons with 3–5 words each
5. SCORE box: what the Squire writes down
6. One Armourer joke in the bottom corner
Diagrams must show the correct body position precisely; label body parts where needed.
```

**PROMPT 3: THE LUNGE** (Ankle plate)

```
TITLE: THE LUNGE — "This tests how far your knee can travel over your foot."
SET-UP diagram: side view of a half-lunge facing a wall. A vertical strip of tape on the wall (the knee line), a tape measure on the floor starting at the wall, a floor line under the foot, a sheet of paper under the front heel held by the Squire.
STEPS:
1. Barefoot. Face the wall. Second toe on the floor line.
2. Bend your front knee to touch the tape line on the wall.
3. Heel stays down. The Squire gently pulls the paper. Slide back to the furthest spot where your knee still touches.
4. Measure big toe to wall. Three tries each leg. Best counts.
DOWN! WHEN:
• Paper slides out (heel lifted)
• Knee misses the tape line
• Foot turns out
SCORE: cm to the nearest 0.5. Left and right.
ARMOURER: "The paper sees everything. The paper has no friends."
```

**PROMPT 4: THE WALL** (Calf plate)

```
TITLE: THE WALL — "This tests how long your calf keeps working."
SET-UP diagram: a student on one leg facing a wall, knee straight, the backs of their fingers touching the wall at shoulder height. A hardback book pressed flat against the wall by the Squire, its bottom edge resting on top of the student's head. A metronome icon: "60 bpm: UP on one beat, DOWN on the next".
STEPS:
1. Barefoot, flat floor, one leg, knee straight. Backs of your fingers on the wall.
2. Rise as high as you can. Your Squire presses a book on the wall, touching the top of your head. The book stays put.
3. UP on one beat, DOWN on the next. Head touches the book. Heel touches the floor.
4. Stop at 40.
FAULTS (show as two warning lights):
• Head misses the book · Off the beat · Knee bends · Fingers push
First fault = warning. SECOND FAULT = DOWN!
SCORE: Clean reps. Left and right.
ARMOURER: "Touch the book. Not the ceiling. We've had incidents."
```

**PROMPT 5: THE LANDING** (Landing plate)

```
TITLE: THE LANDING — "This tests how well you land and freeze on one leg."
SET-UP diagram (top view): a start line, then five numbered lines at 80, 95, 110, 125 and 140 cm, and a centre line running along the ladder, like a ladder lying on the floor. Each line labelled with its number in large type.
STEPS:
1. Barefoot. Toes behind the start line, on one leg. Hands on hips.
2. Hop forward. Land on the SAME leg, heel past the line.
3. FREEZE for 3 seconds. Squire counts: "one armour, two armour, three armour".
4. 2 clean out of 3 = move up a rung. Then the other leg.
DOWN! WHEN:
• A hand leaves a hip
• Other foot touches down
• Extra hop or shuffle
• Heel short of the line
SCORE: Furthest rung cleared. Left and right.
SMALL LINE: "Start at 80. Feeling brave? Start higher. Miss it and drop back one rung."
ARMOURER: "Land like a cat. Not like a fridge."
```

---

## PROMPT 6: The Squire's Oath (A3 portrait, judges' poster)

```
A3 portrait. Makes peer judging honest and fun: a public commitment students read aloud before judging; the role framed as an honour, not a chore.

HEADLINE: THE SQUIRE'S OATH
SUBHEAD: "You judge your partner. A coach checks every number."

A scroll or banner, styled like a formal oath:
"I will count only clean reps.
I will shout DOWN when it's down.
I will not be bribed with snacks.
My partner's armour is only real if I am honest."

THREE TOOLS, with icons: "The paper (Lunge) · The book (Wall) · The count of three (Landing)"

ARMOURER: "A fake 40 gets you fake armour. It falls off on the first descent."
```

## PROMPT 7: Stork Duels warm-up card (A4 portrait, optional)

```
A4 portrait card for the warm-up game. Not a test: nothing is scored.

TITLE: STORK DUELS
SUBHEAD: "Warm-up. Not a test. Pure glory."
RULES (3 icons):
1. Face your partner. Stand on one leg. Hands on hips.
2. Coach calls "EYES SHUT!"
3. First foot down loses. Best of three.
ARMOURER: "I have stood like this since 1987. I'm not even tired."
```

## PROMPT 8: Read Your Armour slip (A5 portrait, student worksheet)

```
A5 portrait worksheet, one per student, filled in with a pencil. Must work in greyscale. Big write-in boxes.

TITLE: READ YOUR ARMOUR
Name ________ Date ________ Squire ________

THREE ROWS (one per plate, with icon):
Plate | Left | Right | WEAKER | Level (1–5)
ANKLE · Lunge (cm) | __ | __ | __ | __
CALF · Wall (reps) | __ | __ | __ | __
LANDING · Landing (rung cm) | __ | __ | __ | __

Mini ladder (small, beside the rows):
Lunge 6 / 8 / 10 / 12 / 14 · Wall 20 / 25 / 30 / 35 / 40 · Landing 80 / 95 / 110 / 125 / 140

ADD UP YOUR LEVELS: [ ] → MY ARM: [ ]
Lookup: 3→40 · 4→45 · 5→50 · 6→55 · 7→60 · 8→65 · 9→70 · 10→74 · 11→79 · 12→84 · 13→89 · 14→94 · 15→99

BIG BOX: "MY WEAKEST PLATE IS: ________"
LINE: "When I ________ , I will ________ ." (an if-then plan, e.g. "When I brush my teeth, I will do the Toothbrush Stork.")
Staff box (small): "Checked by: ____"
Footer line: "Retest in 6 weeks. A bad day never lowers it."
```

---

## PROMPTS 9–11: The Forge homework posters (A3, boarding houses and gym)

Shared instruction:

```
A3 portrait homework poster, one per plate, same template. It hangs in boarding houses, so it has to sell itself to a passing 13-year-old. Behavioural design:
- Habit stacking: tie the exercise to something they already do daily.
- A 6-week tracker grid of 18 boxes (3 a week) with the FIRST box already ticked and labelled "Done in the gym" (endowed progress).
- A "next level" target line so the goal feels close.
- Total time shown big: "10 MINUTES · 3× A WEEK".
- Each exercise has an EASIER and a HARDER version shown as small side icons.
- A red "STOP IF" strip at the bottom: "Sharp pain, or pain that gets worse: stop and tell a coach."
Max 3 exercises, each with a figure diagram and one line.
```

**PROMPT 9: ANKLE FORGE**

```
TITLE: ANKLE FORGE
STACK IT: "Every time you wait for the shower."
1. Knee-to-wall rocks: knee to the wall, hold 2 seconds, back. 10 per leg. Heel down.
   EASIER: foot closer to the wall · HARDER: foot further back
2. Half-kneeling rocks: front knee over toes, hands pressing on your front thigh (not the kneecap). 10 per leg.
   EASIER: no hand pressure · HARDER: hold a bag of books on the thigh
3. Toe raises: back against the wall, heels down, lift your toes. 15.
TARGET LINE: "Next level = +2 cm"
ARMOURER: "Stiff ankles are just ankles that haven't been asked nicely."
```

**PROMPT 10: CALF FORGE**

```
TITLE: CALF FORGE
STACK IT: "On the house stairs, on your way up to bed." (show a figure holding the handrail)
1. Heel raises, holding the rail: 3 sets of 12, THREE SECONDS DOWN.
   Step 1: two legs on the floor · Step 2: one leg on the floor · Step 3: one leg on the edge of a step
2. Same again with your knee slightly bent: 2 sets of 12 (this trains the deep calf muscle, the soleus).
3. Count out loud. The way down is the part that works.
Small line: "Move up a step only when 3 × 12 feels easy and smooth."
TARGET LINE: "Next level = +5 reps"
ARMOURER: "The stairs were going to be climbed anyway."
```

**PROMPT 11: LANDING FORGE: THE TOOTHBRUSH STORK**

```
TITLE: THE TOOTHBRUSH STORK
Big comic panel: a student brushing teeth on one leg, eyes open, one hand near the sink, next to the Armourer doing the same with a tiny toothbrush.
STACK IT: "Every time you brush your teeth."
1. Stand on one leg while you brush. Swap legs halfway. Eyes open, next to the sink, dry floor.
2. Easy now? Hand off the sink, still close to it.
3. Still easy? Eyes closed for the last 20 seconds, only on a dry floor with the sink in reach.
WEEKEND (in the gym or on grass, not the bathroom): 5 hop-and-sticks per leg on your current rung.
Use the 18-box tracker (3 a week), first box ticked.
TARGET LINE: "Next level = one rung (15 cm)"
ARMOURER: "Two minutes of brushing. Two minutes of armour. Same two minutes."
```

---

## PROMPT 12: IRON EKIDEN rules poster (A3 landscape, gym)

```
A3 landscape. Explains a team relay game in the gym at a glance.

HEADLINE: IRON EKIDEN
SUBHEAD: "Three teams. Three treadmills. One tasuki each."

ROTATION DIAGRAM: a circle showing one round of 4 minutes:
one runner on the team's treadmill (3½ min) → whistle → belt stops → tasuki handover (30 s) → the rest of the team moves to the next anvil.
Four anvils around the circle, numbered 1–4. With three teams, one anvil rests each round.
"10 rounds. Every runner runs at least one leg."

SCORING, as a big equation:
TREADMILL METRES × 2 + 100 m per ARMOUR SEAL
Under the ×2: "The mountain counts double (10% incline)."
Under the seal: "A Seal = EVERY rep had a 3-second way down. A coach awards it. Rush it and there's no seal."

THE ANCHOR: "Your team picks its anchor for round 10. Fastest runner last, like a real ekiden."

THE ONE RULE (biggest text on the poster): OWN THE WAY DOWN.

ARMOURER: "Speed builds your score. The way down builds your legs."
```

## PROMPT 13: Anvil station cards ×4 (A4 portrait, in sleeves)

```
Four A4 portrait station cards, same template, one per anvil. Read mid-set by someone holding a kettlebell: huge and minimal. Each card: 2 exercise diagrams, reps, the SEAL condition in a stamped wax-seal graphic, and an EASIER / HARDER strip at the bottom. Number and colour each anvil clearly. Red strip on every card: "Sharp pain = stop and tell a coach."

ANVIL 1 · CALF (amber)
• Single-leg heel raise off a step, straight knee, 10 per leg
• Bent-knee heel raise holding a kettlebell, 10 per leg
SEAL IF: full range, 3 sec down, every rep
EASIER: up on two legs, down on one · HARDER: dumbbell in the same-side hand

ANVIL 2 · BRAKES (tasuki red)
• Step-down off a box: heel KISSES the floor, 6 per leg
• Goblet split squat, 6 per leg
SEAL IF: silent heel, 3 sec down
EASIER: lower box · HARDER: hold dumbbells

ANVIL 3 · ANKLE (teal)
• Knee-to-wall rocks with a 2 sec hold, 10 per leg
• Half-kneeling rocks, kettlebell resting on the front THIGH (not the kneecap), 10 per leg
SEAL IF: heel never lifts
EASIER: no kettlebell · HARDER: heavier kettlebell

ANVIL 4 · LANDING (violet)
• Hop-and-stick ladder: lines at 80 / 95 / 110 / 125 / 140 cm. Stick 3 sec. Up a rung after 2 clean sticks. Both legs.
SEAL IF: 5 clean sticks per leg
EASIER: two-foot take-off · HARDER: land sideways on your rung
```

## PROMPT 14: Treadmill rules card (A4 landscape, one per treadmill)

```
A4 landscape safety card, taped to each treadmill console. Four huge icon rules, no more than 5 words each:
1. CLIP ON.
2. STAFF SET THE SPEED.
3. STOP THE BELT, THEN STEP OFF.
4. RUN TALL: HANDS OFF THE RAILS.
Below, smaller: "Know where the red STOP is. Write your metres on the team sheet."
Tasuki-red border. No jokes on this one.
```

## PROMPT 15: Staff pack (for me and my co-lead)

```
Two staff documents in the same visual style, built to calm a nervous deliverer. Glanceable, nothing to memorise.

A) STAFF FIELD CARD: A5, two-sided, laminated.
SIDE 1 — RUN SHEET (timeline bar):
0:00 Stork Freeze Tag + Stork Duels · 0:08 Brief + Squire's Oath · 0:12 Rotation 1 (Lunge / Wall / Landing) · 0:22 Rotation 2 · 0:32 Rotation 3 · 0:42 Read Your Armour · 0:48 Shoes on, teams, treadmill rules · 0:55 BREAK (type slips into The Armoury page) · 1:10 Card reveal · 1:13 IRON EKIDEN (10 × 4 min) · 1:53 Seal the Armour · 1:58 Result + question · 2:05 Out
Roles strip: LEAD = Wall, whistle, seal audits, app · CO-LEAD = Lunge lanes, Landing checks, treadmill marshal
SIDE 2 — SAY BOXES (speech-bubble style, max 10 words each):
• Brief: "Weaker leg counts. Best try counts. Bad days don't count."
• Lunge: "Paper under the heel. Knee to the line."
• Wall: "One beat up, one beat down. Touch the book."
• Landing: "Land. Freeze. One armour, two armour, three armour."
• Ekiden: "Three seconds down, or it doesn't count."
• ASK, then wait 7 seconds: "Which plate is your weakest?"
• ASK, then wait 7 seconds: "Why do we train three seconds down?"
Safety strip: "Sharp pain = stop and tell · Barefoot zone and weights never mix · Current heel, shin or front-of-knee pain: no Landing or step-downs, test later"

B) IRON EKIDEN TEAM SHEET: A4 portrait, one per treadmill. Team name, a 10-round table (Round | Runner | Metres), a seal tally (10 stamp boxes), and a final calculation line "Metres × 2 + Seals × 100 = ____".

(The trials score sheet is no longer designed here: the app prints it from The Armoury page with the pupils' names filled in.)
```

---

## Before printing: check

- Every number against Prompt 2 and against the app's Armoury page (the ladder at the bottom of that page is generated from the live settings).
- No poster mentions "Balance plate", "30 s", "Stop at 30", "85+" or "It never goes down".
- Print one A3 and read it from 3 m. Print one in greyscale.
- Japanese accents: have a Japanese-speaking colleague glance at them, or delete them.
