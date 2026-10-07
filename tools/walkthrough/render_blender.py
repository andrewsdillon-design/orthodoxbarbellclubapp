"""Render the app walkthrough video in Blender, on the graphics card, from the screens capture.py made.

Run with Blender (4.2 or newer), not plain Python (make_walkthrough.py does this for you):

    blender -b -P tools/walkthrough/render_blender.py -- --shots tools/walkthrough/shots --out obc-app-walkthrough.mp4
    ... -- --quality draft      # half size, fewer samples: a quick check
    ... -- --preview 6          # one still of step 6, next to --out
    ... -- --music hymn.mp3     # optional soundtrack
    ... -- --engine cycles      # Cycles on the GPU (CUDA/OptiX/HIP/oneAPI) instead of EEVEE

The scene: each phone screen stands on a dark stage in a gold-rimmed phone frame. The camera opens on an OBC
title card, glides from phone to phone, pushes in on the part of the screen that matters (the focus box from
capture.py), and the step's title and caption sit beside the phone. It ends on an orthodoxbarbellclub.com card.

EEVEE (the default) always renders on the graphics card. On a laptop with two graphics chips,
make_walkthrough.py first tells Windows to run Blender on the fast one.
"""

import json
import math
import os
import sys
from pathlib import Path

FPS = 30
TITLE_SECONDS = 4.5
END_SECONDS = 5.0
MOVE_SECONDS = 1.1     # camera glide between phones
WIDE_SECONDS = 0.9     # hold on the whole screen
PUSH_SECONDS = 1.8     # push in on the focus
HOLD_SECONDS = 2.6     # hold the close-up while the caption is read
SCREEN_H = 9.0         # phone screen height in scene units; width comes from the screenshots
BEZEL = 0.22
GAP = 7.0
LENS_MM, SENSOR_MM = 50.0, 36.0
ASPECT = 16 / 9

# The app's Byzantine palette (sRGB hex)
PURPLE, PURPLE_DARK, STAGE = "#4A1942", "#2E0C28", "#170613"
GOLD, GOLD_LIGHT, IVORY, CRIMSON = "#C9A227", "#F2D675", "#F6EFDE", "#8B1A1A"


