"""Build the OBC app in Expo's cloud and send it to the App Store (or Google Play). One command.

    python tools/ship.py              # iPhone: build and submit to App Store Connect / TestFlight
    python tools/ship.py android      # Android: build (and submit if the Play key is present)
    python tools/ship.py ios --no-submit     # build only
    python tools/ship.py ios --skip-checks   # skip TypeScript and tests (not recommended)
    python tools/ship.py ios --dry-run       # do everything except the cloud build

Or double-click build_ios.bat / build_android.bat, which run this.

Steps: pull the latest code, install packages, run TypeScript and the tests, make sure you're signed in to
Expo as dandrews91, then build with EAS. iPhone builds are locked to your Apple team (Dillon REA Andrews,
GA9A5J9A44) and Apple ID, never anyone else's team. The first iPhone build asks for your Apple password and
the 2-factor code from your iPhone so EAS can make the signing certificate; after that it doesn't.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

EXPO_ACCOUNT = "dandrews91"
APPLE_ID = "andrews.dillon@gmail.com"
APPLE_TEAM_ID = "GA9A5J9A44"  # Dillon REA Andrews (Individual)
APPLE_TEAM_NAME = "Dillon REA Andrews (Individual)"
PLAY_KEY = ROOT / "google-play-service-account.json"
EAS = "npx --yes eas-cli@latest"


def say(title: str) -> None:
    print(f"\n=== {title} ===", flush=True)


def fail(message: str) -> None:
    print(f"\nStopped: {message}", flush=True)
    sys.exit(1)


def run(cmd: str, env: dict | None = None, capture: bool = False) -> subprocess.CompletedProcess:
    """Run a command in the repo folder. Interactive unless captured, so Apple's prompts reach you."""
    print(f"> {cmd}", flush=True)
    return subprocess.run(cmd, cwd=ROOT, shell=True, env=env or os.environ.copy(), text=True,
                          capture_output=capture)


def need(tool: str, hint: str) -> None:
    if not shutil.which(tool):
        fail(f"{tool} isn't installed. {hint}")


def pull() -> None:
    say("Getting the latest code")
    if not (ROOT / ".git").exists():
        print("Not a git checkout; using the files as they are.")
        return
    status = run("git status --porcelain", capture=True).stdout.strip()
    if status:
        print("You have local changes, so I won't pull over them:\n" + status)
        return
    if run("git pull --ff-only").returncode != 0:
        print("Couldn't pull (offline, or the branch has moved). Carrying on with what's here.")


def install() -> None:
    say("Installing packages")
    cmd = "npm ci" if (ROOT / "package-lock.json").exists() else "npm install"
    if run(cmd).returncode != 0:
        fail("package install failed (see above).")


def checks() -> None:
    say("Checking the code: TypeScript and tests")
    if run("npx tsc --noEmit").returncode != 0:
        fail("TypeScript found errors. Fix them before building.")
    if run("npx jest").returncode != 0:
        fail("tests failed. Fix them before building.")


def expo_login() -> None:
    say("Expo account")
    who = run(f"{EAS} whoami", capture=True)
    user = (who.stdout or "").strip().splitlines()[0].split()[0] if who.returncode == 0 and who.stdout.strip() else ""
    if user and user != EXPO_ACCOUNT:
        print(f"Signed in to Expo as {user}, but this app belongs to {EXPO_ACCOUNT}. Signing out first.")
        run(f"{EAS} logout")
        user = ""
    if not user:
        print(f"Sign in to Expo as {EXPO_ACCOUNT} ({APPLE_ID}).")
        if run(f"{EAS} login").returncode != 0:
            fail("Expo sign-in failed.")
    print(f"Expo: {EXPO_ACCOUNT}")


def build(platform: str, submit: bool, dry_run: bool) -> None:
    env = os.environ.copy()
    env["EAS_BUILD_NO_EXPO_GO_WARNING"] = "true"
    if platform == "ios":
        env["EXPO_APPLE_ID"] = APPLE_ID
        env["EXPO_APPLE_TEAM_ID"] = APPLE_TEAM_ID
        env["EXPO_APPLE_TEAM_TYPE"] = "INDIVIDUAL"
        say(f"Building for iPhone on Apple team {APPLE_TEAM_NAME}, {APPLE_TEAM_ID}")
        print("If Apple asks: sign in as " + APPLE_ID + ", enter the 6-digit code from your iPhone, pick")
        print(f"'{APPLE_TEAM_NAME}' if it lists teams, and answer yes to creating certificates and profiles.")
    else:
        say("Building for Android")
        if submit and not PLAY_KEY.exists():
            print(f"No {PLAY_KEY.name} yet, so this builds only. Upload the first .aab to Play Console by hand.")
            submit = False

    cmd = f"{EAS} build --platform {platform} --profile production"
    if submit:
        cmd += " --auto-submit-with-profile production"
    if dry_run:
        print(f"(dry run) would run: {cmd}")
        return
    # Try without prompts first (works once credentials exist), then fall back to interactive for first-time setup.
    if run(cmd + " --non-interactive", env=env).returncode == 0:
        return
    print("\nThe build needs your input (first-time signing setup). Running it interactively...")
    if run(cmd, env=env).returncode != 0:
        fail("the build failed. The link above shows the build log on expo.dev.")


def done(platform: str, submit: bool) -> None:
    say("Done")
    if platform == "ios" and submit:
        print("The build is uploading to App Store Connect. It appears under TestFlight in 10 to 30 minutes.")
        print("Next: STORE.md, steps 5 to 8 (TestFlight, listing, review notes, submit).")
        try:
            webbrowser.open("https://appstoreconnect.apple.com/apps")
        except Exception:
            pass
    elif platform == "android" and submit:
        print("The build is going to the Play Console internal testing track as a draft.")
    else:
        print(f"Build finished. Download it from https://expo.dev/accounts/{EXPO_ACCOUNT}/projects/orthodox-barbell-club/builds")


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the OBC app in the cloud and send it to the store.")
    ap.add_argument("platform", nargs="?", choices=["ios", "android"], default="ios")
    ap.add_argument("--no-submit", action="store_true", help="build only, don't upload to the store")
    ap.add_argument("--skip-checks", action="store_true", help="skip TypeScript and tests")
    ap.add_argument("--no-pull", action="store_true", help="don't git pull first")
    ap.add_argument("--dry-run", action="store_true", help="everything except the cloud build")
    args = ap.parse_args()

    need("node", "Install Node.js LTS from https://nodejs.org.")
    need("npm", "It comes with Node.js: https://nodejs.org.")
    if not args.no_pull:
        need("git", "Install Git from https://git-scm.com.")
        pull()
    install()
    if not args.skip_checks:
        checks()
    expo_login()
    build(args.platform, not args.no_submit, args.dry_run)
    if not args.dry_run:
        done(args.platform, not args.no_submit)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        fail("cancelled.")
