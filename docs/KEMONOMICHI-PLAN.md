# 獣道 Kemonomichi: the pupil app (third release)

Fabian's brief (19 Nov 2026): the app is nice but not there yet; the streak is clumsy. It has to live on pupils' phones and use every bit of the science Duolingo and other habit-forming apps use, with reminders to run. Pure nature: trail running as exploration of mountains and wild places, its origins (persistence hunters, the Rarámuri), and animals (Blakiston's fish owl, Steller's sea eagle, Amami rabbit, pika, dugong, red panda, snow monkey). Keep the core of the app. Build the treadmill scanner if feasible; consider a selfie for verification.

*Kemonomichi* (獣道) are the paths animals wear through forests and over passes: the first trails anyone ran. The pupil app is a trail you walk with Japan's wild animals.

## What was built

| Area | What pupils see | Where |
|---|---|---|
| **The Trail** (home) | Opens on *your* card, not a list of everyone. Your companion spirit greets you (*Ohayō, Hana!*) with one line about your week. The streak is a trail of stepping stones: lit for kept weeks, iced for holiday and frozen weeks, this week glowing, faint stones up to the next milestone flag. "This week: 3 days left · one session keeps it" | `src/ui/pupil/TrailPage.tsx`, `TrailStrip.tsx` |
| **What's new** | "4 new things since you last looked: tap to reveal". Full-screen, one moment at a time: a tier reached, a spirit awakened (a stat unlocked), a stat up, a PB, a badge, a week kept. Each with its animal, a chime on the Japanese yo scale, a short buzz on Android, and the season falling around it (cherry petals, fireflies, maple leaves, snow) | `src/engine/moments.ts`, `src/ui/pupil/Celebrate.tsx`, `juice.ts` |
| **Missions** | Two or three a week: keep the trail; the Rule of 2 in a winter week; one way to grow (the weakest stat, a stat to awaken, or one to freshen) with the coach's own session idea | `src/engine/trail.ts` (`weeklyMissions`) |
| **Spirits** | One animal per stat; a stat not tried yet is a spirit still asleep. Tap one for true facts and why it is that stat's spirit; choose it as your companion | `src/engine/spirits.ts`, `src/ui/art/Spirits.tsx` |
| **Squad quest** | "15 runners have kept this week · goal 21": one more than the squad's best week this month. Counts only, nobody named | `squadQuest` in `trail.ts`, `SquadHub.tsx` |
| **Trail finds** | Every badge you hold, then the next step on each ladder you have not reached, with how to find it | `trailFinds` in `trail.ts` |
| **Trail lore** | One short, sourced piece a day: born to run, the first ekiden (1917), the Rarámuri, the marathon monks of Mount Hiei, eyes ahead on descents | `LORE` in `spirits.ts` |
| **Tabs** | Trail · My card · Log a run (a raised camera button) · Squad · Boards | `src/ui/App.tsx` |
| **Home Screen app** | Installs from Chrome in one tap; on an iPhone, three illustrated steps (Share → Add to Home Screen). Opens full screen, quick, and with no signal. A red dot on the icon late in the week while the week is open | `public/` (manifest, icons, `sw.js`), `src/ui/pupil/pwa.ts`, `InstallCard.tsx` |
| **Reminders** | Opt-in, explained before anything is asked; Thursday 17:00 only if the week is open, Saturday 08:30 (off unless chosen), Monday 07:30 good news only. Voiced by the pupil's companion | `src/engine/reminders.ts`, `src/cloud/reminderPlan.ts`, `RemindersCard.tsx`, `scripts/reminders/send.ts`, `.github/workflows/reminders.yml` |
| **Coach: preview** | Menu → **Pupil app**: see exactly what pupils see, built from the squad's own data the way the website's public copy is. Works in the offline file too | `src/ui/pupil/PupilPreview.tsx` |

### The spirits

| Stat | Spirit | Why |
|---|---|---|
| SPD | Peregrine falcon (ハヤブサ) | The fastest animal on Earth; the Hayabusa bullet train to Iwate is named after it |
| END | Steller's sea eagle (オオワシ) | Crosses the Sea of Okhotsk to Hokkaido every winter |
| CLB | Japanese serow (カモシカ) | Lives on the crags around Appi; climbs with short, calm steps |
| DSC | Pika (ナキウサギ) | Ice Age survivor on Hokkaido's boulder fields; quick, light feet over scree |
| NAV | Blakiston's fish owl (シマフクロウ) | Reads dark rivers at night; the Ainu *Kotan kor kamuy* |
| ARM | Red panda (レッサーパンダ) | Ankles that turn far enough to climb down a tree head first; fur-soled feet |
| RACE | Snow monkey (ニホンザル) | Gets through Tohoku winters as a troop: a team, like an ekiden squad |
| Rest | Dugong (ジュゴン) | Holiday and frozen weeks: rest is training, the trail waits |
| Comeback | Amami rabbit (アマミノクロウサギ) | Nearly wiped out by mongooses; Amami was declared free of them in 2024 and the rabbits came back. So can your trail |

