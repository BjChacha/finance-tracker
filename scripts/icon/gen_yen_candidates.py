#!/usr/bin/env python3
"""Generate third-round icon candidates: budget ring + redesigned center ¥.

Base ring is the r2-budget ring: pure white background, light-stone full
track (#D6D3D1) and a 72% amber spent arc (#F59E0B, round caps). Flat solid
colours only — no gradients, filters or shadows (round-2 style rules).

Three center-element treatments for the "abrupt, monotonous ¥" problem:

  r4-yen-ink   墨笔 ¥ — near-black stroked ¥ using the ring's own language
               (round caps, matched stroke weight); ink = the ledger.
  r5-yen-coin  硬币 ¥ — amber coin disc (r150) with a white carved ¥;
               currency becomes an object, circle-in-circle echoing the ring.
  r6-yen-amber 琥珀 ¥ — bolder amber ¥ in the spent arc's exact colour;
               the money and the spending tell one story.

Writes icon.svg / adaptive-foreground.svg / adaptive-background.svg /
adaptive-monochrome.svg into design/icon-candidates-yen/<id>/.

Usage: python scripts/icon/gen_yen_candidates.py
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_ROOT = ROOT / "design" / "icon-candidates-yen"

# ------------------------------- palette -------------------------------------

WHITE = "#FFFFFF"
TRACK = "#D6D3D1"
AMBER = "#F59E0B"
INK = "#1C1917"

# ------------------------------- base ring -----------------------------------
# Inherited verbatim from r2-budget (72% spent arc from 12 o'clock).

ARC_D = "M 512 252 A 260 260 0 1 1 256.6 560.7"
RING_R = 260
RING_W = 96

META = {
    "r4-yen-ink": {"letter": "4", "zh": "墨笔¥预算环", "en": "Budget Ring · Ink ¥", "flat": True},
    "r5-yen-coin": {"letter": "5", "zh": "硬币¥预算环", "en": "Budget Ring · Coin ¥", "flat": True},
    "r6-yen-amber": {"letter": "6", "zh": "琥珀¥预算环", "en": "Budget Ring · Amber ¥", "flat": True},
}

# ------------------------------- ¥ glyph -------------------------------------
# Unit glyph in a 100x100 box (stroke centres). Map: u -> 512 + (u - 50) * s.
# Proportions calibrated against a system CJK font rendering of U+00A5
# (msyhbd): width/height ~0.78, bars ~84% of glyph width at 56%/72% height,
# junction ~40%, ink bbox exactly centred on (512, 512).

GLYPH = [
    ("line", (20, 10), (50, 40)),   # left diagonal
    ("line", (80, 10), (50, 40)),   # right diagonal
    ("line", (50, 40), (50, 90)),   # stem
    ("line", (24, 56), (76, 56)),   # upper crossbar
    ("line", (24, 72), (76, 72)),   # lower crossbar
]


def yen_group(scale: float, stroke: float, color: str, dy: float = 0.0) -> str:
    """Render the ¥ glyph as an SVG group of round-capped strokes.

    dy centres the ink bounding box on (512, 512): the diagonal tips' round
    caps extend less in y (sin45 x half-stroke) than the stem's bottom cap,
    so the box centre sits low by ~half that difference without the shift.
    """
    def px(ux: float, uy: float) -> tuple[float, float]:
        return (512.0 + (ux - 50.0) * scale, 512.0 + (uy - 50.0) * scale + dy)

    parts = [
        f'<g fill="none" stroke="{color}" stroke-width="{stroke:.0f}" '
        f'stroke-linecap="round" stroke-linejoin="round">'
    ]
    for (_, a, b) in GLYPH:
        x0, y0 = px(*a)
        x1, y1 = px(*b)
        parts.append(f'<path d="M {x0:.2f} {y0:.2f} L {x1:.2f} {y1:.2f}"/>')
    parts.append("</g>")
    return "\n  ".join(parts)


def yen_stroke_paths(scale: float, stroke: float, color: str, dy: float = 0.0) -> str:
    """Same strokes as yen_group but as plain paths (for use inside a mask)."""
    return yen_group(scale, stroke, color, dy)


# ------------------------------- svg assembly --------------------------------


def svg_doc(body: str, defs: str = "") -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" '
        'viewBox="0 0 1024 1024">\n'
        f"  {defs}\n  {body}\n</svg>\n"
    )


def bg_rect() -> str:
    return '<rect width="1024" height="1024" fill="#FFFFFF"/>'


def track_circle() -> str:
    return (f'<circle cx="512" cy="512" r="{RING_R}" fill="none" '
            f'stroke="{TRACK}" stroke-width="{RING_W}"/>')


def spent_arc(color: str = AMBER) -> str:
    return (f'<path d="{ARC_D}" fill="none" stroke="{color}" '
            f'stroke-width="{RING_W}" stroke-linecap="round"/>')


# ------------------------------- candidates ----------------------------------


def build_r4_ink() -> dict[str, str]:
    """墨笔 ¥: near-black stroked glyph, round caps, matched stroke rhythm."""
    # unit outer height = 80; target ~290 incl. stroke -> s = (290-52)/80
    yen = yen_group(2.975, 52, INK)
    fg = svg_doc(track_circle() + "\n  " + spent_arc() + "\n  " + yen)
    icon = svg_doc(bg_rect() + "\n  " + track_circle() + "\n  " + spent_arc() + "\n  " + yen)
    bg = svg_doc(bg_rect())
    mono_yen = yen_group(2.975, 52, WHITE)
    mono = svg_doc(spent_arc(WHITE) + "\n  " + mono_yen)
    return {"icon.svg": icon, "adaptive-foreground.svg": fg,
            "adaptive-background.svg": bg, "adaptive-monochrome.svg": mono}


def build_r5_coin() -> dict[str, str]:
    """硬币 ¥: amber coin disc with the ¥ carved out in white."""
    disc_r = 150
    # target glyph outer height ~200 inside the disc -> s = (200-36)/80
    yen = yen_group(2.05, 36, WHITE)
    coin = f'<circle cx="512" cy="512" r="{disc_r}" fill="{AMBER}"/>'
    fg = svg_doc(track_circle() + "\n  " + spent_arc() + "\n  " + coin + "\n  " + yen)
    icon = svg_doc(bg_rect() + "\n  " + track_circle() + "\n  " + spent_arc()
                   + "\n  " + coin + "\n  " + yen)
    bg = svg_doc(bg_rect())
    # monochrome: white disc with the ¥ punched out of the alpha channel
    cut = yen_group(2.05, 36, "#000000")
    defs = (
        '<mask id="coinCut">\n'
        '    <rect width="1024" height="1024" fill="black"/>\n'
        f'    <circle cx="512" cy="512" r="{disc_r}" fill="white"/>\n'
        f'    {cut}\n'
        "  </mask>"
    )
    mono = svg_doc(
        spent_arc(WHITE) + "\n  "
        + f'<circle cx="512" cy="512" r="{disc_r}" fill="{WHITE}" mask="url(#coinCut)"/>',
        defs=defs,
    )
    return {"icon.svg": icon, "adaptive-foreground.svg": fg,
            "adaptive-background.svg": bg, "adaptive-monochrome.svg": mono}


def build_r6_amber() -> dict[str, str]:
    """琥珀 ¥: bolder glyph in the spent arc's exact colour."""
    # target glyph outer height ~310 incl. stroke -> s = (310-60)/80
    yen = yen_group(3.125, 60, AMBER)
    fg = svg_doc(track_circle() + "\n  " + spent_arc() + "\n  " + yen)
    icon = svg_doc(bg_rect() + "\n  " + track_circle() + "\n  " + spent_arc() + "\n  " + yen)
    bg = svg_doc(bg_rect())
    mono_yen = yen_group(3.125, 60, WHITE)
    mono = svg_doc(spent_arc(WHITE) + "\n  " + mono_yen)
    return {"icon.svg": icon, "adaptive-foreground.svg": fg,
            "adaptive-background.svg": bg, "adaptive-monochrome.svg": mono}


BUILDERS = {
    "r4-yen-ink": build_r4_ink,
    "r5-yen-coin": build_r5_coin,
    "r6-yen-amber": build_r6_amber,
}


def main() -> None:
    for cid, build in BUILDERS.items():
        cdir = OUT_ROOT / cid
        cdir.mkdir(parents=True, exist_ok=True)
        for name, content in build().items():
            (cdir / name).write_text(content, encoding="utf-8")
            print(f"wrote {cdir / name}")
        (cdir / "meta.json").write_text(
            json.dumps(META[cid], ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"wrote {cdir / 'meta.json'}")


if __name__ == "__main__":
    main()
