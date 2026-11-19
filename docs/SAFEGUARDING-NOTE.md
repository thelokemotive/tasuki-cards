# Tasuki Cards website: note for the Designated Safeguarding Lead

From Fabian Loke, Trail Running. 13 November 2026. One page; decisions wanted are at the end.

## What it is

Tasuki Cards turns the trail running squad's results into ratings, cards and leaderboards. Until now it ran as a file on my laptop. I would like coaches to be able to use it on a phone or iPad at the track and on the hill, so it now also runs as a private website backed by a Google Firebase database (project `tasuki-cards`).

## What is stored about pupils

- Name, preferred name, year group, sex, house, and date of birth (needed for age-graded ratings).
- Running results: times, events, attendance at sessions, badges.
- A cartoon avatar the pupil designs. No photographs of pupils.
- **Treadmill logs (new, 18 Nov 2026, on; one switch turns it off):** a pupil can send a treadmill run (distance, time, incline, speed, how hard it felt, and the date) with a photo of the treadmill's display. The photo is read on the pupil's phone and only a small crop of the lit numbers is sent, never the rest of the picture; it is deleted as soon as a coach approves or turns the run down. The run is recorded with the pupil's school sign-in name so the coach can check it came from them.
- An optional free-text coach note per runner. I will keep medical, pastoral and SEN information out of it; that stays in the school's own systems.

- **Phone reminders (new, 19 Nov 2026; off until I switch them on):** a pupil can choose to get up to two short reminders a week about their running ("One run by Sunday keeps your 6-week trail going"). Nothing is sent unless they turn it on on their own phone, after a screen that explains what is sent and when. What is stored: which card is theirs, which reminders they chose, and an address for their phone that only these reminders can use. Nobody else can read it, coaches included; turning reminders off deletes it. Reminders never name another pupil, are never sent at night, and stop once the week's run is done.
- **The pupil app** (19 Nov 2026) adds animal artwork, weekly missions and a squad total ("15 runners have kept this week"). It shows nothing that was not already on the cards and boards; the squad total is a count, with no names.

No contact details, addresses, photos of people, location tracking or messaging. Pupils cannot message each other or comment on anything. (I was asked whether pupils could send a selfie on the treadmill as proof: I have not built it, because it would break the "no photographs of pupils" promise above.)

## Who can see it

- **Coaches.** Signing in uses the school's own Microsoft 365 login (`@harrowappi.jp`), and the account must also be on a coach list that only I can edit. Both checks are enforced by the database itself, not just by the screen.
- **Pupils and other staff see a view-only copy** (open from 14 Nov 2026; one switch closes it): the cards, the leaderboards and each runner's "how your ratings are worked out" sheet, which is what is already printed and shown on the projector. It is a separate copy that never contains dates of birth, coach notes, real names behind an alias (names appear only as each runner's display setting allows), pasted source text or correction history, and ages appear only in whole years. Ability boards show the top 10 only. A runner whose family opts out appears only as "Hidden runner", with no card. The database refuses pupils' devices access to the full data, and they cannot change anything. The one exception, if switched on, is sending a treadmill run: the database checks every field of it (that it comes from the signed-in pupil, numbers in range, the photo crop under 150 kB), a pupil can see and withdraw only their own, and nothing appears on a card until a coach approves it.
- The site is not listed in search engines, all traffic is encrypted, and nothing is shared with third parties. There are no adverts or analytics.
- What pupils see is unchanged: printed cards and boards, and the projector in sessions. These already follow each runner's display setting (full name, first name, alias or hidden) and never show dates of birth.

## Where it is held

Google Firebase (Firestore), in Google's Tokyo region, under a Firebase project I created with my personal Google account (the school uses Microsoft, so there is no school Google account to hold it). I export a full backup weekly. A leaver's record can be deleted on request, and the whole database can be wiped from Settings.

## Decisions I would like from you

1. Are you content for pupil names, dates of birth and results to be held in Google Firebase on these terms, given that the project sits under my personal Google account and not a school-administered one?
2. Who else should be on the coach list (it currently holds only me)?
3. Are you content with the pupil view as described above? Any runner whose name should not appear can be set to an alias, or opted out of the ability boards, on their athlete page; it can also be closed at any time with one switch. The email that goes with this note is `docs/SAFEGUARDING-EMAIL.md`.
4. Are you content for pupils to send treadmill runs as described above? It is on from 18 Nov 2026; one switch turns it off at once.
5. Are you content for pupils to choose phone reminders as described above? They stay off until you agree.
