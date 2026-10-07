# OBC: the Orthodox Barbell Club app

The iPhone and Android companion to [orthodoxbarbellclub.com](https://orthodoxbarbellclub.com). One account
and one training log with the website: a set logged here shows up there, and the reverse. It talks to the
site's JSON API (`/api/v1`) and nothing else.

The website and its API live in [andrewsdillon-design/orthodoxbarbellclub](https://github.com/andrewsdillon-design/orthodoxbarbellclub).
`docs/API.md` here is a copy of that repo's contract for reference; the website repo's copy is the one
that counts.

**Why this isn't Python.** Your projects are Python where it's practical, but Python can't produce a good native
iPhone app that Apple will accept. So this one is **Expo (React Native + TypeScript)**: one codebase,
built for both stores in Expo's cloud (EAS), so you never need a Mac or Xcode. The helper tools
(icons, screenshots, mock data) are still Python, in `tools/`.

## What's in it

| Tab | What it does |
|---|---|
| **Today** | The next session: sets × reps, weight in your units, notes and kind tags (Test in red). Type weight, reps and optional RPE per set, or "Fill as prescribed". Rest timer along the bottom. Save shows new PRs and new training maxes; a tested squat, bench or deadlift single offers to go to the leaderboard with a video link. |
| **Program** | Your program, add-ons, training maxes (edit and save), and the phase calendar. Tap a week to open any of its sessions. "Change program" lists whatever `GET /programs` returns; no program is hard-coded. |
| **Progress** | Training maxes, estimated-1RM chart per lift, best e1RMs, rep maxes. **History** is the workout log, newest first. |
| **Body** | Body weight with a chart (one per day), and monthly body fat with method and lean mass. |
| **Club** | Your clubs, announcements, members, and the club leaderboard (total, squat, bench, deadlift by DOTS). |
| **Settings** (gear) | Units (lb/kg, saved to your account), appearance (parchment, night, automatic), offline saves waiting to sync, your leaderboard submissions, help links, sign out, and **delete account** (Apple requires it). |

Sign-up stays on the website (waiver, age check and parental consent for minors); the app opens it in the browser.

**Offline.** The last data you loaded stays on the phone for a week, so the app opens in a garage with no
signal. A workout saved offline is kept on the phone and sent as soon as there's signal again (on
reconnect, on opening the app, or "Sync now" in Settings). If the server ever refuses one, it's flagged in
Settings to fix or discard; it's never silently dropped.

## Run it on your phone (Expo Go, sample data)

1. Install [Node.js LTS](https://nodejs.org) on the PC, and **Expo Go** from the App Store / Play Store on the phone.
2. Double-click **`start_mock.bat`** (or `npm install` then `npx expo start`).
3. Scan the QR code with the iPhone camera. Any email and password signs in; everything you do is kept until
   the app restarts.

`start_live.bat` runs against the real API instead. To use your own PC's copy of the site, pass its address:
`start_live.bat http://192.168.1.20:5000/api/v1`. Note that the website repo's `scripts/run_dev.py` only
listens on `127.0.0.1`, so a phone can't reach it as-is; it needs to listen on `0.0.0.0` for that.

### Mock vs live

`EXPO_PUBLIC_API_MODE` picks the data source at build time: `mock` (the default for `npx expo start`) or
`live`. `EXPO_PUBLIC_API_BASE` overrides the API address (default `https://orthodoxbarbellclub.com/api/v1`).
`eas.json` sets `live` for the **preview** and **production** builds and `mock` for **development**.

Mock mode serves `src/api/fixtures.json`, recorded from the real Flask API by `tools/record_fixtures.py`
(sample lifter, eight weeks of training, body tracking, a club and its leaderboard). It runs the website's
code from a checkout of the website repo, by default one cloned next to this repo
(`..\orthodoxbarbellclub`). After the API changes:

```
python tools/record_fixtures.py                       # or --site C:\path\to\orthodoxbarbellclub
```

## Checks

```
npx tsc --noEmit     # TypeScript
npx jest             # tests: API client, mock server, offline queue, set-logging form, unit conversion
npx expo-doctor      # Expo's own checks
```

## Builds and the stores

Everything builds in Expo's cloud. See **[STORE.md](STORE.md)** for the step-by-step checklist.

| File | What it's for |
|---|---|
| `build_ios.bat` | Checks, then builds the iPhone app in the cloud and submits it to App Store Connect |
| `build_android.bat` | The same for Google Play |
| `app.config.ts` | Name, bundle ID `com.orthodoxbarbellclub.app`, icons, splash, privacy and support URLs |
| `eas.json` | Build profiles: `development` (mock data), `preview` (live, install directly), `production` (store) |

## Brand

Byzantine, in the RuskiMaxxing style: imperial purple headers, ivory and parchment cards, gold rules and
borders, crimson for tests and PRs, with a night mode. Cinzel for display type, Archivo for text (the
website's fonts).

The icon is an **OBC roundel**: a gold double-headed eagle with a small three-bar cross between the heads,
gripping a barbell, "OBC" in Cinzel below, on an imperial-purple disc with a gold rim. It's original vector
art drawn by `tools/make_brand.py` (Python), which also renders every icon, the splash, the Play Store
feature graphic and `src/brand/roundelSvg.ts` (the same art inside the app). To change the art, edit the
script and run:

```
pip install -r tools/requirements.txt
python -m playwright install chromium
python tools/make_brand.py        # icons, splash, store graphics
python tools/screenshots.py       # store screenshots (store/screenshots/), --dark for night mode
```

## Layout

```
src/app/            screens (Expo Router: each file is a route)
  (tabs)/           Today, Program, Progress, Body, Club
  session/[week]/[day].tsx, enroll.tsx, submit-max.tsx, settings.tsx, login.tsx
src/api/            types.ts (the API contract), client.ts (typed client), mock.ts + fixtures.json
src/lib/            units, dates, the offline queue, the set-logging form, storage
src/state/          auth, React Query setup and cache, data hooks, sync
src/components/     UI kit, session logger, rest timer, chart, roundel and icons
tools/              Python: make_brand.py, screenshots.py, record_fixtures.py
store/              store graphics and screenshots
```

Dependencies are kept to Expo's own modules plus `@tanstack/react-query` (data), `react-native-svg`
(roundel, icons, charts), AsyncStorage and NetInfo (offline). `react-native-web` is there only for the
screenshot tool's web build.
