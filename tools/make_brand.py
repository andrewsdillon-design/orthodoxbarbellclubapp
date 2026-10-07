"""Draw the OBC roundel and render every icon, splash and store graphic the app needs.

    pip install -r tools/requirements.txt
    python -m playwright install chromium     (once; skip if you already have it)
    python tools/make_brand.py

Writes:
    assets/brand/roundel.svg        the master art (eagle and barbell on an imperial-purple roundel)
    assets/brand/emblem.svg         the eagle, barbell and lettering without the disc (Android adaptive icon)
    src/brand/roundelSvg.ts         the same SVG as a string, drawn in the app with react-native-svg
    assets/icon.png                 1024 iOS / Expo icon (no transparency, as Apple requires)
    assets/android-icon-*.png       Android adaptive icon layers (foreground, background, monochrome)
    assets/splash-icon.png          splash screen emblem
    assets/favicon.png              web favicon
    store/play-icon-512.png         Google Play hi-res icon
    store/play-feature-graphic.png  Google Play feature graphic (1024 x 500)

The eagle is original vector art drawn in the style of the RuskiMaxxing logo: a gold double-headed eagle
over a barbell on a purple roundel with a gold rim. "OBC" is set in Cinzel Bold, converted to outlines so
it looks the same everywhere without loading a font.
"""

from __future__ import annotations

import base64
import json
import math
import os
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
CINZEL = ROOT / "node_modules/@expo-google-fonts/cinzel/700Bold/Cinzel_700Bold.ttf"

# The RuskiMaxxing Byzantine palette (src/ruskimaxxing/gui.py, BYZ), plus a dark gold for outlines.
PURPLE, PURPLE_DARK = "#4A1942", "#2E0C28"
GOLD, GOLD_LIGHT, GOLD_DARK = "#C9A227", "#F2D675", "#7A5C10"
CRIMSON, IVORY = "#8B1A1A", "#F6EFDE"

C = 512  # centre of the 1024 canvas
R_RIM, R_FIELD, R_RING = 500, 468, 440


def mirror(points):
    return [(2 * C - x, y) for x, y in points]


def poly(points, fill, stroke=GOLD_DARK, width=5):
    pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    return f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" stroke-linejoin="round"/>'


def path(d, fill, stroke=GOLD_DARK, width=5, cap="round"):
    return (f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" '
            f'stroke-linejoin="round" stroke-linecap="{cap}"/>')


def mirror_path(d: str) -> str:
    """Mirror an absolute-coordinate path made of M/L/Q/C/Z commands and x,y pairs."""
    out, tokens = [], d.replace(",", " ").split()
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t.isalpha():
            out.append(t)
            i += 1
        else:
            out.append(f"{2 * C - float(t):.1f} {float(tokens[i + 1]):.1f}")
            i += 2
    return " ".join(out)


def wing(pivot, angles, lengths, scale):
    """A fan of kite-shaped feathers; their union has the jagged edge of the reference wings."""
    px, py = pivot
    feathers = []
    spread = (angles[1] - angles[0]) * 0.62
    for a, length in zip(angles, lengths):
        length *= scale
        ra, rl, rr = math.radians(a), math.radians(a - spread), math.radians(a + spread)
        feathers.append([
            (px, py),
            (px + 0.70 * length * math.cos(rl), py + 0.70 * length * math.sin(rl)),
            (px + length * math.cos(ra), py + length * math.sin(ra)),
            (px + 0.70 * length * math.cos(rr), py + 0.70 * length * math.sin(rr)),
        ])
    return feathers


def half_eagle() -> list[str]:
    """The right half of the eagle (wing, neck, head), drawn back to front."""
    pivot = (585, 420)
    angles = [-36 + i * 10 for i in range(7)]  # from up-right to slightly down-right
    outer = wing(pivot, angles, [325, 318, 305, 290, 272, 250, 225], 1.0)
    inner = wing((pivot[0] - 4, pivot[1] + 4), angles, [325, 318, 305, 290, 272, 250, 225], 0.74)
    parts = [poly(f, GOLD) for f in outer]
    parts += [poly(f, GOLD_LIGHT) for f in inner]
    # Feather quills
    for a, length in zip(angles, [325, 318, 305, 290, 272, 250, 225]):
        r = math.radians(a)
        x1, y1 = pivot[0] + 60 * math.cos(r), pivot[1] + 60 * math.sin(r)
        x2, y2 = pivot[0] + 0.66 * length * math.cos(r), pivot[1] + 0.66 * length * math.sin(r)
        parts.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                     f'stroke="{GOLD_DARK}" stroke-width="4" stroke-linecap="round"/>')
    # Neck: an outlined stroke from the shoulders up to the head
    neck = "M 540 350 Q 565 268 632 222"
    parts.append(path(neck, "none", GOLD_DARK, 54))
    parts.append(path(neck, "none", GOLD, 42))
    # Head, eye and hooked beak
    head = [(612, 160), (652, 140), (690, 152), (708, 186), (698, 222), (662, 240), (622, 230), (602, 196)]
    parts.append(poly(head, GOLD))
    parts.append(path("M 698 168 C 738 146 784 156 798 196 C 803 212 796 228 784 236 L 778 214 C 770 194 742 186 707 202 Z", GOLD_LIGHT))
    parts.append(f'<circle cx="660" cy="180" r="12" fill="{CRIMSON}" stroke="{GOLD_DARK}" stroke-width="4"/>')
    # Leg and talons over the bar
    parts.append(path("M 545 520 L 572 600 L 590 628", "none", GOLD_DARK, 26))
    parts.append(path("M 545 520 L 572 600 L 590 628", "none", GOLD, 16))
    for dx in (-18, 0, 18):  # toes curled over the bar, dark claw tips underneath
        x = 592 + dx
        parts.append(path(f"M {x - 7} 642 Q {x - 7} 622 {x} 622 Q {x + 8} 622 {x + 8} 642", "none", "#2B1B24", 7))
        parts.append(f'<circle cx="{x}" cy="626" r="6" fill="{GOLD}" stroke="#2B1B24" stroke-width="3"/>')
    return parts