All original artwork in SVG (`src/ui/art/Spirits.tsx`, gallery at `#/scenes`): no images, no downloads, so the single file still works offline. People (Paleolithic hunters, the Rarámuri) appear in the lore as words, not drawings: a living people is not a mascot.

## The research, and how each idea was used

Duolingo's retention is not one trick. Its own write-ups describe a loop: a cue, a small action, an immediate reward, and something you build up and want to protect (the streak). The useful parts, and what they became here:

| Duolingo mechanism | Evidence | In Tasuki |
|---|---|---|
| Daily streak | Duolingo's own experiments (not independent) | **Weekly**, as before. Daily streaks reward junk miles and make rest feel like failure; the weekly streak already existed and is kept exactly as the coach set it. What changed is that it is now the first thing a pupil sees, as a trail, with this week's status and days left |
| Streak freeze | — | Already there (coach freeze, holiday weeks, the winter rest pass). Shown as iced stones and the dugong, never as loss |
| Streak celebration | Duolingo reports a better streak animation lifted new-user 7-day retention | The reveal: a full-screen moment when a week is kept, a milestone reached, a stat up. Only for real things, never for opening the app |
| The path | — | The trail strip, missions, the summit ladder ("Silver needs 4 more OVR points") |
| Mascot personality | — | The pupil's chosen companion speaks: greetings, the week, reminders |
| Reminders at the right time, with variety | Yancey & Settles (KDD 2020): a bandit choosing among varied reminder templates, with a penalty for repeats, lifted daily users 0.5% and new-user retention 2% over a strong baseline | Three fixed, well-timed slots instead of a learning algorithm (a squad of 30 is too small to learn from). Lines vary by day. Nothing sent when there is nothing useful to say |
| Friend streaks, nudges | Duolingo reports users with a friend streak were more likely to do their lesson | **Not built.** The safeguarding note promises no pupil-to-pupil messaging or comments, and a "nudge" from one child to another is both. The squad quest gives belonging without contact |
| Leagues | — | The boards already exist (ability top 10, In-Form, climbers, house cup). Unchanged |
| Collectables | — | Spirits (awaken all six), trail finds (badges found and still to find) |
| App icon badge, Home Screen | iOS 16.4+ supports web push and badges for Home Screen web apps | The installable app, the red dot while the week is open |
| Hearts, gems, paid streak repair, loot boxes, leaderboard demotion | — | **Not built.** Nothing here can be bought, nothing is random, and nothing threatens to take away what a pupil has done |

Two pieces of research shaped the limits. A 2024 meta-analysis of gamification (Li, Hew & Du, as quoted in the research the coach shared) found small gains in intrinsic motivation, mostly through autonomy and belonging, and only a small effect on feeling competent: badges do not make anyone feel good at running, real progress does. That is why the reveal celebrates real results and the missions point at the weakest stat. The ICO's Age Appropriate Design Code (the "Children's Code", the yardstick British schools use) asks for high-privacy defaults and warns against nudges and reward loops that keep children on a screen. So reminders are off until a pupil turns them on, at most two a week, never at night, never "you will lose your streak", and the app has nothing to scroll.

## Reminders: how they work

