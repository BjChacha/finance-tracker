#!/usr/bin/env python3
"""Generate the original app icon set for "花哪了" (finance-tracker).

Design: a golden coin bearing a hand-drawn CNY sign, surrounded by seven
petals — a coin that blossoms, echoing the app name's pun on "花" (spend/bloom).
All shapes are drawn programmatically (no fonts, no external assets), so the
output carries zero copyright/licensing risk.

Palette mirrors src/theme/themes.ts: primary #F59E0B with warm neutrals.

Outputs into assets/:
  icon.png                     1024x1024 RGB   full artwork (iOS / universal)
  android-icon-foreground.png  1024x1024 RGBA  adaptive icon foreground (scaled into safe zone)
  android-icon-background.png  1024x1024 RGBA  adaptive icon background (gradient)
  android-icon-monochrome.png  1024x1024 RGBA  white silhouette, yen carved out
  favicon.png                   48x48   RGBA   simplified coin-only variant
  splash-icon.png              1024x1024 RGBA  transparent logo

Usage: python scripts/generate_icons.py [--out assets]
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

# ------------------------------- palette ------------------------------------

COIN_HIGHLIGHT = (253, 230, 138)   # #FDE68A top-left sheen
COIN_MAIN = (245, 158, 11)         # #F59E0B app primary
COIN_DARK = (217, 119, 6)          # #D97706 bottom-right shade
COIN_EDGE = (180, 83, 9)           # #B45309 rim
YEN_INK = (120, 53, 15)            # #78350F deep amber-brown for the sign
PETAL_MAIN = (251, 191, 36)        # #FBBF24
PETAL_LIGHT = (252, 211, 77)       # #FCD34D
PETAL_DARK = (245, 158, 11)        # #F59E0B
BG_TOP = (255, 248, 236)           # #FFF8EC
BG_BOTTOM = (253, 235, 208)        # #FDEBD0
SHADOW = (180, 83, 9)              # shadow tint

# ----------------------------- geometry (1024 base) --------------------------

SS = 4                              # supersampling factor for crisp antialiasing
BASE = 1024
CANVAS = BASE * SS                  # 4096 working resolution
CX = CY = BASE // 2                 # 512, 512

COIN_R = 266                        # coin radius
COIN_RIM_W = 10                     # outer rim stroke
COIN_INNER_R = 244                  # inner reeded-ring guide
COIN_INNER_W = 7

PETAL_COUNT = 7
PETAL_R_IN = 240                    # hidden under the coin
PETAL_R_OUT = 432
PETAL_W = 150
PETAL_COLORS = [PETAL_LIGHT, PETAL_MAIN, PETAL_DARK]  # cycled for depth

# Hand-drawn CNY sign: two diagonals meeting above center, a stem,
# and two crossbars. Coordinates relative to coin center, y grows downward.
YEN_W = 54                          # stroke width (round caps)
YEN_STROKES = [
    (-108, -138, 0, -14),           # left diagonal
    (108, -138, 0, -14),            # right diagonal
    (0, -14, 0, 138),               # stem
    (-92, 32, 92, 32),              # upper crossbar
    (-92, 96, 92, 96),              # lower crossbar
]

SHADOW_OFFSET_Y = 300
SHADOW_RX, SHADOW_RY = 250, 42

FG_SAFE_SCALE = 0.62                # adaptive icon: keep art inside ~61% safe zone
SPLASH_SCALE = 0.70

# ------------------------------- helpers -------------------------------------


def linear_gradient(size: int, top: tuple, bottom: tuple) -> Image.Image:
    """Diagonal (top-left -> bottom-right) linear gradient."""
    t = np.linspace(0.0, 1.0, size, dtype=np.float32)
    xx, yy = np.meshgrid(t, t)  # y indexes rows, x indexes cols
    # along the diagonal: weight = (x + y) / 2
    m = ((xx + yy) / 2.0)[..., None]
    top_a, bottom_a = np.array(top, np.float32), np.array(bottom, np.float32)
    arr = top_a + (bottom_a - top_a) * m
    alpha = np.full((size, size, 1), 255, np.float32)
    return Image.fromarray(np.concatenate([arr, alpha], -1).astype(np.uint8), "RGBA")


def radial_mask(size: int, cx: float, cy: float, radius: float) -> np.ndarray:
    """Soft radial falloff mask (1.0 at center -> 0.0 at radius), float32."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / radius
    return np.clip(1.0 - d, 0.0, 1.0)