def mirrored(parts: list[str]) -> list[str]:
    return [f'<g transform="translate({2 * C} 0) scale(-1 1)">{"".join(parts)}</g>']


def plates(right: bool) -> list[str]:
    def x(v):  # coordinates are written for the right side
        return v if right else 2 * C - v

    def rect(x0, x1, y0, y1, fill, stroke, w, rx=6):
        a, b = sorted((x(x0), x(x1)))
        return (f'<rect x="{a:.1f}" y="{y0}" width="{b - a:.1f}" height="{y1 - y0}" rx="{rx}" fill="{fill}" '
                f'stroke="{stroke}" stroke-width="{w}"/>')

    return [
        rect(740, 758, 618, 662, GOLD, GOLD_DARK, 4, 3),      # collar
        rect(768, 798, 556, 724, CRIMSON, GOLD, 6),           # small plate
        rect(806, 842, 520, 760, CRIMSON, GOLD, 6),           # big plate
    ]


def eagle_and_barbell() -> str:
    half = half_eagle()
    parts: list[str] = []
    # Tail fan behind everything, pointing down
    tail = [(472, 500), (430, 690), (462, 668), (488, 712), (512, 680), (536, 712), (562, 668), (594, 690), (552, 500)]
    parts.append(poly(tail, GOLD))
    parts.append(poly([(490, 520), (470, 650), (512, 630), (554, 650), (534, 520)], GOLD_LIGHT))
    parts += half + mirrored(half)
    # Body with its banding
    parts.append(f'<ellipse cx="{C}" cy="440" rx="80" ry="106" fill="{GOLD}" stroke="{GOLD_DARK}" stroke-width="6"/>')
    for y, w in ((392, 54), (428, 70), (464, 70), (500, 54)):
        parts.append(path(f"M {C - w} {y} Q {C} {y + 14} {C + w} {y}", "none", GOLD_DARK, 5))
    # A small three-bar Orthodox cross between the heads
    cross = (f'<g stroke="{GOLD_DARK}" stroke-width="4" fill="{GOLD_LIGHT}">'
             f'<rect x="{C - 9}" y="128" width="18" height="140" rx="3"/>'
             f'<rect x="{C - 26}" y="150" width="52" height="13" rx="3"/>'
             f'<rect x="{C - 44}" y="180" width="88" height="16" rx="3"/>'
             f'<rect x="{C - 30}" y="232" width="60" height="13" rx="3" transform="rotate(-16 {C} 238)"/></g>')
    parts.append(cross)
    # Barbell: bar, sleeves, collars and plates
    parts.append(f'<rect x="128" y="631" width="768" height="18" rx="9" fill="{IVORY}" stroke="{GOLD_DARK}" stroke-width="4"/>')
    parts += plates(True) + plates(False)
    # Talons go over the bar
    talons = [p for p in half if "#2B1B24" in p]
    parts.append("".join(talons) + mirrored(talons)[0])
    return "".join(parts)


def lettering(text="OBC", cap=100, baseline=880, tracking=60) -> str:
    """'OBC' in Cinzel Bold, as outlines, centred on the canvas."""
    font = TTFont(CINZEL)
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    s = cap / font["OS/2"].sCapHeight
    names = [cmap[ord(ch)] for ch in text]
    total = sum(glyphs[n].width for n in names) + tracking * (len(names) - 1)
    x = C - total * s / 2
    out = []
    for n in names:
        pen = SVGPathPen(glyphs)
        glyphs[n].draw(TransformPen(pen, (s, 0, 0, -s, x, baseline)))
        out.append(pen.getCommands())
        x += (glyphs[n].width + tracking) * s
    d = " ".join(out)
    rule = (f'<g stroke="{GOLD}" stroke-width="5" stroke-linecap="round">'
            f'<line x1="{C - 300}" y1="{baseline - cap / 2}" x2="{C - total * s / 2 - 26}" y2="{baseline - cap / 2}"/>'
            f'<line x1="{C + total * s / 2 + 26}" y1="{baseline - cap / 2}" x2="{C + 300}" y2="{baseline - cap / 2}"/></g>')
    return rule + f'<path d="{d}" fill="{GOLD_LIGHT}" stroke="{GOLD_DARK}" stroke-width="5" stroke-linejoin="round"/>'