1. The head coach opens the account menu → **Set up reminder keys (once)**. The app makes a key pair in the browser; the private half is copied into GitHub as the secret `VAPID_PRIVATE_KEY` (shown once, never stored by the app), the public half is saved.
2. The head coach ticks **Trail reminders**. Pupils now see a "Trail reminders" card on their Trail (an iPhone needs the Home Screen app first: Apple's rule).
3. A pupil taps **Turn on reminders**, allows notifications, and chooses which ones. Saved: which card, which reminders, the companion's name and the phone's push address (only Google, Apple, Mozilla and Microsoft push services are accepted). Nobody else can read it, coaches included.
4. A scheduled GitHub Action (`.github/workflows/reminders.yml`) runs on Thursday, Saturday and Monday. It reads the public copy of the squad (the same one pupils see) and the waiting treadmill runs, decides for each phone whether there is anything worth saying (`src/cloud/reminderPlan.ts`), and sends it. A phone that unsubscribed is forgotten. It logs counts only.

What a reminder never does: go out once the week is kept, while a run is waiting for the coach, or in a holiday week; say a pupil "will lose" anything; name anyone else; claim a pupil has not run when the Circuit results simply are not typed in yet ("Ran the Circuit already? It counts once your coach adds the results.").

Why a GitHub Action rather than Cloud Functions: Cloud Functions need the Firebase project on the pay-as-you-go plan with a card on a personal Google account; the Action needs nothing new except two secrets, and the deploy workflow already uses one of them.

## The treadmill scanner, and the selfie question

**The scanner already exists** (18 Nov): *Log a run* reads the console photo on the phone (seven-segment digits, no AI service, no network), sends only a crop of the lit display, and the coach approves. This release makes it the raised button in the middle of the tab bar, celebrates a sent run ("your trail is kindling"), and shows the week as kindling until the coach approves.

**A selfie on the treadmill: recommended against.** Not legal advice; the DSL decides. The reasons:

- The note to the DSL promises "no photographs of pupils". A selfie breaks that promise and needs their sign-off again, and probably parental consent.
- Photographs of children in sportswear in a gym are among the images school safeguarding policies are strictest about (KCSIE-style practice, which Harrow schools follow overseas; Japan's APPI also treats a face as personal information). They would sit in a project under a personal Google account, and the coach would be reviewing a stream of them.
- A selfie proves less than it seems: it can be staged in ten seconds, and it often catches other people in the gym who have not agreed to anything.
- The current checks are proportionate: the school sign-in, the console crop, flags for anything odd (typed instead of photographed, a number changed, a new sign-in for a card, a duplicate), and a coach who knows the pupils.

If more proof is ever needed, a no-photo option: the supervising member of staff writes a short code on the gym whiteboard each day, and the pupil types it in with the run. It proves presence without a picture.

## What is deliberately unchanged

- Every rating, the streak rules, the Growth Shield and Winter Mode: the same engine, the same config versions. Missions, moments, the quest and reminders only read it.
- A treadmill run still counts only once a coach approves it. The pupil's own phone shows it as "kindling" in the meantime.
- Pupils still see only the public copy (no dates of birth, notes or hidden names). The phone remembers which card is theirs; that unlocks nothing private, since anyone at school can already see every card.

## Next: directions for the next build (for Claude or anyone)

In order of value for effort. Each is small enough for one pull request.

1. **Test on real phones.** An iPhone (Home Screen install, sign-in inside the Home Screen app, notifications) and an Android phone. *Known risk*: Microsoft sign-in inside an iPhone Home Screen app. If it fails, ask school IT to add `https://tasuki-cards.web.app/__/auth/handler` as a redirect URI on the Entra app registration; then set the Firebase `authDomain` to `tasuki-cards.web.app` in `src/cloud/firebase.ts` (`loadConfig`), which keeps sign-in on the same site Safari is on.
2. **Split the coach's pages out of the pupil download.** Pupils load the whole coach app (about 960 kB of JavaScript, 324 kB compressed). Lazy-load the coach-only pages in `src/ui/App.tsx` (`lazy(() => import('./pages/PastePage'))` and so on) behind the existing `Suspense`; the single file still inlines everything.
3. **A "results are in" reminder.** When the coach enters the week's Circuit results, the public copy changes; the sender could compare it with the last one it saw (store a hash in `public/settings`) and send "Your Circuit result is in: tap to see what changed" to pupils whose card changed. Opt-in, once a week at most.
4. **Reveal on the projector.** The Home → Reveal projector show could use the spirits for each level-up (the moment's `spirit` is already worked out).
5. **Avatar and spirit together.** The card's avatar unlocks (compass, contour wings, dust burst) could each nod to their spirit (owl feathers on the compass, pika dust).
6. **The gym code** (above), if the coach wants more proof than the console photo.
7. **Open questions for the coach** (also in `DECISIONS.md`): is the squad quest's goal (one more than the best week this month) right, or would a fixed share of the squad be clearer? Should Saturday reminders default on? Are the three reminder times right for boarders?

Not recommended: daily streaks; XP that feeds ratings; friend nudges or messages between pupils; selfies; random rewards; anything to buy; leagues with demotion. Each either breaks a promise to the DSL or rewards the wrong thing (volume, screen time, luck) instead of steady training.
