"""Make App Store and Google Play screenshots of the app running on mock data.

    pip install -r tools/requirements.txt
    python -m playwright install chromium     (once)
    python tools/screenshots.py

It builds the web version of the app (npx expo export -p web), serves it locally, signs in with the mock
token and photographs each tab at the sizes the stores ask for:

    store/screenshots/ios-6.9/        1320 x 2868  (iPhone 6.9", the size App Store Connect requires)
    store/screenshots/android-phone/  1080 x 1920

The web build draws the same React Native screens the phones do, so these match the real app closely.
Add --skip-build to reuse the last build, --dark for night-mode shots too.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import os
import shutil
import socketserver
import subprocess
import threading
from pathlib import Path

MOBILE = Path(__file__).resolve().parent.parent
DIST = MOBILE / "dist-web"
OUT = MOBILE / "store" / "screenshots"

SHOTS = [  # (file name, route, text that shows the screen has loaded, tab to tap first)
    ("01-today", "/", "Fill all as prescribed", None),
    ("02-program", "/program", "Phase calendar", None),
    ("03-progress", "/progress", "Current training maxes", None),
    ("04-body", "/body", "Body weight", None),
    ("05-club", "/club", "Club leaderboard", "Board"),
]
DEVICES = {  # name: (css width, css height, scale)
    "ios-6.9": (440, 956, 3),
    "android-phone": (360, 640, 3),
}


class SpaHandler(http.server.SimpleHTTPRequestHandler):
    """Serve the export; unknown paths get index.html so client-side routes load."""

    def send_head(self):
        path = Path(self.translate_path(self.path))
        if not path.exists():
            self.path = "/index.html"
        return super().send_head()

    def log_message(self, *args):
        pass


def build() -> None:
    env = {**os.environ, "EXPO_PUBLIC_API_MODE": "mock", "CI": "1"}
    if DIST.exists():
        shutil.rmtree(DIST)
    subprocess.run(f'npx expo export -p web --output-dir "{DIST}"', cwd=MOBILE, env=env, shell=True, check=True)


def serve() -> tuple[socketserver.TCPServer, int]:
    handler = functools.partial(SpaHandler, directory=str(DIST))
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-build", action="store_true")
    ap.add_argument("--dark", action="store_true", help="also take night-mode shots")
    args = ap.parse_args()
    if not args.skip_build or not DIST.exists():
        build()
    httpd, port = serve()
    from playwright.sync_api import sync_playwright

    exe = os.environ.get("OBC_CHROMIUM")
    schemes = ["light", "dark"] if args.dark else ["light"]
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
        for device, (w, h, scale) in DEVICES.items():
            for scheme in schemes:
                ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=scale,
                                          color_scheme=scheme, is_mobile=True, has_touch=True)
                ctx.add_init_script("localStorage.setItem('obc.token', 'mock-token')")
                page = ctx.new_page()
                errors: list[str] = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                folder = OUT / device
                folder.mkdir(parents=True, exist_ok=True)
                for name, route, marker, tap in SHOTS:
                    page.goto(f"http://127.0.0.1:{port}{route}")
                    if tap:
                        page.get_by_text(tap, exact=True).first.click()
                    page.get_by_text(marker, exact=False).first.wait_for(timeout=20000)
                    page.wait_for_timeout(900)  # charts measure themselves, fonts settle
                    suffix = "" if scheme == "light" else "-dark"
                    out = folder / f"{name}{suffix}.png"
                    page.screenshot(path=str(out))
                    print("wrote", out.relative_to(MOBILE))
                if errors:
                    raise SystemExit("The app threw errors in the browser:\n" + "\n".join(errors))
                ctx.close()
        browser.close()
    httpd.shutdown()


if __name__ == "__main__":
    main()
