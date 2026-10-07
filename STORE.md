# Store checklist: Monday (iPhone), then Google Play

Everything builds in Expo's cloud (EAS) from Windows. No Mac, no Xcode.

## Before Monday: must be true or the review fails

- [ ] **The API is live.** The backend PR (branch `claude/clever-mccarthy-w7i0d8`: `/api/v1`, body tracking,
      account deletion, privacy and support pages) is merged and deployed to orthodoxbarbellclub.com.
      Production builds talk to the live site; Apple's reviewer can't sign in otherwise.
      Check: `https://orthodoxbarbellclub.com/api/v1/me` should answer `{"error": "Sign in again."}`.
- [ ] **https://orthodoxbarbellclub.com/privacy** and **https://orthodoxbarbellclub.com/support** load.
      ⚠ They aren't on the live site yet; they arrive with that same backend PR.
- [ ] **A demo account for Apple's reviewer** exists on the live site, with a program, maxes, a few logged
      workouts and a club membership, so every tab has something in it. For example:
      `appreview@orthodoxbarbellclub.com` / a strong password. Don't use your own account; the reviewer
      may test account deletion. (Re-create it if they delete it.)
- [ ] The **support email** on /support is one you read.

## Monday: iPhone

### 1. Apple Developer Program (if not done)
- [ ] Enroll at https://developer.apple.com/programs/enroll/ ($99/year) with the Apple ID you'll use
      (dillonleon@me.com?). Turn on two-factor authentication first.
- [ ] **Individual or organization?** Individual is quickest (often approved within a day or two) but the
      App Store shows your personal name as the seller. Organization shows "Orthodox Barbell Club" but needs
      a legal entity and a D-U-N-S number, which can take one to two weeks. For Monday, individual is the
      realistic choice; you can transfer the app to an organization later.
- [ ] Wait for "Welcome to the Apple Developer Program" before building.

### 2. Expo account (free)
- [ ] Sign up at https://expo.dev/signup.

### 3. Use your own Apple team, not anyone else's
If your Apple ID is also on someone else's developer team (for example the team another app ships under),
EAS can pick the wrong one. To make sure OBC goes to **your** team:
- [ ] Open https://developer.apple.com/account → **Membership details**. Check it says Active, that the
      Account Holder is you, and copy the **Team ID** (10 characters).
- [ ] Your team is **Dillon REA Andrews (Individual)**. Whenever EAS lists Apple teams, pick that one, never
      Ron Seitz's team.
- [x] Team ID **GA9A5J9A44** is set in `build_ios.bat` and `app.config.ts`, so EAS uses only your team.
      (Fix `APPLE_ID` in `build_ios.bat` if you enrolled with an Apple ID other than dillonleon@me.com.)
- [ ] When `eas init` asks which **Expo** account owns the project, pick your personal account, not
      another organization's.
- [ ] If an earlier Apple sign-in for someone else's team is cached, EAS shows it ("Logged in as …"). Delete
      `%USERPROFILE%\.app-store` and run again to sign in fresh.

Other apps under other teams keep working as they are. EAS keeps certificates and profiles per bundle ID and
per team, so OBC on your team and another app on someone else's team don't interfere.

### 4. Build and submit (`build_ios.bat`)
- [ ] Double-click `build_ios.bat` in this repo. It installs packages, runs TypeScript, the tests and expo-doctor,
      then signs you in to Expo.
- [ ] **First run only:** it runs `eas init` and prints a project ID. Paste it into `app.config.ts` on the
      `EAS_PROJECT_ID` line (between the quotes), save, commit, and run `build_ios.bat` again.
- [ ] When asked, sign in with your **Apple ID** and let EAS create the distribution certificate and
      provisioning profile (answer **yes** each time). It also registers the bundle ID
      `com.orthodoxbarbellclub.app` and creates the app in App Store Connect if it isn't there.
- [ ] The build runs in the cloud (about 15 to 25 minutes; the link it prints shows progress), then
      `eas submit` uploads it. 10 to 30 minutes later it appears in App Store Connect under **TestFlight**.

The same steps by hand, in this repo's folder:
```
npm install
npx eas-cli@latest login
npx eas-cli@latest init                      (first time; paste the ID into app.config.ts)
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest submit -p ios --latest
```