def svg(body: str, size=1024, view="0 0 1024 1024", background="") -> str:
    style = f' style="background:{background};display:block"' if background else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="{view}"{style}>'
            f"{body}</svg>")


def disc() -> str:
    return (f'<circle cx="{C}" cy="{C}" r="{R_RIM}" fill="{GOLD}" stroke="{GOLD_DARK}" stroke-width="6"/>'
            f'<circle cx="{C}" cy="{C}" r="{R_FIELD}" fill="{PURPLE}" stroke="{GOLD_DARK}" stroke-width="4"/>'
            f'<circle cx="{C}" cy="{C}" r="{R_RING}" fill="none" stroke="{GOLD}" stroke-width="3" opacity="0.8"/>')


def emblem() -> str:
    return eagle_and_barbell() + lettering()


def roundel() -> str:
    return disc() + emblem()


def render(jobs: list[tuple[str, Path, int, int]]) -> None:
    """Rasterise (html, out_path, width, height) with headless Chromium."""
    from playwright.sync_api import sync_playwright

    exe = os.environ.get("OBC_CHROMIUM")  # optional: a Chromium you already have
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
        page = browser.new_page()
        for html, out, w, h in jobs:
            page.set_viewport_size({"width": w, "height": h})
            page.set_content(f'<html><body style="margin:0;background:transparent">{html}</body></html>')
            out.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(out), omit_background=True, clip={"x": 0, "y": 0, "width": w, "height": h})
            print("wrote", out.relative_to(ROOT))
        browser.close()


def main() -> None:
    brand = ROOT / "assets" / "brand"
    brand.mkdir(parents=True, exist_ok=True)
    roundel_svg = svg(roundel())
    emblem_svg = svg(emblem())
    (brand / "roundel.svg").write_text(roundel_svg, encoding="utf-8")
    (brand / "emblem.svg").write_text(emblem_svg, encoding="utf-8")
    ts = ROOT / "src" / "brand" / "roundelSvg.ts"
    ts.parent.mkdir(parents=True, exist_ok=True)
    ts.write_text("// Generated by tools/make_brand.py. Don't edit by hand.\n"
                  f"export const ROUNDEL_SVG = {json.dumps(roundel_svg)};\n", encoding="utf-8")
    print("wrote", brand / "roundel.svg", "and", ts.relative_to(ROOT))

    def sized(markup: str, px: int, scale=1.0, background="") -> str:
        """The 1024 art at px square, optionally shrunk about the centre (for safe zones)."""
        pad = 1024 * (1 / scale - 1) / 2
        view = f"{-pad:.1f} {-pad:.1f} {1024 + 2 * pad:.1f} {1024 + 2 * pad:.1f}"
        return svg(markup, px, view, background)

    mono = (f'<div style="filter:brightness(0) invert(1)">{sized(emblem(), 1024, 0.6)}</div>')
    feature = (
        f'<div style="width:1024px;height:500px;background:linear-gradient(135deg,{PURPLE_DARK},{PURPLE});'
        f'display:flex;align-items:center;gap:48px;padding:0 64px;box-sizing:border-box;'
        f'border-top:6px solid {GOLD};border-bottom:6px solid {GOLD}">'
        f'{sized(roundel(), 360)}'
        f'<div style="color:{GOLD_LIGHT};font-family:Cinzel,Georgia,serif">'
        f'<div style="font-size:52px;font-weight:700;letter-spacing:2px;line-height:1.1">Orthodox<br>Barbell Club</div>'
        f'<div style="height:3px;background:{GOLD};width:260px;margin:22px 0"></div>'
        f'<div style="font-size:24px;color:{IVORY};font-family:Georgia,serif">Train together. Log every set.</div>'
        f'</div></div>')
    cinzel = base64.b64encode(CINZEL.read_bytes()).decode()
    font_css = f"<style>@font-face{{font-family:Cinzel;src:url(data:font/ttf;base64,{cinzel})}}</style>"
    render([
        (sized(roundel(), 1024, 0.98, PURPLE_DARK), ROOT / "assets/icon.png", 1024, 1024),
        (sized(emblem(), 1024, 0.62), ROOT / "assets/android-icon-foreground.png", 1024, 1024),
        (svg("", 1024, background=PURPLE), ROOT / "assets/android-icon-background.png", 1024, 1024),
        (mono, ROOT / "assets/android-icon-monochrome.png", 1024, 1024),
        (sized(roundel(), 1024), ROOT / "assets/splash-icon.png", 1024, 1024),
        (sized(roundel(), 48), ROOT / "assets/favicon.png", 48, 48),
        (sized(roundel(), 512, 0.98, PURPLE_DARK), ROOT / "store/play-icon-512.png", 512, 512),
        (font_css + feature, ROOT / "store/play-feature-graphic.png", 1024, 500),
    ])


if __name__ == "__main__":
    main()
