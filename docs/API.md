# Orthodox Barbell Club app API (v1)

The JSON API the OBC iPhone and Android apps use. The website and the apps share one account system and one
training log, so a set logged in the app shows up on the website and the reverse.

Base URL: `https://orthodoxbarbellclub.com/api/v1`. Every response is JSON. A local dev server
(`python scripts/run_dev.py`) serves the same API at `http://127.0.0.1:5000/api/v1`.

The site is a harness: it doesn't define programs itself. Programs come from the RuskiMaxxing programs API
(`api.ruskimaxxing.com/v1/programs`) and sync nightly. A new program published there shows up in
`GET /programs` and works in the app with no app update. Programs are always rendered from the session
data described below, never hard-coded.

## Conventions

- **Auth.** `Authorization: Bearer <token>` on every call except `POST /auth/login`. Tokens come from login,
  last 180 days, and are revoked by `POST /auth/logout` or a password change. A missing or bad token gets
  `401 {"error": "..."}`.
- **Weights are kilograms** in requests and responses (`*_kg` fields). The app converts to the user's
  units (`user.units`, `"lb"` or `"kg"`) for display. `prescribed_display` fields are already formatted
  in the user's units for convenience (e.g. `"225 lb"`).
- **Errors.** `4xx` with `{"error": "message for a person", "problems": ["..."]}`. `problems` lists
  per-field issues on validation failures.
- **Dates** are ISO `YYYY-MM-DD`; timestamps are ISO 8601 UTC.
- **Sign-up** stays on the website (waiver, age check and parental consent for minors): the app opens
  `https://orthodoxbarbellclub.com/account/signup` in the browser. Account deletion is in the API, as
  Apple requires (`DELETE /me`).

## Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/login` | `{"email", "password", "device": "iPhone 15"}` | `{"token", "user": User}` |
| POST | `/auth/logout` | – | `{"ok": true}` (revokes this token) |

## Me

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/me` | – | `User` |
| PATCH | `/me` | any of `{"units": "lb"\|"kg", "name"}` | `User` |
| DELETE | `/me` | `{"password"}` | `{"ok": true}`: deletes the account and every log, for good |

`User`:
```json
{"id": 1, "name": "Dillon", "email": "a@b.com", "units": "lb", "sex": "M", "role": "admin",
 "bodyweight_kg": 90.7,
 "clubs": [{"slug": "stnicholas", "name": "St. Nicholas the Wonderworker Barbell Club", "role": "founder",
            "kind": "club", "url": "https://stnicholas.orthodoxbarbellclub.com/"}]}
```

## Programs and enrollment

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/programs` | – | `{"programs": [ProgramSummary], "addons": [ProgramSummary]}` |
| GET | `/enrollment` | – | `Enrollment` or `null` |
| POST | `/enrollment` | `{"program": slug, "start_week": 0-52, "start_date", "addons": [slug], "maxes_kg": {"Squat": 140.0, ...}, "club"?: slug}` | `Enrollment` (replaces any active one) |
| PATCH | `/enrollment/maxes` | `{"maxes_kg": {"Bench Press": 102.5}}` | `Enrollment` |

`ProgramSummary`: `{"slug", "name", "kind": "program"|"addon", "level", "days_per_week", "weeks",
"description", "main_lifts": ["Squat", ...], "phases": [["Baseline", [0]], ["Hypertrophy", [1,2,3]], ...]}`

`Enrollment`: `{"program": ProgramSummary, "addons": [ProgramSummary], "start_week", "start_date",
"maxes_kg": {"Squat": 140.0}, "club": slug | null, "next": {"week", "day_index"} | null}`