### 5. Try it on your iPhone first (TestFlight)
- [ ] App Store Connect → the app → TestFlight → add yourself as an internal tester; install **TestFlight**
      from the App Store and open the build. Sign in, log a set, change units, check every tab.

### 6. App Store Connect listing
App Store Connect → Apps → Orthodox Barbell Club → the 1.0 version.

| Field | Enter |
|---|---|
| Name | Orthodox Barbell Club |
| Subtitle | Garage-gym barbell training |
| Category | Health & Fitness (secondary: Sports) |
| Promotional text | Log every set, follow your program, and climb your club's leaderboard. |
| Keywords | barbell,powerlifting,strength,training log,workout,squat,bench,deadlift,club,orthodox,garage gym |
| Support URL | https://orthodoxbarbellclub.com/support |
| Marketing URL | https://orthodoxbarbellclub.com |
| Privacy Policy URL | https://orthodoxbarbellclub.com/privacy |
| Copyright | 2026 Dillon REA Andrews |
| Price | Free |

**Description:**

> Orthodox Barbell Club is the companion app to orthodoxbarbellclub.com: free barbell clubs for Orthodox
> Christian men training in garage gyms, together with the men of their parish and town.
>
> • Today's session, worked out from your training maxes: sets, reps and weights in pounds or kilograms.
> • Fast set logging with "fill as prescribed", RPE and a rest timer.
> • New personal records and training maxes the moment you save.
> • Programs from RuskiMaxxing, with a phase calendar for the whole year. New programs appear automatically.
> • Estimated-max charts, rep maxes and your full training history.
> • Body weight and monthly body fat with lean mass.
> • Your club: announcements, members and the club leaderboard, ranked by DOTS.
> • Test-week maxes go to the leaderboard with a video link. Video or it didn't happen.
> • Works in the garage with no signal: workouts save on your phone and sync later.
>
> One account with the website: a set logged here shows up there. Create your free account at
> orthodoxbarbellclub.com.

**Screenshots** (6.9" display, 1320 × 2868; already made):
- [ ] Upload `store/screenshots/ios-6.9/01-today.png` … `05-club.png` (the `-dark` versions are optional
      extras; Apple takes up to 10). The app is iPhone-only (`supportsTablet: false`), so no iPad
      screenshots are needed. Re-make them any time: `python tools/screenshots.py --dark`.

**App icon:** taken from the build (`assets/icon.png`, 1024 × 1024, no transparency).

**Age rating** (App Store Connect → App Information → Age Rating): answer **None / No** to every content
question (no violence, mature themes, gambling, medical treatment info, unrestricted web access, and so on).
Club announcements and member names are shared with club members, so answer **Yes** if asked about
user-generated content, and mention in the review notes that clubs are private and moderated by their
leaders. Don't tick "Made for Kids". Expect 4+ (or 9+/13+ under Apple's newer tiers if UGC raises it).

**App Privacy** (App Store Connect → App Privacy → Get Started). No tracking. Data collected, all
**linked to the user** and used for **App Functionality** only:
- Contact Info: Name, Email Address
- Health & Fitness: Fitness (workouts, maxes), Health (body weight, body fat)
- User Content: Other User Content (workout notes, leaderboard video links)
- Identifiers: User ID
- (The phone model is stored with the sign-in token so you can see where you're signed in; it's not an identifier.)

**Encryption:** already answered in the build (`ITSAppUsesNonExemptEncryption = false`; only standard HTTPS).

**Sign in with Apple:** not required; the app only uses its own accounts (guideline 4.8).

**Account deletion:** Settings → Delete account (guideline 5.1.1(v)). Sign-up is on the website, which is allowed.

### 7. App Review information
- [ ] Sign-in required: **Yes**. User name: `appreview@orthodoxbarbellclub.com` · Password: `________`
      (the demo account from "Before Monday").
- [ ] Contact: your name, phone and email.
- [ ] **Notes for review** (paste and fill in):

