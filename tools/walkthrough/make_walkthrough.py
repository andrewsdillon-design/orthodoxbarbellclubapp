"""Make the app walkthrough video in one go, rendered in Blender on your graphics card.

    python tools/walkthrough/make_walkthrough.py --preview 5     # one still of step 5 in seconds, to check the look
    python tools/walkthrough/make_walkthrough.py --draft         # quick half-size video first
    python tools/walkthrough/make_walkthrough.py                 # the full 1080p video
    python tools/walkthrough/make_walkthrough.py --skip-capture  # re-render the screens you already have
    python tools/walkthrough/make_walkthrough.py --music hymn.mp3

Or double-click tools/walkthrough/make_walkthrough.bat. The video lands in
tools/walkthrough/out/obc-app-walkthrough.mp4.

What it does:
1. Installs what's missing for the capture (the app's packages, Playwright and its Chromium).
2. capture.py builds the app's web version from this repo (build 4's screens) in demo mode and clicks through
   every feature, saving phone-sized screens to tools/walkthrough/shots/.
3. Finds Blender, tells Windows to run it on the high-performance graphics card (laptops like a ThinkPad
   with two graphics chips otherwise often get the slow built-in one), and renders with EEVEE, which draws
   on the graphics card. Use --engine cycles to render with Cycles on the card instead.
"""

from __future__ import annotations

import argparse
import glob
import importlib.util
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SHOTS = HERE / "shots"
OUT = HERE / "out" / "obc-app-walkthrough.mp4"


def find_blender() -> str | None:
    if os.environ.get("BLENDER"):
        return os.environ["BLENDER"]
    found = shutil.which("blender")
    if found:
        return found
    candidates = []
    for base in (os.environ.get("ProgramFiles", r"C:\Program Files"), os.environ.get("ProgramFiles(x86)", "")):
        if base:
            candidates += glob.glob(os.path.join(base, "Blender Foundation", "Blender*", "blender.exe"))
    candidates += glob.glob(os.path.expanduser(r"~\AppData\Local\Programs\Blender Foundation\Blender*\blender.exe"))
    candidates += glob.glob(r"C:\Program Files\WindowsApps\BlenderFoundation.Blender*\Blender\blender.exe")
    candidates += glob.glob(os.path.expanduser(r"~\scoop\apps\blender\current\blender.exe"))
    candidates += ["/Applications/Blender.app/Contents/MacOS/Blender"]
    candidates = [c for c in candidates if os.path.exists(c)]

    def version(path):
        digits = "".join(ch if ch.isdigit() or ch == "." else " " for ch in path).split()
        return [tuple(int(p) for p in d.split(".") if p) for d in digits if "." in d] or [(0,)]
    return max(candidates, key=version) if candidates else None


def prefer_fast_gpu(exe: str) -> None:
    """Windows: Settings > Display > Graphics > Blender > High performance, done for you.

    On a laptop with built-in and dedicated graphics (NVIDIA or AMD), this makes Windows run Blender on the
    dedicated card. Harmless on a PC with only one graphics chip.
    """
    if os.name != "nt":
        return
    try:
        import winreg
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\DirectX\UserGpuPreferences")
        winreg.SetValueEx(key, str(Path(exe).resolve()), 0, winreg.REG_SZ, "GpuPreference=2;")
        winreg.CloseKey(key)
        print("Windows will run Blender on the high-performance graphics card.")
    except OSError as e:
        print(f"Couldn't set the graphics preference ({e}). Set it by hand: Settings > System > Display > "
              "Graphics > add blender.exe > High performance.")


def ensure_capture_tools() -> None:
    if not (ROOT / "node_modules").exists():
        print("== Installing the app's packages (first time only)")
        subprocess.run("npm install", cwd=ROOT, shell=True, check=True)
    if importlib.util.find_spec("playwright") is None:
        print("== Installing Playwright (first time only)")
        subprocess.run([sys.executable, "-m", "pip", "install", "playwright"], check=True)
        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)


def main() -> int:
    ap = argparse.ArgumentParser(description="Capture the app and render the walkthrough video in Blender.")
    ap.add_argument("--draft", action="store_true", help="half size, fewer samples: a quick check")
    ap.add_argument("--preview", type=int, help="render one still of this step (0 = title card) and stop")
    ap.add_argument("--skip-capture", action="store_true", help="reuse the screens in tools/walkthrough/shots")
    ap.add_argument("--show", action="store_true", help="watch the browser during capture")
    ap.add_argument("--engine", choices=("eevee", "cycles"), default="eevee", help="both render on the graphics card")
    ap.add_argument("--music", help="optional audio file for a soundtrack")
    ap.add_argument("--frames", type=int, help="render only the first N frames (a test clip)")
    args = ap.parse_args()

    if not args.skip_capture or not (SHOTS / "manifest.json").exists():
        ensure_capture_tools()
        print("== Capturing the app")
        cmd = [sys.executable, str(HERE / "capture.py"), "--out", str(SHOTS)] + (["--show"] if args.show else [])
        if subprocess.call(cmd) != 0:
            print("Capture failed (see above).")
            return 1

    blender = find_blender()
    if not blender:
        print("Blender isn't installed. Install it (winget install BlenderFoundation.Blender, or blender.org), "
              "or set BLENDER to blender.exe's full path, then run this again with --skip-capture.")
        return 1
    prefer_fast_gpu(blender)
    print(f"== Rendering in {blender}")
    cmd = [blender, "-b", "-P", str(HERE / "render_blender.py"), "--", "--shots", str(SHOTS), "--out", str(OUT),
           "--quality", "draft" if args.draft else "final", "--engine", args.engine]
    if args.preview is not None:
        cmd += ["--preview", str(args.preview)]
    if args.music:
        cmd += ["--music", args.music]
    if args.frames:
        cmd += ["--frames", str(args.frames)]
    started = time.time()
    code = subprocess.call(cmd)
    minutes = (time.time() - started) / 60
    if code == 0:
        where = OUT.parent / f"preview-step{args.preview:02d}.png" if args.preview is not None else OUT
        print(f"\nDone in {minutes:.1f} min: {where}")
        if os.name == "nt":
            os.startfile(where)  # open it
    return code


if __name__ == "__main__":
    sys.exit(main())