## Training

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/today` | – | `Session` (the next unlogged session) or `null` when the program is finished |
| GET | `/sessions/{week}/{day_index}` | – | `Session` |
| PUT | `/sessions/{week}/{day_index}/log` | `LogBody` | `{"session": Session, "new_maxes": ["Squat"], "prs": ["Squat"], "submit_max": {"lift", "weight_kg", "performed_on"} \| null}` |
| GET | `/history?before=YYYY-MM-DD&limit=20` | – | `{"workouts": [Workout]}` newest first |

`Session`:
```json
{"week": 1, "day_index": 0, "day": "Day 1 - Lower: Squat", "phase": "Hypertrophy", "cycle": 1,
 "logged": false, "performed_on": null, "notes": "",
 "exercises": [
   {"index": 0, "exercise": "Squat", "kind": "main", "sets": 1, "reps": "6", "percent": 75.0,
    "note": "Top set: ...", "prescribed_kg": 105.0, "prescribed_display": "230 lb",
    "tm_estimated": false, "addon": "", "learn": "/learn/atlas-stones" | null, "first_set": 1,
    "logged_sets": [{"set_no": 1, "weight_kg": 105.0, "reps": 6, "rpe": 8.0}]}]}
```
- `kind` is `main`, `variation`, `accessory`, `plyo`, `test` or `strongman`. Show `test` as a red "Test" tag.
- `reps` is a string: `"5"`, `"8-12"`, `"3+"` (as many as you can), `"Max"`, `"5RM"`, `"20 yd"`.
- `prescribed_kg` is null when there's no percent or no max to work from. Show `percent` and ask for the max.
- One lift can appear more than once in a day (5/3/1's ascending sets). `first_set` numbers its sets
  straight through, so set numbers are unique per exercise within the session.

`LogBody`:
```json
{"performed_on": "2026-10-05", "notes": "",
 "sets": [{"index": 0, "set_no": 1, "weight_kg": 105.0, "reps": 6, "rpe": 8.0}]}
```
`index` is the exercise's `index` in the session; `set_no` is `first_set + n - 1`. Saving replaces that
session's log. At least one set is required. A logged max on a `test` exercise becomes the training max
for the next cycle (`new_maxes`). A logged single on squat, bench or deadlift in a test session returns
`submit_max` so the app can offer to submit it to the leaderboard with a video.

`Workout`: `{"week", "day_index", "day", "program", "performed_on", "notes", "sets": [{"exercise", "set_no",
"weight_kg", "reps", "rpe"}]}`

## Progress

| Method | Path | Returns |
|---|---|---|
| GET | `/progress` | `{"maxes_kg": {...}, "best_e1rm": [{"exercise", "e1rm_kg", "weight_kg", "reps", "date"}], "rep_maxes": {"Squat": {"1": 160.0, "5": 140.0}}}` |
| GET | `/progress/{exercise}` | `{"exercise", "history": [{"date", "e1rm_kg"}]}` running best, for the chart |

## Body weight and body fat

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/bodyweight` | – | `{"entries": [{"id", "date", "weight_kg"}]}` newest first |
| POST | `/bodyweight` | `{"date", "weight_kg"}` | entry (one per day; same day replaces) |
| DELETE | `/bodyweight/{id}` | – | `{"ok": true}` |
| GET | `/bodyfat` | – | `{"entries": [{"id", "date", "percent", "method", "weight_kg", "lean_kg"}], "methods": [...]}` |
| POST | `/bodyfat` | `{"date", "percent", "method", "weight_kg"?}` | entry |
| DELETE | `/bodyfat/{id}` | – | `{"ok": true}` |

The latest body weight also updates `User.bodyweight_kg`, which the leaderboard uses for weight classes.

## Leaderboard maxes (video or it didn't happen)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/maxes` | – | `{"results": [{"id", "lift", "weight_kg", "bodyweight_kg", "performed_on", "video_url", "status"}]}` |
| POST | `/maxes` | `{"lift": "squat"\|"bench"\|"deadlift", "weight_kg", "bodyweight_kg", "performed_on", "video_url", "club"?: slug}` | result (`status: "pending"` until a club leader verifies it) |

`video_url` must be a link (YouTube, Instagram, Google Drive and so on). The app doesn't upload video files.