def tint_layer(size: int, cx: float, cy: float, radius: float, color: tuple) -> Image.Image:
    """A soft circular glow of `color` at (cx, cy)."""
    mask = radial_mask(size, cx, cy, radius)
    arr = np.zeros((size, size, 4), np.float32)
    arr[..., :3] = color
    arr[..., 3] = mask * 255.0
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def capsule(draw: ImageDraw.ImageDraw, p0: tuple, p1: tuple, w: float, fill):
    """Line segment with round caps (stadium shape)."""
    draw.line([p0, p1], fill=fill, width=int(round(w)))
    r = w / 2.0
    for (x, y) in (p0, p1):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)


# ------------------------------- layers --------------------------------------


def make_background(size: int) -> Image.Image:
    """Warm diagonal gradient with two very subtle glows for depth."""
    img = linear_gradient(size, BG_TOP, BG_BOTTOM)
    glow_tl = tint_layer(size, size * 0.28, size * 0.26, size * 0.5, (255, 255, 255))
    glow_br = tint_layer(size, size * 0.74, size * 0.76, size * 0.52, COIN_MAIN)
    for layer in (glow_tl, glow_br):
        a = np.array(layer, np.float32)
        a[..., 3] *= 0.08  # keep glows whisper-quiet
        img = Image.alpha_composite(img, Image.fromarray(a.astype(np.uint8), "RGBA"))
    return img


def make_coin_shadow(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / BASE
    cx, cy = CX * s, (CY + SHADOW_OFFSET_Y) * s
    rx, ry = SHADOW_RX * s, SHADOW_RY * s
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=SHADOW + (64,))
    return img.filter(ImageFilter.GaussianBlur(28 * s))


