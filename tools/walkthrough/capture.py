"""Capture the app walkthrough: drive the OBC app through every feature and screenshot each step.

    python tools/walkthrough/capture.py                 # writes tools/walkthrough/shots/
    python tools/walkthrough/capture.py --show          # watch the browser while it works

It builds the app's web version from this repo (the same screens and code as the iPhone build) in demo
mode, so it uses the sample lifter and club and never touches orthodoxbarbellclub.com or a real account.
Each step saves a phone-sized screenshot, a title and caption, and the box the camera should push in on,
listed in shots/manifest.json for render_blender.py.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
import re
import shutil
import socketserver
import subprocess
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DIST = ROOT / "dist-web"
W, H, SCALE = 430, 932, 2.5  # an iPhone 15 Pro Max screen, in points


class SpaHandler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        if not Path(self.translate_path(self.path)).exists():
            self.path = "/index.html"
        return super().send_head()

    def log_message(self, *args):
        pass


def build_web() -> None:
    env = {**os.environ, "EXPO_PUBLIC_API_MODE": "mock", "CI": "1"}
    if DIST.exists():
        shutil.rmtree(DIST)
    subprocess.run(f'npx expo export -p web --output-dir "{DIST}"', cwd=ROOT, env=env, shell=True, check=True)


def serve() -> tuple[socketserver.TCPServer, int]:
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(SpaHandler, directory=str(DIST)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


class Walk:
    def __init__(self, page, out: Path, base: str):
        self.p, self.out, self.base, self.steps = page, out, base, []

    def go(self, route: str, wait_for: str):
        self.p.goto(self.base + route)
        self.text(wait_for).wait_for(timeout=30000)
        self.p.wait_for_timeout(900)

    def text(self, t: str, exact: bool = False, last: bool = False):
        loc = self.p.get_by_text(t, exact=exact)
        return loc.last if last else loc.first

    def tap(self, t: str, exact: bool = True, last: bool = False, wait: int = 700):
        self.text(t, exact, last).click()
        self.p.wait_for_timeout(wait)

    def scroll_to(self, t: str, exact: bool = False):
        self.text(t, exact).scroll_into_view_if_needed()
        self.p.evaluate("window.scrollBy(0, 0)")
        self.p.wait_for_timeout(400)

    def to_top(self, t: str, offset: float = 120, exact: bool = False):
        """Scroll so this text sits near the top of the screen, below the header."""
        self.p.mouse.move(W / 2, H / 2)
        for _ in range(3):
            b = self.text(t, exact).bounding_box()
            if not b or abs(b["y"] - offset) < 8:
                break
            self.p.mouse.wheel(0, b["y"] - offset)
            self.p.wait_for_timeout(450)

    def focus_box(self, texts: list[str], pad: float = 14):
        """The union of where these texts sit on screen, as fractions of the screen (x, y, w, h)."""
        boxes = []
        for t in texts:
            loc = self.p.get_by_text(t)
            for i in range(min(loc.count(), 6)):  # the first copy that's on screen
                b = loc.nth(i).bounding_box()
                if b and b["y"] < H - 10 and b["y"] + b["height"] > 10 and b["width"] > 0:
                    boxes.append(b)
                    break
        if not boxes:
            return None
        x0 = max(0, min(b["x"] for b in boxes) - pad)
        y0 = max(0, min(b["y"] for b in boxes) - pad)
        x1 = min(W, max(b["x"] + b["width"] for b in boxes) + pad)
        y1 = min(H, max(b["y"] + b["height"] for b in boxes) + pad)
        return [x0 / W, y0 / H, (x1 - x0) / W, (y1 - y0) / H]

    def shot(self, title: str, caption: str, focus: list[str] | None = None):
        n = len(self.steps) + 1
        name = f"step{n:02d}.png"
        box = self.focus_box(focus) if focus else None
        self.p.screenshot(path=str(self.out / name))
        self.steps.append({"image": name, "title": title, "caption": caption, "focus": box})
        print(f"  {n:2d}. {title}")


def run(w: Walk) -> None:
    # Sign in
    w.go("/login", "Sign in")
    # The demo-data notice is for people trying the sample build; leave it out of the video
    w.p.evaluate("""() => { const hits = [...document.querySelectorAll('div')].filter(
        (el) => el.childElementCount === 0 && el.textContent.startsWith('Demo mode:'));
        if (hits.length) hits[hits.length - 1].parentElement.style.display = 'none'; }""")
    w.shot("Sign in", "One account with the website. New men sign up on orthodoxbarbellclub.com.",
           ["Email", "Sign in"])
    w.p.locator("input").nth(0).fill("dillon@example.com")
    w.p.locator("input").nth(1).fill("demo-password")
    w.tap("Sign in", last=True, wait=1500)

    # Today
    w.go("/", "Fill all as prescribed")
    w.shot("Today's session", "The next session in your program, worked out from your training maxes.",
           ["Week 9", "Fill all as prescribed"])
    w.tap("Fill all as prescribed")
    w.to_top("5 × 3 @")
    w.shot("Fill as prescribed", "Sets × reps and the weight in your units. One tap fills every set; change what you need.",
           ["5 × 3 @"])
    # A heavier top set, for a PR
    w.p.get_by_label("Squat set 1 weight").fill("320")
    w.p.get_by_label("Squat set 1 RPE").fill("9")
    w.tap("2:00", wait=1300)
    w.shot("Rest timer", "Start a rest timer between sets. It buzzes when it's time to lift.",
           ["Stop", "+15"])
    w.tap("Stop")
    w.scroll_to("Save workout", exact=True)
    w.tap("Save workout", wait=1500)
    w.text("Workout saved").wait_for(timeout=10000)
    w.shot("Personal records", "Save, and new PRs and training maxes show right away.",
           ["Workout saved", "New personal records"])
    w.tap("Done", wait=1500)

    # Program
    w.go("/program", "Phase calendar")
    w.shot("Your program", "Programs come from RuskiMaxxing and show up here as they're published.",
           ["RuskiMaxxing Year 1", "Change program or add-ons"])
    w.to_top("Training maxes")
    w.shot("Training maxes", "Change a max and every weight in the program follows.", ["Training maxes", "Save maxes"])
    w.to_top("Phase calendar")
    w.shot("Phase calendar", "The whole year by phase. Tap any week to open its sessions.", ["Phase calendar"])
    w.go("/enroll", "Add-ons")
    w.shot("Change program", "Pick a program and add-ons, where to start, and your maxes.", ["Main lifts"])

    # Progress and history
    w.go("/progress", "Current training maxes")
    w.to_top("estimated 1RM")
    w.shot("Progress", "Estimated one-rep max for every lift, charted over time, with rep maxes.",
           ["estimated 1RM", "Best e1RM"])
    w.tap("History")
    w.p.wait_for_timeout(800)
    w.shot("History", "Every workout you've logged, newest first.", ["Day 3 - Variations"])

    # Body
    w.go("/body", "Body weight")
    w.shot("Body weight", "Log a weigh-in and watch the trend. Your latest sets your weight class.",
           ["over a month", "Add"])
    w.to_top("Body fat (monthly)")
    w.shot("Body fat", "Once a month: body fat, the method you used, and your lean mass.", ["Body fat (monthly)", "lean mass"])

    # Club
    w.go("/club", "Training times")
    w.shot("Your club", "Your club's schedule, announcements and members.", ["Training times", "News"])
    w.tap("Board")
    w.scroll_to("Club leaderboard")
    w.shot("Club leaderboard", "Verified lifts only, ranked by DOTS so every weight class competes.",
           ["Club leaderboard", "Team total"])

    # Lead
    w.p.get_by_text(re.compile(r"^Lead( \(\d+\))?$")).first.click()
    w.p.wait_for_timeout(1500)
    w.text("Lifts to verify").wait_for(timeout=10000)
    w.to_top("Ivan", offset=200)
    w.shot("Lead: verify lifts", "Founders and leaders watch the video, then verify or reject. Video or it didn't happen.",
           ["Ivan", "Verify"])
    w.tap("Verify", wait=1300)
    w.scroll_to("Join requests")
    w.shot("Lead: join requests", "Approve or deny the men asking to join.", ["Join requests", "Basil"])
    w.tap("Approve", wait=1300)
    w.scroll_to("Post to the club")
    w.p.get_by_placeholder("Tell the club something…").fill("Test week starts Monday. Film your top singles.")
    w.shot("Lead: announcements", "Post to the whole club, and delete old announcements.", ["Post to the club"])
    w.scroll_to("Make an invite link")
    w.shot("Lead: invite links", "Make an invite link and send it with the phone's share sheet.",
           ["Make an invite link", "Revoke"])
    w.scroll_to("Make leader")
    w.shot("Lead: members", "Make leaders, step them down, or remove a member.", ["Make leader"])

    # Admin and settings
    w.go("/admin", "St. Herman Barbell Club")
    w.shot("Admin", "Site and regional admins approve new clubs and see every lift waiting.",
           ["Overview", "St. Herman Barbell Club"])
    w.go("/settings", "Units")
    w.shot("Settings", "Pounds or kilograms, night mode, and offline saves waiting to sync.",
           ["Units", "Appearance"])
    w.scroll_to("Delete my account")
    w.shot("Your account", "Sign out, or delete your account and everything in it.", ["Delete my account"])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "shots"))
    ap.add_argument("--show", action="store_true", help="watch the browser")
    ap.add_argument("--skip-build", action="store_true", help="reuse the last web build in dist-web/")
    args = ap.parse_args()
    out = Path(args.out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    if not args.skip_build or not DIST.exists():
        print("== Building the app's web version (demo data)")
        build_web()
    httpd, port = serve()
    from playwright.sync_api import sync_playwright

    exe = os.environ.get("OBC_CHROMIUM")
    with sync_playwright() as p:
        browser = (p.chromium.launch(executable_path=exe, headless=not args.show) if exe
                   else p.chromium.launch(headless=not args.show))
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=SCALE, is_mobile=True,
                                  has_touch=True, color_scheme="light")
        page = ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        print("== Walking through the app")
        walk = Walk(page, out, f"http://127.0.0.1:{port}")
        run(walk)
        browser.close()
    httpd.shutdown()
    (out / "manifest.json").write_text(json.dumps({"width": W, "height": H, "steps": walk.steps}, indent=2))
    if errors:
        raise SystemExit("The app threw errors:\n" + "\n".join(errors))
    print(f"== {len(walk.steps)} steps in {out}")


if __name__ == "__main__":
    main()
