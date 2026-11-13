# Tasuki Cards website: note for the Designated Safeguarding Lead

From Fabian Loke, Trail Running. 13 November 2026. One page; decisions wanted are at the end.

## What it is

Tasuki Cards turns the trail running squad's results into ratings, cards and leaderboards. Until now it ran as a file on my laptop. I would like coaches to be able to use it on a phone or iPad at the track and on the hill, so it now also runs as a private website backed by a Google Firebase database (project `tasuki-cards`).

## What is stored about pupils

- Name, preferred name, year group, sex, house, and date of birth (needed for age-graded ratings).
- Running results: times, events, attendance at sessions, badges.
- A cartoon avatar the pupil designs. No photographs.
- An optional free-text coach note per runner. I will keep medical, pastoral and SEN information out of it; that stays in the school's own systems.

No contact details, addresses, photos, location tracking or messaging.

## Who can see it

- **Staff only.** Signing in uses the school's own Microsoft 365 login (`@harrowappi.jp`), and the account must also be on a coach list that only I can edit. Both checks are enforced by the database itself, not just by the screen.
- **Pupils cannot see anything.** A pupil who signs in gets a "not on the coach list" message and no data is sent to their device.
- The site is not listed in search engines, all traffic is encrypted, and nothing is shared with third parties. There are no adverts or analytics.
- What pupils see is unchanged: printed cards and boards, and the projector in sessions. These already follow each runner's display setting (full name, first name, alias or hidden) and never show dates of birth.

## Where it is held

Google Firebase (Firestore), in Google's Tokyo region, under a Firebase project I created with my personal Google account (the school uses Microsoft, so there is no school Google account to hold it). I export a full backup weekly. A leaver's record can be deleted on request, and the whole database can be wiped from Settings.

## Decisions I would like from you

1. Are you content for pupil names, dates of birth and results to be held in Google Firebase on these terms, given that the project sits under my personal Google account and not a school-administered one?
2. Who else should be on the coach list (it currently holds only me)?
3. **Not built, and will not be switched on without your sign-off:** a pupil view, where a runner could sign in and see their own card and the boards. If you are open to it, it would exclude dates of birth and coach notes, and I would bring you the design first.