## Clubs

| Method | Path | Returns |
|---|---|---|
| GET | `/clubs/{slug}` | `{"slug", "name", "parish", "city", "state", "schedule", "about", "url", "my_role", "announcements": [{"body", "author", "created_at"}], "members": [{"name", "role"}]}` (announcements and members only for members and admins) |
| GET | `/clubs/{slug}/leaderboard` | `{"boards": {"total"\|"squat"\|"bench"\|"deadlift": [{"rank", "name", "weight_class", "bodyweight_kg", "total_kg", "dots", "lifts_kg": {"squat": 180.0}}]}, "team_total_kg", "team_size"}`: verified lifts from the last 12 months, ranked by DOTS |

## Club leaders (founder, leaders, and admins who oversee the club)

`User.clubs[].can_lead` and `GET /clubs/{slug}` → `can_lead` say whether to show the leader section.
Everything here answers `403` for anyone else. The website enforces the same rules (`obc/leadership.py`).

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/clubs/{slug}/manage` | – | `{"slug", "name", "requests": [{"id", "name", "requested_at"}], "members": [{"id", "name", "role", "is_me", "program"}], "invites": [Invite], "pending_lifts"}` |
| POST | `/clubs/{slug}/members/{id}` | `{"action": "approve"\|"deny"\|"make_leader"\|"make_member"\|"remove"}` | `{"ok", "message"}`. `id` is the membership id from `/manage` |
| GET | `/clubs/{slug}/invites` | – | `{"invites": [Invite]}` (usable ones only) |
| POST | `/clubs/{slug}/invites` | `{"days"?: 1-365, "uses"?: 1-1000}` (blank = never expires / unlimited) | `Invite`. Share `url` with the iOS/Android share sheet |
| DELETE | `/clubs/{slug}/invites/{id}` | – | `{"ok": true}` (revokes the link) |
| POST | `/clubs/{slug}/announcements` | `{"body"}` | `{"id", "body", "author", "created_at"}` |
| DELETE | `/clubs/{slug}/announcements/{id}` | – | `{"ok": true}` |
| GET | `/clubs/{slug}/lifts?status=pending\|reviewed` | – | `{"lifts": [Lift]}` |
| POST | `/lifts/{id}/review` | `{"action": "verify"\|"reject", "note"}` (a note is required to reject) | `{"ok", "message", "lift": Lift}` |

`Invite`: `{"id", "code", "url", "created_at", "created_by", "expires_at", "max_uses", "uses", "usable"}`

`Lift`: a leaderboard result plus `{"lifter", "lift_name", "embed_url" (YouTube embed or null), "submitted_at",
"review_note", "reviewer", "can_review"}`. Nobody can review their own lift (`can_review` is false); show the
video (`embed_url` in a WebView, else open `video_url`) before the Verify/Reject buttons.

Member rules: only an admin can change or remove a founder; a founder can't remove themselves; leaders can
approve and deny requests, promote members to leader, demote leaders and remove members.

## Site and regional admins (`User.is_staff`)

Regional admins see only the clubs and applications in their regions; site admins see everything.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/admin/summary` | – | `{"pending_applications", "pending_lifts", "regions": [...], "clubs": [{"slug", "name", "city", "state", "kind", "active", "members"}]}` |
| GET | `/admin/applications` | – | `{"applications": [{"id", "club_name", "slug", "parish", "city", "state", "region", "schedule", "about", "equipment": [...], "status", "applicant": {"name", "email"}, "submitted_at"}]}` |
| POST | `/admin/applications/{id}` | `{"action": "approve", "slug"?, "note"?}` or `{"action": "reject", "note"}` | `{"ok", "message", "club"?: {"slug", "url"}}` |
| GET | `/admin/lifts` | – | `{"lifts": [Lift]}` pending lifts across the admin's clubs; review with `POST /lifts/{id}/review` |

Admins manage any club they oversee with the club-leader endpoints above, member or not.
