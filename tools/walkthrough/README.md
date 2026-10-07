# App walkthrough video (build 4)

A 2½-minute video of the OBC app: signing in, today's session, filling and logging sets, the rest timer, PRs,
the program and phase calendar, progress charts and history, body weight and body fat, the club and its
leaderboard, the leader tools (verifying lifts, join requests, announcements, invite links, members), the
admin screen and settings. 1920×1080, 30 fps, in the app's purple and gold.

It's made in two steps, both run by `make_walkthrough.py` (or double-click `make_walkthrough.bat`):

1. **`capture.py`** builds the app's web version from this repo (the same screens as build 4) with the demo
   data, clicks through every feature, and saves phone-sized screens with a caption and the spot to zoom
   in on, in `shots/`. It never touches orthodoxbarbellclub.com or a real account.
2. **`render_blender.py`** runs inside Blender. Each screen stands in a gold-rimmed phone on a dark stage;
   the camera glides from phone to phone, pushes in on what matters, and the step's title and caption sit
   beside the phone. It opens and closes on OBC cards and renders `out/obc-app-walkthrough.mp4`.

**On the graphics card.** It renders with EEVEE, which always draws on the graphics card. Before rendering,
`make_walkthrough.py` also tells Windows to run Blender on the high-performance card (the same as Settings →
System → Display → Graphics → Blender → High performance). That matters on a ThinkPad with both Intel and
NVIDIA graphics. The render prints which card it's using. `--engine cycles` renders with Cycles on the card
instead (OptiX or CUDA on NVIDIA, HIP on AMD, oneAPI on Intel Arc).

## Paste this into a Claude Code Remote Control session on the ThinkPad

```
In my orthodoxbarbellclubapp repo (clone https://github.com/andrewsdillon-design/orthodoxbarbellclubapp.git
into %USERPROFILE%\orthodoxbarbellclubapp if it isn't on this computer yet, otherwise git pull on main):

1. Make sure Python 3.10+, Node.js LTS and Blender 4.2+ are installed. Install any that are missing with
   winget (Python.Python.3.12, OpenJS.NodeJS.LTS, BlenderFoundation.Blender).
2. Run: python tools\walkthrough\make_walkthrough.py --preview 5
   It installs what the capture needs, captures the app, and renders one still. Show me
   tools\walkthrough\out\preview-step05.png and tell me which graphics card the render line names.
3. If it looks right, run: python tools\walkthrough\make_walkthrough.py --skip-capture --draft
   for a quick half-size version, then the full one: python tools\walkthrough\make_walkthrough.py --skip-capture
4. Tell me where the finished MP4 is and how long the render took.
If a step fails, read the error, fix it in tools/walkthrough/, and try again.
```

## By hand

```
python tools\walkthrough\make_walkthrough.py --preview 5         # one still, seconds: check the look
python tools\walkthrough\make_walkthrough.py --draft             # half size, quick
python tools\walkthrough\make_walkthrough.py                     # full 1080p
python tools\walkthrough\make_walkthrough.py --skip-capture --music hymn.mp3
```

- `--preview 0` shows the title card; `--preview N` shows step N at its close-up.
- `--skip-capture` re-renders the screens you already have (after changing timing or colours).
- `--show` lets you watch the browser during capture.
- `--frames 300` renders just the first 10 seconds, to test.
- If Blender is somewhere unusual, set `BLENDER` to the full path of `blender.exe`.
- The full video is 4,735 frames. On a ThinkPad's NVIDIA card expect roughly 10–30 minutes; the draft is
  about a quarter of that. On built-in graphics it's slower but works.

## Changing it

- Steps, captions and what each one zooms in on live in `run()` in `capture.py`.
- Timing (seconds per glide, wide shot, push-in and hold), colours and the title text live at the top of
  `render_blender.py`; `--title` and `--subtitle` (via `render_blender.py`) change the opening card.