def linear(hex_color: str):
    """sRGB hex -> the linear RGB Blender wants for flat colours, so they match the screenshots."""
    out = []
    for i in (1, 3, 5):
        c = int(hex_color[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


# ----- timing and framing (plain Python; testable without Blender) --------------------------------

def step_frames() -> dict:
    return {k: round(v * FPS) for k, v in (("move", MOVE_SECONDS), ("wide", WIDE_SECONDS),
                                           ("push", PUSH_SECONDS), ("hold", HOLD_SECONDS))}


def plan(steps: list[dict]) -> dict:
    f = step_frames()
    t = 1
    title = (t, t + round(TITLE_SECONDS * FPS) - 1)
    t = title[1] + 1
    out = []
    for i, s in enumerate(steps):
        arrive = t + f["move"]
        push_start = arrive + f["wide"]
        push_end = push_start + f["push"]
        leave = push_end + f["hold"]
        out.append({**s, "index": i, "start": t, "arrive": arrive, "push_start": push_start,
                    "push_end": push_end, "leave": leave})
        t = leave
    end = (t, t + round(MOVE_SECONDS * FPS) + round(END_SECONDS * FPS))
    return {"title": title, "steps": out, "end": end, "frame_end": end[1]}


def wide_height() -> float:
    return SCREEN_H * 1.22


def frame_for(focus, screen_w: float):
    """(x offset, z offset, visible height) for the camera on a focus box given as fractions of the screen.

    The push-in moves up and down the screen and closes in, but never so far that the phone's width
    runs under the caption on the left.
    """
    if not focus:
        return 0.0, 0.0, wide_height()
    _, fy, _, fh = focus
    cz = (0.5 - (fy + fh / 2)) * SCREEN_H
    vis_h = max(fh * SCREEN_H * 2.2, SCREEN_H * 0.55)
    vis_h = min(vis_h, SCREEN_H * 0.82)
    half_h = vis_h / 2
    cz = max(-SCREEN_H / 2 + half_h * 0.85, min(SCREEN_H / 2 - half_h * 0.85, cz))
    return 0.0, cz, vis_h


def distance_for(vis_h: float) -> float:
    """How far back the camera sits to show `vis_h` units top to bottom (16:9 frame)."""
    width = vis_h * ASPECT
    return (width / 2) * LENS_MM / (SENSOR_MM / 2)


def side_offset(vis_h: float) -> float:
    """Keep the phone right of centre so the caption has the left of the frame."""
    return vis_h * ASPECT * 0.2


# ----- Blender scene -----------------------------------------------------------------------------

def args_after_dashes() -> dict:
    import argparse
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(prog="render_blender.py")
    ap.add_argument("--shots", default=str(here / "shots"))
    ap.add_argument("--out", default=str(here / "out" / "obc-app-walkthrough.mp4"))
    ap.add_argument("--quality", choices=("draft", "final"), default="final")
    ap.add_argument("--engine", choices=("eevee", "cycles"), default="eevee")
    ap.add_argument("--preview", type=int, help="render one still of this step number (0 = title card) and stop")
    ap.add_argument("--music", help="optional audio file for a soundtrack")
    ap.add_argument("--frames", type=int, help="render only the first N frames (a quick test clip)")
    ap.add_argument("--title", default="Orthodox Barbell Club")
    ap.add_argument("--subtitle", default="The app: a walkthrough")
    ap.add_argument("--logo", default=str(here.parent.parent / "assets" / "icon.png"))
    return vars(ap.parse_args(argv))


def find_font(*names):
    dirs = [os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Fonts"),
            os.path.expanduser(r"~\AppData\Local\Microsoft\Windows\Fonts"), "/usr/share/fonts", "/Library/Fonts",
            "/System/Library/Fonts", os.path.expanduser("~/Library/Fonts"),
            str(Path(__file__).resolve().parent.parent.parent / "node_modules" / "@expo-google-fonts")]
    found = {}
    for d in dirs:
        for root, _, files in os.walk(d) if os.path.isdir(d) else []:
            for f in files:
                found.setdefault(f.lower(), os.path.join(root, f))
    for n in names:  # first choice wins: the app's own Cinzel and Archivo, then system fallbacks
        if n.lower() in found:
            return found[n.lower()]
    return None


def use_gpu(scene, engine: str) -> str:
    """Pick the render engine and, for Cycles, the fastest GPU backend. Returns a line describing it."""
    import bpy
    if engine == "cycles":
        scene.render.engine = "CYCLES"
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for backend in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
            try:
                prefs.compute_device_type = backend
                prefs.get_devices()
                gpus = [d for d in prefs.devices if d.type == backend]
                if gpus:
                    for d in prefs.devices:
                        d.use = d.type == backend
                    scene.cycles.device = "GPU"
                    return f"Cycles on {backend}: " + ", ".join(d.name for d in gpus)
            except TypeError:
                continue
        scene.cycles.device = "CPU"
        return "Cycles on the CPU (no supported graphics card found)"
    for name in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = name
            break
        except TypeError:
            continue
    try:
        import gpu
        return f"EEVEE on {gpu.platform.renderer_get()} ({gpu.platform.vendor_get()})"
    except Exception:
        return "EEVEE on the graphics card"


def build(opts: dict) -> None:
    import bpy

    shots = Path(opts["shots"])
    manifest = json.loads((shots / "manifest.json").read_text())
    screen_w = SCREEN_H * manifest["width"] / manifest["height"]
    timeline = plan(manifest["steps"])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, timeline["frame_end"]
    scene.render.fps = FPS
    draft = opts["quality"] == "draft"
    scene.render.resolution_x, scene.render.resolution_y = (960, 540) if draft else (1920, 1080)
    scene.render.resolution_percentage = 100
    print(use_gpu(scene, opts["engine"]))
    try:
        scene.eevee.taa_render_samples = 8 if draft else 32
    except AttributeError:
        pass
    try:
        scene.cycles.samples = 8 if draft else 32
        scene.cycles.use_denoising = False
    except AttributeError:
        pass
    scene.view_settings.view_transform = "Standard"  # screenshots keep their real colours

    world = bpy.data.worlds.new("Stage")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (*linear(STAGE), 1)
    scene.world = world

    fonts = {k: (bpy.data.fonts.load(p) if p else None) for k, p in (
        # Not Cinzel: Blender fills its overlapping letter outlines wrongly. Georgia is on every Windows PC.
        ("title", find_font("georgiab.ttf", "Georgia Bold.ttf", "DejaVuSerif-Bold.ttf")),
        ("body", find_font("Archivo_400Regular.ttf", "segoeui.ttf", "arial.ttf", "DejaVuSans.ttf")),
        ("bold", find_font("Archivo_700Bold.ttf", "segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf")),
    )}

    def emission(name, color=None, image=None, strength=1.0):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        em = nodes.new("ShaderNodeEmission")
        em.inputs["Strength"].default_value = strength
        if image:
            tex = nodes.new("ShaderNodeTexImage")
            tex.image = bpy.data.images.load(str(image))
            tex.interpolation = "Cubic"
            links.new(tex.outputs["Color"], em.inputs["Color"])
        else:
            em.inputs["Color"].default_value = (*linear(color), 1)
        links.new(em.outputs["Emission"], out.inputs["Surface"])
        return mat

    def plane(name, x, z, w, h, mat, y=0.0):
        bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, z), rotation=(math.radians(90), 0, 0))
        obj = bpy.context.active_object
        obj.name = name
        obj.scale = (w, h, 1)
        obj.data.materials.append(mat)
        return obj

    def text(name, body, size, mat, font=None, align="CENTER", loc=(0, 0, 0), parent=None, width=0.0):
        curve = bpy.data.curves.new(name, type="FONT")
        curve.body = body
        curve.size = size
        curve.align_x = align
        curve.align_y = "TOP" if width else "CENTER"
        if width:  # wrap long captions in a text box
            curve.text_boxes[0].width = width
        if font:
            curve.font = font
        obj = bpy.data.objects.new(name, curve)
        obj.data.materials.append(mat)
        bpy.context.collection.objects.link(obj)
        obj.location = loc
        if parent:
            obj.parent = parent
        else:
            obj.rotation_euler = (math.radians(90), 0, 0)
        return obj

    ivory, gold, gold_light = emission("Ivory", IVORY), emission("Gold", GOLD), emission("Gold light", GOLD_LIGHT, strength=1.1)
    bezel, card_bg = emission("Bezel", "#0B0309"), emission("Card", PURPLE_DARK)
    shadow = emission("Shadow", "#0A0208")

    step_x = screen_w + GAP + wide_height() * ASPECT * 0.4
    card_w = wide_height() * ASPECT * 1.1
    card_gap = card_w / 2 + wide_height() * ASPECT  # keeps the cards out of the first and last phone's shot

    def phone_x(i):
        return card_gap + i * step_x

    # Title and end cards (the app icon has the same purple behind it, so it sits seamlessly on the card)
    end_x = phone_x(len(timeline["steps"]) - 1) + card_gap
    logo = Path(opts["logo"])
    for x, big, small in ((0.0, opts["title"], opts["subtitle"]),
                          (end_x, "orthodoxbarbellclub.com", "Free for every garage gym. Strong men, together.")):
        plane(f"Card {x}", x, 0, card_w, wide_height() * 1.1, card_bg, y=0.06)
        if logo.exists():
            plane(f"Logo {x}", x, 2.0, 4.6, 4.6, emission(f"Logo img {x}", image=logo), y=0.0)
        plane(f"Rule {x}", x, -1.1, card_w * 0.3, 0.05, gold, y=-0.02)
        text(f"Card title {x}", big, 0.95, gold_light, fonts["title"], loc=(x, -0.03, -1.9))
        text(f"Card sub {x}", small, 0.42, ivory, fonts["body"], loc=(x, -0.03, -2.9))

    for s in timeline["steps"]:
        x = phone_x(s["index"])
        plane(f"Shadow {s['index']}", x + 0.25, -0.3, screen_w + 2 * BEZEL, SCREEN_H + 2 * BEZEL, shadow, y=0.2)
        plane(f"Rim {s['index']}", x, 0, screen_w + 2 * BEZEL + 0.08, SCREEN_H + 2 * BEZEL + 0.08, gold, y=0.1)
        plane(f"Bezel {s['index']}", x, 0, screen_w + 2 * BEZEL, SCREEN_H + 2 * BEZEL, bezel, y=0.05)
        plane(f"Screen {s['index']}", x, 0, screen_w, SCREEN_H, emission(f"Shot {s['index']}", image=shots / s["image"]))

    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens, cam_data.sensor_width = LENS_MM, SENSOR_MM
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    def key_cam(frame, x, z, vis_h, tilt=0.0):
        cam.location = (x, -distance_for(vis_h), z)
        cam.rotation_euler = (math.radians(90), math.radians(tilt), 0)
        cam.keyframe_insert("location", frame=frame)
        cam.keyframe_insert("rotation_euler", frame=frame)

    wide = wide_height()
    t0, t1 = timeline["title"]
    key_cam(t0, 0, 0, wide * 1.08)
    key_cam(t1, 0, 0, wide)
    for s in timeline["steps"]:
        x = phone_x(s["index"])
        cx, cz, vis_h = frame_for(s.get("focus"), screen_w)
        mid = (s["start"] + s["arrive"]) // 2
        prev_x = 0.0 if s["index"] == 0 else phone_x(s["index"] - 1)
        key_cam(mid, (prev_x + x) / 2, 0.5, wide * 1.3, tilt=-1.2)
        key_cam(s["arrive"], x - side_offset(wide), 0, wide)
        key_cam(s["push_start"], x - side_offset(wide), 0, wide)
        key_cam(s["push_end"], x + cx - side_offset(vis_h), cz, vis_h)
        key_cam(s["leave"], x + cx - side_offset(vis_h * 0.97), cz, vis_h * 0.97)
    e0, e1 = timeline["end"]
    move = round(MOVE_SECONDS * FPS)
    key_cam(e0 + move // 2, (phone_x(len(timeline["steps"]) - 1) + end_x) / 2, 0.5, wide * 1.3, tilt=-1.2)
    key_cam(e0 + move, end_x, 0, wide)
    key_cam(e1, end_x, 0, wide * 0.95)

    # Captions ride with the camera on the left of the frame: local -Z is forward, 2 units in front of the lens.
    depth = 2.0
    view_w = 2 * depth * (SENSOR_MM / 2) / LENS_MM
    view_h = view_w / ASPECT
    left = -view_w / 2 + view_w * 0.06
    col_w = view_w * 0.34

    def show_between(obj, first, last):
        for f, hidden in ((1, True), (first, False), (last, True)):
            obj.hide_render = hidden
            obj.hide_viewport = hidden
            obj.keyframe_insert("hide_render", frame=f)
            obj.keyframe_insert("hide_viewport", frame=f)

    panel = plane("Caption panel", 0, 0, col_w + view_w * 0.05, view_h * 0.34, emission("Caption bg", PURPLE_DARK, strength=0.95))
    panel.rotation_euler = (0, 0, 0)
    panel.parent = cam
    panel.location = (left + col_w / 2, view_h * 0.02, -depth - 0.02)
    edge = plane("Caption edge", 0, 0, view_w * 0.004, view_h * 0.34, gold)
    edge.rotation_euler = (0, 0, 0)
    edge.parent = cam
    edge.location = (left - view_w * 0.025, view_h * 0.02, -depth - 0.01)
    show_between(panel, timeline["steps"][0]["arrive"], timeline["end"][0])
    show_between(edge, timeline["steps"][0]["arrive"], timeline["end"][0])
    for s in timeline["steps"]:
        num = text(f"Step no {s['index']}", f"{s['index'] + 1} / {len(timeline['steps'])}", view_h * 0.026, gold,
                   fonts["bold"], "LEFT", (left, view_h * 0.15, -depth), cam)
        t = text(f"Caption title {s['index']}", s["title"], view_h * 0.05, gold_light, fonts["title"], "LEFT",
                 (left, view_h * 0.1, -depth), cam, width=col_w)
        c = text(f"Caption {s['index']}", s["caption"], view_h * 0.034, ivory, fonts["body"], "LEFT",
                 (left, view_h * 0.0, -depth), cam, width=col_w)
        for obj in (num, t, c):
            show_between(obj, s["arrive"], s["leave"])

    if opts.get("music") and os.path.exists(opts["music"]):
        if not scene.sequence_editor:
            scene.sequence_editor_create()
        strips = scene.sequence_editor
        coll = strips.strips if hasattr(strips, "strips") else strips.sequences  # Blender 5 renamed it
        snd = coll.new_sound("Music", opts["music"], channel=1, frame_start=1)
        snd.volume = 0.5

    out = Path(opts["out"]).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    settings = scene.render.image_settings
    if opts.get("preview") is not None:
        if opts["preview"] == 0:  # the title card
            scene.frame_set(timeline["title"][1])
        else:
            step = timeline["steps"][max(0, min(len(timeline["steps"]) - 1, opts["preview"] - 1))]
            scene.frame_set(step["push_end"])
        settings.file_format = "PNG"
        scene.render.filepath = str(out.with_name(f"preview-step{opts['preview']:02d}.png"))
        bpy.ops.render.render(write_still=True)
        print(f"Preview written to {scene.render.filepath}")
        return

    try:
        settings.media_type = "VIDEO"  # Blender 5
    except (AttributeError, TypeError):
        pass
    settings.file_format = "FFMPEG"
    ff = scene.render.ffmpeg
    ff.format = "MPEG4"
    ff.codec = "H264"
    for attr, value in (("constant_rate_factor", "HIGH"), ("ffmpeg_preset", "GOOD"), ("gopsize", FPS)):
        try:
            setattr(ff, attr, value)
        except (AttributeError, TypeError):
            pass
    if opts.get("music"):
        ff.audio_codec = "AAC"
    if opts.get("frames"):
        scene.frame_end = min(scene.frame_end, opts["frames"])
    scene.render.filepath = str(out)
    print(f"Rendering {scene.frame_end} frames ({scene.frame_end / FPS / 60:.1f} min of video) to {out}")
    bpy.ops.render.render(animation=True)
    print(f"Done: {out}")


if __name__ == "__main__":
    build(args_after_dashes())
