# Yama (山): the second release

Fabian's brief (5 Nov 2026), after go-live: make it the best it can be for him and the squad. Coaching quality without extra work, competitive and fun for the kids in the short term, good for their long-term development, easy to run, and beautiful: Japanese mountains, trails, and a hand-painted anime-landscape feel. Full rein to build, merge and ship.

## Principles

1. **Original art, no borrowed characters.** Every landscape is generated SVG (ridges, a volcanic peak with a shoulder like Iwate-san, cumulus clouds, cedar forest, a trail). Inspired by painted Japanese landscapes in general, with no characters, scenes or assets from any film or studio. No images, no fonts, no network: the single file still works offline.
2. **Competition that rewards effort.** Ability boards stay age-graded. The new boards reward turning up and improving (climbers, house cup), and the reveal celebrates everyone who moved up, not just the fastest.
3. **Coaching help that reads the data, not the coach's mind.** The app suggests (weakest stat against the runner's own average, locked stats, stale results), and the coach decides.
4. **Nothing new to administer.** Every new feature is derived from data the coach already enters.

## What was built

| Area | Feature | Where |
|---|---|---|
| Look | Yama scenes in six moods (spring, summer, autumn, winter, night, dawn), washi-paper background, night-mountain navigation, brush-stroke titles | everywhere; gallery at `#/scenes` |
| Cards | Each tier is a season on the mountain (Bronze autumn dusk, Silver winter morning, Gold summer golden hour, Icon night sky); In-Form cards get a rising sun; the landscape fades into the paper behind the stats | Cards & Print |
| Home | Greeting and landscape for the time of day and season; tiles; the coach's checklist; to-dos (unverified results, runners not seen for three weeks, stats locked across the squad, missing dates of birth); this week's level-ups; the squad on the mountain; house cup | Home |
| Athlete | The shape of a runner (six-stat radar), the summit ladder (four camps and what the next needs), what to work on (focus, unlock, freshen, superpower, with session ideas) | Athlete page, Student version |
| Squad | Heatmap of every runner's ratings, sortable, filter by year band and sex, focus per runner, averages and unlock counts | Squad (new menu item) |
| Projector | Night-mountain backdrop, podium for the top three, **Reveal**: the week's level-ups, a card flip per runner, upgrades one by one, a finale grid | Home → Reveal, or Boards → Projector |
| Boards | **Biggest climbers** (OVR change this half-term, then best single-stat rise) and **House cup** (per-runner points for weeks, PBs, caps and Surge medals; shown when there are two or more houses) | Boards, projector |

## Next (not built)

- **Seasonal quests**: a short list of team challenges per half-term (everyone unlocks ARM; 10 runners on a 4-week streak) that fill a shared progress bar on the projector.
- **Card backs and foil**: a printable back for the cards, and a foil effect for Icon cards on screen.
- **Stage 2 hooks** from the brief: NAV butterfly course generator, termly report drafts (the explanations and focus are most of the text already), ekiden line-up advisor.
- **Stage 3**: the shared database and staff-only website are built (13 Nov 2026, `docs/WEBSITE-SETUP.md`). The student view is not, and waits for the safeguarding lead (`docs/SAFEGUARDING-NOTE.md`).