> Orthodox Barbell Club is the companion app to orthodoxbarbellclub.com, a free website for Orthodox
> Christian barbell clubs that train in garage gyms. Accounts are created on the website because sign-up
> includes a liability waiver and, for minors, parental consent; the app opens the sign-up page in Safari.
>
> Demo account: appreview@orthodoxbarbellclub.com / ________. It is enrolled in a training program and is a
> member of a sample club, so every tab has data.
>
> To try the main flow: Today → "Fill all as prescribed" → "Save workout". Program shows the phase calendar
> and training maxes; Progress shows charts and history; Body tracks body weight and body fat; Club shows
> the club's announcements, members and leaderboard.
>
> Account deletion: tap the gear (top right) → Settings → Delete account → enter the password. This deletes
> the account and all of its data on the server.
>
> Clubs are private groups run by their founders, who moderate announcements and verify leaderboard
> submissions. Leaderboard submissions are links to videos the user hosts elsewhere (e.g. YouTube); the app
> doesn't upload video.

### 8. Submit
- [ ] Version 1.0 → Build → pick the build from TestFlight → **Add for Review** → **Submit to App Review**.
- [ ] Release: "Manually release this version" lets you choose the day it goes live.
- [ ] Review usually takes one to two days. If rejected, the message says why; fix, run `build_ios.bat`
      (the build number goes up automatically), and resubmit.

## After: Google Play

### 1. Play Console account
- [ ] Sign up at https://play.google.com/console ($25 once) and complete identity verification (can take days).
- [ ] ⚠ **New personal accounts must run a closed test with at least 12 testers for 14 days** before they
      can publish to production. Start it early: recruit 12 men from the club. An organization account
      (needs a D-U-N-S number) skips this.

### 2. Create the app
- [ ] Create app: name **Orthodox Barbell Club**, App, Free. Package name comes from the first upload:
      `com.orthodoxbarbellclub.app`.

### 3. First build and upload
- [ ] Double-click `build_android.bat` (EAS creates and keeps the upload keystore for you; say yes).
- [ ] The first upload has to be by hand: download the `.aab` from the build page, then Play Console →
      Testing → Internal testing → Create release → upload it.
- [ ] For automatic uploads after that: Google Cloud → create a service account with access to the Play
      Console app (Users and permissions → invite the service-account email, Release manager), download its
      JSON key as `google-play-service-account.json` in this repo's folder (it's git-ignored; never commit it). From then on
      `build_android.bat` uploads to the internal track as a draft.

### 4. Store listing (Grow → Store presence → Main store listing)
| Field | Enter |
|---|---|
| App name | Orthodox Barbell Club |
| Short description (80) | Log every set, follow your program, and climb your club's leaderboard. |
| Full description | Same as the App Store description above |
| App icon | `store/play-icon-512.png` |
| Feature graphic | `store/play-feature-graphic.png` (1024 × 500) |
| Phone screenshots | `store/screenshots/android-phone/01-today.png` … `05-club.png` (1080 × 1920) |
| Category | Health & Fitness |
| Contact email / website | your support email / https://orthodoxbarbellclub.com |
| Privacy policy | https://orthodoxbarbellclub.com/privacy |

### 5. App content (Policy → App content)
- [ ] **App access:** "All or some functionality is restricted" → add the demo account and the same
      instructions as Apple's review notes.
- [ ] **Ads:** No ads.
- [ ] **Content rating:** IARC questionnaire, category "Utility, Productivity, Communication, or Other" (or
      Health & Fitness if offered). Answer No to violence, sexuality, language, drugs, gambling. Users interact
      (club announcements): Yes, and they can share info with club members. Expect Everyone / PEGI 3.
- [ ] **Target audience:** 13+ or 18+ (not children). Not designed for kids.
- [ ] **Data safety:** collects Name, Email, User IDs (account management, app functionality); Health info
      and Fitness info (app functionality); Other user-generated content (app functionality). Encrypted in
      transit: Yes. Users can request deletion: Yes (in the app, and the URL
      https://orthodoxbarbellclub.com/privacy). No data shared with third parties. No ads.
- [ ] **Health apps declaration:** fitness tracking, not a medical device.
- [ ] **Account deletion URL** (asked in Data safety): https://orthodoxbarbellclub.com/support (its FAQ already
      explains deleting from the app and the website).

### 6. Release
- [ ] Closed testing with 12+ testers for 14 days (personal accounts), then Production → Create release →
      promote the tested build → Send for review (usually a few days the first time).

## Every release after this
1. Change the code, then raise `version` in `app.config.ts` (1.0.1, 1.1.0, …). Build numbers go up by themselves.
2. `build_ios.bat` / `build_android.bat`.
3. In each store console, add the new build to a new version, write "What's new", submit.
