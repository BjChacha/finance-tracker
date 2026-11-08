#!/usr/bin/env python3
"""Make the Android launcher icon fully vector (VectorDrawable).

Replaces the adaptive-icon raster layers with vector drawables generated from
the same geometry as design/icon-candidates-yen/r5-yen-coin (budget ring with
a carved-¥ coin). Writes:

  res/drawable/ic_launcher_foreground.xml   track + spent arc + coin + white ¥
  res/drawable/ic_launcher_background.xml   solid white full-bleed vector
  res/drawable/ic_launcher_monochrome.xml   white spent arc + white ¥ (themed)
  res/mipmap-anydpi-v26/ic_launcher{,_round}.xml   -> @drawable/ vector layers
  res/mipmap-anydpi-v26/add{,_round}.xml            -> shared vector foreground

Legacy raster mipmaps (API < 26) and the Expo asset PNGs stay untouched; they
are regenerated from the same SVG sources by apply_candidate.py.

Run AFTER apply_candidate.py:  python scripts/icon/gen_android_vectors.py
"""

from __future__ import annotations

from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_yen_candidates import AMBER, ARC_D, GLYPH, TRACK, WHITE  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RES = ROOT / "android" / "app" / "src" / "main" / "res"

# r5-yen-coin geometry (kept in sync with gen_yen_candidates.build_r5_coin)
YEN_SCALE = 2.05
YEN_STROKE = 36
COIN_R = 150
RING_R = 260
RING_W = 96

VECTOR_NS = "http://schemas.android.com/apk/res/android"


def circle_path(cx: float, cy: float, r: float, close: bool = False) -> str:
    """A full circle as two 180° relative arcs."""
    return (f"M {cx} {cy - r} a {r} {r} 0 1 0 0 {2 * r} a {r} {r} 0 1 0 0 {-2 * r}"
            + (" Z" if close else ""))


def yen_paths() -> list[str]:
    def px(ux: float, uy: float) -> tuple[float, float]:
        return (512.0 + (ux - 50.0) * YEN_SCALE, 512.0 + (uy - 50.0) * YEN_SCALE)

    out = []
    for (_, a, b) in GLYPH:
        x0, y0 = px(*a)
        x1, y1 = px(*b)
        out.append(f"M {x0:.2f} {y0:.2f} L {x1:.2f} {y1:.2f}")
    return out


def vector_xml(paths: list[dict[str, str]]) -> str:
    body = []
    for p in paths:
        attrs = [f'android:pathData="{p["d"]}"']
        for key in ("fillColor", "strokeColor", "strokeWidth", "strokeLineCap"):
            if key in p:
                attrs.append(f'android:{key}="{p[key]}"')
        body.append("    <path\n        " + "\n        ".join(attrs) + "/>")
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        f'<vector xmlns:android="{VECTOR_NS}"\n'
        '    android:width="108dp"\n'
        '    android:height="108dp"\n'
        '    android:viewportWidth="1024"\n'
        '    android:viewportHeight="1024">\n'
        + "\n".join(body)
        + "\n</vector>\n"
    )


def foreground_xml() -> str:
    yen = " ".join(yen_paths())
    return vector_xml([
        # remaining-budget track: complete ring
        {"d": circle_path(512, 512, RING_R),
         "fillColor": "#00000000", "strokeColor": TRACK, "strokeWidth": str(RING_W)},
        # spent budget: 72% arc from 12 o'clock, round caps (matches the SVG)
        {"d": ARC_D,
         "fillColor": "#00000000", "strokeColor": AMBER, "strokeWidth": str(RING_W),
         "strokeLineCap": "round"},
        # the coin
        {"d": circle_path(512, 512, COIN_R, close=True), "fillColor": AMBER},
        # ¥ carved into the coin (white strokes over the disc)
        {"d": yen,
         "fillColor": "#00000000", "strokeColor": WHITE,
         "strokeWidth": str(YEN_STROKE), "strokeLineCap": "round"},
    ])


def background_xml() -> str:
    return vector_xml([
        {"d": "M 0 0 H 1024 V 1024 H 0 Z", "fillColor": WHITE},
    ])


def monochrome_xml() -> str:
    """Themed-icon layer: spent arc + ¥ as a white silhouette.

    The tinted monochrome reading keeps "budget arc + currency" without the
    amber disc (whose meaning lives in colour, which tinting removes).
    """
    yen = " ".join(yen_paths())
    return vector_xml([
        {"d": ARC_D,
         "fillColor": "#00000000", "strokeColor": WHITE, "strokeWidth": str(RING_W),
         "strokeLineCap": "round"},
        {"d": yen,
         "fillColor": "#00000000", "strokeColor": WHITE,
         "strokeWidth": str(YEN_STROKE), "strokeLineCap": "round"},
    ])


ADAPTIVE_LAUNCHER = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
"""

ADAPTIVE_ADD = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/add_background_color"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
"""


def main() -> None:
    drawable = RES / "drawable"
    drawable.mkdir(parents=True, exist_ok=True)
    (drawable / "ic_launcher_foreground.xml").write_text(foreground_xml(), encoding="utf-8")
    (drawable / "ic_launcher_background.xml").write_text(background_xml(), encoding="utf-8")
    (drawable / "ic_launcher_monochrome.xml").write_text(monochrome_xml(), encoding="utf-8")
    print("wrote drawable/ic_launcher_{foreground,background,monochrome}.xml (vector)")

    anydpi = RES / "mipmap-anydpi-v26"
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        (anydpi / name).write_text(ADAPTIVE_LAUNCHER, encoding="utf-8")
        print(f"rewrote mipmap-anydpi-v26/{name} -> vector layers")
    for name in ("add.xml", "add_round.xml"):
        (anydpi / name).write_text(ADAPTIVE_ADD, encoding="utf-8")
        print(f"rewrote mipmap-anydpi-v26/{name} -> vector foreground")


if __name__ == "__main__":
    main()
