# The website: one-time setup (about ten minutes)

The website is the same app as `TASUKI-CARDS-OPEN-ME.html`, plus school Microsoft sign-in and a shared database, so it works on a phone, an iPad and a laptop with the same data. It will live at **https://tasuki-cards.web.app**.

These steps need your Google login, so they could not be done for you.

## 1. Three clicks in the Firebase console

Open https://console.firebase.google.com/project/tasuki-cards

1. **Build → Authentication → Sign-in method → Microsoft → Enable**, with the Application ID and secret from an app registered in the school's Microsoft Entra tenant (single tenant; redirect URI `https://tasuki-cards.firebaseapp.com/__/auth/handler`). School IT may need to do the registration.
2. **Build → Firestore Database → Create database.** Location: `asia-northeast1 (Tokyo)`. Start in **production mode**. (The location cannot be changed later.)
3. **Project settings (cog) → General → Your apps → Web (`</>`).** Nickname `Tasuki Cards`, tick **Also set up Firebase Hosting**, Register. Ignore the code it shows you; the site picks its settings up automatically.

## 2. Publish

On the laptop, in the project folder (Git Bash, after `source .tools/env.sh`):

```bash
npx firebase-tools login
```

```bash
npm run deploy
```

That publishes the site and the security rules. Open https://tasuki-cards.web.app and sign in as `floke@harrowappi.jp`.

## 3. Bring your data across

1. In the laptop file: **Settings → Data → Export everything**.
2. On the website: **Settings → Data → Import**, choose that file, **Replace**.

From then on the website is the master copy. Keep exporting a weekly backup (the banner reminds you).

## Adding coaches

Tap your name (top right) → type their school emails → **Save coach list**. Coaches see and edit everything. Anyone else with a school account, pupils included, is turned away and receives no data. See `docs/SAFEGUARDING-NOTE.md`.

## On a phone or iPad

Open the site in Safari or Chrome → Share → **Add to Home Screen**. The menu sits along the bottom; swipe it sideways for more. It keeps working with no signal: results entered on the hill sync when you are back online.

## Optional: publish automatically when `main` changes

`.github/workflows/deploy.yml` deploys on every merge once the repository has a secret named `FIREBASE_SERVICE_ACCOUNT_TASUKI_CARDS`:

1. Google Cloud console → IAM → Service accounts → Create (`github-deploy`) with roles **Firebase Hosting Admin**, **Firebase Rules Admin** and **Service Usage Consumer**.
2. Keys → Add key → JSON. 
3. GitHub → repository Settings → Secrets and variables → Actions → New secret, paste the whole JSON.

Until the secret exists the workflow just tests and builds.

## How it is built

- `src/cloud/firebase.ts`: the only network code (sign-in, `FirestoreStore`). `src/cloud/codec.ts`: the database layout (tested).
- `firestore.rules`: verified school account **and** head coach or coach list. The head coach's email is set there and in `src/ui/cloud/account.ts`.
- `npm run build` makes the website (`dist/`); `npm run build:single` still makes the offline file with no network code in it.