def make_petals(size: int, colors: list | None = None, white: bool = False) -> Image.Image:
    """Seven stadium-shaped petals radiating from behind the coin."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / BASE
    colors = colors or PETAL_COLORS
    fill_base = (255, 255, 255) if white else None
    for i in range(PETAL_COUNT):
        ang = -90.0 + i * 360.0 / PETAL_COUNT  # degrees, first petal points up
        rad = np.deg2rad(ang)
        # NB: center must be scaled together with the radii into canvas space
        inner = ((CX + PETAL_R_IN * np.cos(rad)) * s, (CY + PETAL_R_IN * np.sin(rad)) * s)
        outer = ((CX + PETAL_R_OUT * np.cos(rad)) * s, (CY + PETAL_R_OUT * np.sin(rad)) * s)
        fill = fill_base if white else colors[i % len(colors)]
        capsule(d, inner, outer, PETAL_W * s, fill)
    return img


def make_coin(size: int, white: bool = False) -> Image.Image:
    """Coin disc: radial gradient body + rim + inner reeded guide.

    The gradient hotspot sits top-left to suggest light from the glows.
    """
    s = size / BASE
    cx, cy, r = CX * s, CY * s, COIN_R * s
    if white:
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(img).ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 255))
        return img

    # radial gradient: highlight (offset toward top-left) -> main -> dark
    mask = radial_mask(size, cx - r * 0.45, cy - r * 0.45, r * 2.15)
    body = np.zeros((size, size, 4), np.float32)
    # blend highlight->main on the inner 55%, main->dark on the outer 45%
    t = np.clip(mask, 0.0, 1.0)
    inner = np.clip(t / 0.55, 0, 1)[..., None]
    outer = np.clip((t - 0.55) / 0.45, 0, 1)[..., None]
    c1 = np.array(COIN_HIGHLIGHT, np.float32)
    c2 = np.array(COIN_MAIN, np.float32)
    c3 = np.array(COIN_DARK, np.float32)
    arr = c1 + (c2 - c1) * inner
    arr = arr + (c3 - arr) * outer
    inside = t > 0.0  # disc region (mask hits 0 exactly at disc edge? no—see below)
    # Disc membership must be exact, so define it geometrically instead:
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    disc = ((xx - cx) ** 2 + (yy - cy) ** 2) <= r * r
    body[..., :3] = np.where(disc[..., None], arr, 0)
    body[..., 3] = disc * 255
    img = Image.fromarray(body.astype(np.uint8), "RGBA")

    d = ImageDraw.Draw(img)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=COIN_EDGE, width=int(COIN_RIM_W * s))
    ri = COIN_INNER_R * s
    wi = int(COIN_INNER_W * s)
    d.ellipse([cx - ri, cy - ri, cx + ri, cy + ri], outline=COIN_EDGE + (110,), width=wi)
    return img


def make_yen(size: int, color=YEN_INK, stroke_w: float = YEN_W) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / BASE
    for x0, y0, x1, y1 in YEN_STROKES:
        capsule(
            d,
            ((CX + x0) * s, (CY + y0) * s),
            ((CX + x1) * s, (CY + y1) * s),
            stroke_w * s,
            color + (255,),
        )
    return img


def scale_into(canvas_size: int, layer: Image.Image, scale: float) -> Image.Image:
    """Place `layer` scaled to `scale` of the canvas, centered, on transparency."""
    out = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    w = int(canvas_size * scale)
    small = layer.resize((w, w), Image.LANCZOS)
    off = (canvas_size - w) // 2
    out.alpha_composite(small, (off, off))
    return out


# ------------------------------- variants ------------------------------------


def make_icon(size: int = BASE) -> Image.Image:
    art = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    art.alpha_composite(make_background(CANVAS))
    art.alpha_composite(make_coin_shadow(CANVAS))
    art.alpha_composite(make_petals(CANVAS))
    art.alpha_composite(make_coin(CANVAS))
    art.alpha_composite(make_yen(CANVAS))
    return art.resize((size, size), Image.LANCZOS).convert("RGB")


def make_logo(size: int, scale: float, white: bool = False) -> Image.Image:
    """Transparent-background logo: petals + coin (+ carved yen for mono)."""
    if white:
        # Union of white silhouettes via per-channel max: keeps RGB clean
        # (no bleed from the transparent black canvas) and equals set union.
        art = ImageChops.lighter(make_petals(CANVAS, white=True), make_coin(CANVAS, white=True))
        # Monochrome: subtract the yen strokes so the sign shows as cut-out.
        base_a = np.asarray(art, np.float32)[..., 3]
        cut = np.asarray(make_yen(CANVAS, stroke_w=YEN_W), np.float32)[..., 3]
        out_a = np.clip(base_a * (1.0 - cut / 255.0), 0, 255).astype(np.uint8)
        mono = np.full((CANVAS, CANVAS, 4), 255, np.uint8)
        mono[..., 3] = out_a
        art = Image.fromarray(mono, "RGBA")
        return scale_into(size, art, scale)

    art = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    art.alpha_composite(make_petals(CANVAS))
    art.alpha_composite(make_coin(CANVAS))
    art.alpha_composite(make_yen(CANVAS))
    return scale_into(size, art, scale)


def make_favicon(size: int = 48) -> Image.Image:
    """Coin-only favicon: petals would smear at 48px, drop them and zoom in."""
    big = size * SS
    art = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    art.alpha_composite(make_background(big))
    zoom = 1.25  # coin slightly larger relative to the frame than in the main icon
    coin = make_coin(BASE * SS)
    logo = scale_into(BASE * SS, coin, zoom)
    yen = make_yen(BASE * SS, stroke_w=YEN_W * 1.1)
    logo.alpha_composite(scale_into(BASE * SS, yen, zoom))
    art.alpha_composite(scale_into(big, logo, 1.0))
    return art.resize((size, size), Image.LANCZOS)


# ------------------------------- checks --------------------------------------

CHARS = " .:-=+*#%@"


def ascii_preview(img: Image.Image, cells: int = 36) -> str:
    """Rough luminance map to sanity-check composition without eyes."""
    im = img.convert("RGBA").resize((cells, cells), Image.LANCZOS)
    rows = []
    for y in range(cells):
        row = []
        for x in range(cells):
            r, g, b, a = im.getpixel((x, y))
            if a < 32:
                row.append(" ")
                continue
            lum = (r * 299 + g * 587 + b * 114) / 1000
            row.append(CHARS[min(int(lum / 256 * len(CHARS)), len(CHARS) - 1)])
        rows.append("".join(row))
    return "\n".join(rows)


def verify(assets: dict[str, Image.Image]) -> None:
    icon = assets["icon.png"]
    assert icon.size == (1024, 1024) and icon.mode == "RGB"
    corner = icon.getpixel((8, 8))
    assert abs(corner[0] - BG_TOP[0]) < 8, f"corner tint off: {corner}"
    center = icon.getpixel((512, 430))  # gap above the yen strokes -> coin body
    assert center[2] < 60 and center[0] > 200, f"center should be coin amber, got {center}"
    # top petal must peek out above the coin, on the petal centerline
    petal = icon.getpixel((512, 90))
    assert abs(petal[0] - PETAL_LIGHT[0]) < 12 and abs(petal[1] - PETAL_LIGHT[1]) < 12, (
        f"top petal missing at (512,90): {petal}"
    )
    # far left edge must stay background (petals must not escape the frame)
    edge = icon.getpixel((40, 400))
    assert edge[2] > 200, f"petal leaked to the left edge: {edge}"

    fg = assets["android-icon-foreground.png"]
    assert fg.mode == "RGBA" and fg.size == (1024, 1024)
    # art must be transparent near the border, opaque at the coin
    assert fg.getpixel((4, 4))[3] == 0, "foreground must not bleed to the canvas edge"
    assert fg.getpixel((512, 512))[3] == 255, "coin must be opaque at center"

    mono = assets["android-icon-monochrome.png"]
    px = np.asarray(mono)
    opaque = px[..., 3] > 200
    # system launchers tint by alpha; keep visible pixels near-white
    assert opaque.any() and px[opaque][:, :3].min() >= 250, "monochrome must stay near-white"
    # yen stem carved out: alpha must dip at the stem center, high beside it
    # (coordinates in the 0.62-scaled space: stem spans y 487-614 at x=512)
    stem, beside = px[550, 512, 3], px[512, 660, 3]
    assert stem < 60 and beside > 200, f"yen cut-out missing: stem={stem} beside={beside}"

    print(ascii_preview(icon))
    print("all invariants passed")


# --------------------------------- main --------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="assets", type=Path)
    args = parser.parse_args()

    assets: dict[str, Image.Image] = {
        "icon.png": make_icon(),
        "android-icon-foreground.png": make_logo(BASE, FG_SAFE_SCALE),
        "android-icon-background.png": make_background(BASE),
        "android-icon-monochrome.png": make_logo(BASE, FG_SAFE_SCALE, white=True),
        "favicon.png": make_favicon(),
        "splash-icon.png": make_logo(BASE, SPLASH_SCALE),
    }
    for name, img in assets.items():
        img.save(args.out / name)
        print(f"wrote {args.out / name}  {img.size[0]}x{img.size[1]} {img.mode}")
    verify(assets)


if __name__ == "__main__":
    main()
