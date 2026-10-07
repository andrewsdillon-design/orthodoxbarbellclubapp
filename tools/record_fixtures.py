"""Record the app's mock data from the real Flask API, so mock mode serves exactly what the server sends.

    python tools/record_fixtures.py                 # the website repo cloned next to this one
    python tools/record_fixtures.py --site C:\\path\\to\\orthodoxbarbellclub

It builds a throwaway SQLite database with the dev sample data (scripts/run_dev.py), trains the sample
lifter through eight weeks of the program, logs body weight and body fat, then calls every GET endpoint
in docs/API.md and writes the answers to src/api/fixtures.json. Your own dev database isn't touched.
Re-run it whenever the API changes.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import random
import re
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

MOBILE = Path(__file__).resolve().parent.parent
OUT = MOBILE / "src" / "api" / "fixtures.json"
EMAIL, PASSWORD = "moses@demo.test", "demo-password"
WEEKS_TRAINED = 8
SITE = "https://orthodoxbarbellclub.com"


def tidy(value):
    """Round the long float tails (140.61363481791727) so the bundle stays small; 4 places is plenty."""
    if isinstance(value, float):
        return round(value, 4)
    if isinstance(value, list):
        return [tidy(v) for v in value]
    if isinstance(value, dict):
        return {k: tidy(v) for k, v in value.items()}
    return value


def first_number(reps: str) -> int:
    m = re.match(r"\d+", reps or "")
    return int(m.group()) if m else 5


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", type=Path, default=MOBILE.parent / "orthodoxbarbellclub",
                    help="the website repo (andrewsdillon-design/orthodoxbarbellclub), checked out on the API branch")
    args = ap.parse_args()
    site = args.site.resolve()
    sys.path.insert(0, str(site))
    tmp = Path(tempfile.mkdtemp()) / "fixtures.db"
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp}"

    spec = importlib.util.spec_from_file_location("run_dev", site / "scripts" / "run_dev.py")
    run_dev = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(run_dev)
    from obc import create_app

    app = create_app()
    app.config.update(TESTING=True, WTF_CSRF_ENABLED=False)
    random.seed(7)
    with app.app_context():
        run_dev.seed()
        c = app.test_client()
        token = c.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD,
                                                    "device": "fixtures"}).get_json()["token"]
        h = {"Authorization": f"Bearer {token}"}

        def get(path):
            r = c.get("/api/v1" + path, headers=h)
            assert r.status_code == 200, (path, r.status_code, r.get_data(as_text=True))
            return r.get_json()

        def send(method, path, body):
            r = c.open("/api/v1" + path, method=method, headers=h, json=body)
            assert r.status_code < 300, (path, r.status_code, r.get_data(as_text=True))
            return r.get_json()

        # Start the program eight weeks ago and train through it
        enrollment = get("/enrollment")
        start = date.today() - timedelta(weeks=WEEKS_TRAINED)
        send("POST", "/enrollment", {"program": enrollment["program"]["slug"], "start_week": 1,
                                     "start_date": start.isoformat(), "maxes_kg": enrollment["maxes_kg"],
                                     "addons": []})
        days = enrollment["program"]["days_per_week"]
        for week in range(1, WEEKS_TRAINED + 1):
            for day in range(days):
                s = get(f"/sessions/{week}/{day}")
                sets = []
                for ex in s["exercises"]:
                    reps = first_number(ex["reps"])
                    kg = ex["prescribed_kg"] or (20.0 if ex["kind"] in ("accessory", "variation") else None)
                    for n in range(max(ex["sets"], 1)):
                        extra = random.choice((0, 1, 2)) if ex["reps"].endswith("+") else 0
                        sets.append({"index": ex["index"], "set_no": ex["first_set"] + n, "weight_kg": kg,
                                     "reps": reps + extra,
                                     "rpe": random.choice((7.0, 7.5, 8.0, 8.5)) if ex["kind"] == "main" else None})
                when = start + timedelta(weeks=week - 1, days=day * 2)
                send("PUT", f"/sessions/{week}/{day}/log", {"performed_on": when.isoformat(), "notes": "",
                                                            "sets": sets})
        for i in range(30):
            when = date.today() - timedelta(days=90 - i * 3)
            send("POST", "/bodyweight", {"date": when.isoformat(),
                                         "weight_kg": round(93.5 - i * 0.07 + random.uniform(-0.4, 0.4), 1)})
        for months, pct in ((3, 19.5), (2, 18.6), (1, 17.9), (0, 17.2)):
            when = date.today() - timedelta(days=30 * months)
            send("POST", "/bodyfat", {"date": when.isoformat(), "percent": pct, "method": "Skinfold calipers",
                                      "weight_kg": round(93.2 - (3 - months) * 0.6, 1)})
        send("POST", "/maxes", {"lift": "squat", "weight_kg": 165.0, "bodyweight_kg": 91.5,
                                "performed_on": (start - timedelta(days=3)).isoformat(),
                                "video_url": "https://youtu.be/dQw4w9WgXcQ"})

        me = get("/me")
        enrollment = get("/enrollment")
        program = enrollment["program"]
        sessions = {}
        for week in range(0, program["weeks"] + 1):
            for day in range(program["days_per_week"]):
                r = c.get(f"/api/v1/sessions/{week}/{day}", headers=h)
                if r.status_code == 200:
                    sessions[f"{week}/{day}"] = r.get_json()
        progress = get("/progress")
        lifts = sorted({b["exercise"] for b in progress["best_e1rm"]})
        slug = me["clubs"][0]["slug"]
        fixtures = {
            "_note": "Recorded from the Flask API by tools/record_fixtures.py. Don't edit by hand.",
            "recorded_on": date.today().isoformat(),
            "me": me,
            "programs": get("/programs"),
            "enrollment": enrollment,
            "sessions": sessions,
            "history": get("/history?limit=100"),
            "progress": progress,
            "progress_by_exercise": {ex: get(f"/progress/{ex}") for ex in lifts},
            "bodyweight": get("/bodyweight"),
            "bodyfat": get("/bodyfat"),
            "maxes": get("/maxes"),
            "clubs": {slug: get(f"/clubs/{slug}")},
            "leaderboards": {slug: get(f"/clubs/{slug}/leaderboard")},
        }
    text = json.dumps(tidy(fixtures), separators=(",", ":")).replace("http://localhost:5000/c/", SITE + "/c/")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT.relative_to(MOBILE)} ({OUT.stat().st_size // 1024} KB, {len(sessions)} sessions)")


if __name__ == "__main__":
    main()
