#!/usr/bin/env python3
"""Render previews and validate app-icon candidates in a candidate directory.

Each candidate is a sub-directory containing icon.svg, the three adaptive SVG
layers, notes.md and (optionally) meta.json:

    {"letter": "A", "zh": "液态金币", "en": "Liquid Coin", "flat": false}

The script renders the layers, writes canonical previews per candidate,
manifests a preview-masks.png and a contact-sheet.png, checks the delivery
contract from the candidate group's SPEC, and writes validation.json.

Usage:
  python scripts/icon/build_candidates.py
  python scripts/icon/build_candidates.py --dir design/icon-candidates-flat \
      --title "花哪了 · 极简环 · 候选"
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_svg import render  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIR = ROOT / "design" / "icon-candidates"
SIZE = 1024
SAFE_R = 330.0  # radius of the 660 px adaptive safe circle

PAPER = (247, 247, 245)
INK = (28, 25, 23)
MUTED = (120, 113, 108)
HAIRLINE = (231, 229, 228)

FONT_ZH = r"C:\Windows\Fonts\msyh.ttc"
FONT_ZH_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_EN = r"C:\Windows\Fonts\segoeui.ttf"
FONT_EN_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"

REQUIRED = [
    "icon.svg",
    "adaptive-foreground.svg",
    "adaptive-background.svg",
    "adaptive-monochrome.svg",
    "notes.md",
]

# Any icon group that says "no glass / no effects" must pass these.
FLAT_FORBIDDEN = {
    r"<filter[\s>]": "contains <filter> (flat style forbids blur/glow/shadow)",
    r"\bfilter\s*=": "applies a filter (flat style forbids blur/glow/shadow)",
    r"feGaussianBlur": "contains feGaussianBlur (flat style forbids blur)",
    r"feDropShadow": "contains feDropShadow (flat style forbids shadow)",
    r"feBlend": "contains feBlend",
    r"<linearGradient": "contains linearGradient (flat style forbids gradients)",
    r"<radialGradient": "contains radialGradient (flat style forbids gradients)",
    r"<pattern": "contains <pattern>",
}


# --------------------------------- fonts --------------------------------------


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


# --------------------------------- masks --------------------------------------


def superellipse_mask(size: int = SIZE, p: float = 5.0) -> Image.Image:
    """Apple-ish continuous-corner squircle approximation."""
    t = (np.arange(size, dtype=np.float32) + 0.5) / size * 2.0 - 1.0
    x, y = np.meshgrid(t, t)
    inside = (np.abs(x) ** p + np.abs(y) ** p) <= 1.0
    return Image.fromarray((inside * 255).astype(np.uint8), "L")


def circle_mask(size: int = SIZE) -> Image.Image:
    t = (np.arange(size, dtype=np.float32) + 0.5) / size * 2.0 - 1.0
    x, y = np.meshgrid(t, t)
    inside = (x * x + y * y) <= 1.0
    return Image.fromarray((inside * 255).astype(np.uint8), "L")


def rounded_mask(size: int = SIZE, ratio: float = 0.242) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * ratio), fill=255
    )
    return mask


# ------------------------------ compositing -----------------------------------


def downscale(img: Image.Image, edge: int) -> Image.Image:
    return img.resize((edge, edge), Image.LANCZOS)


def carried(img: Image.Image, mask: Image.Image | None, pad_ratio: float = 0.075,
            shadow: bool = True, bg: tuple[int, int, int] = PAPER) -> Image.Image:
    """Place icon art (optionally masked) on a padded card with a soft shadow."""
    size = img.size[0]
    pad = int(size * pad_ratio)
    canvas = Image.new("RGBA", (size + 2 * pad, size + 2 * pad), bg + (255,))
    if mask is not None:
        masked = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        masked.paste(img, (0, 0), mask)
        if shadow:
            sm = mask.filter(ImageFilter.GaussianBlur(max(1, int(size * 0.022))))
            sh = Image.new("RGBA", (size, size), (52, 43, 35, 0))
            sh.putalpha(sm.point(lambda v: int(v * 0.30)))
            canvas.alpha_composite(sh, (pad, pad + int(size * 0.014)))
        canvas.alpha_composite(masked, (pad, pad))
    else:
        if shadow:
            alpha = Image.new("L", (size, size), 255)
            alpha = alpha.filter(ImageFilter.GaussianBlur(max(1, int(size * 0.022))))
            sh = Image.new("RGBA", (size, size), (52, 43, 35, 0))
            sh.putalpha(alpha.point(lambda v: int(v * 0.14)))
            canvas.alpha_composite(sh, (pad, pad + int(size * 0.012)))
        canvas.alpha_composite(img, (pad, pad))
    return canvas


def adaptive_composite(bg: Image.Image, fg: Image.Image) -> Image.Image:
    comp = bg.copy()
    comp.alpha_composite(fg)
    return comp


# ------------------------------ image checks ----------------------------------


def _alpha(img: Image.Image) -> np.ndarray:
    return np.asarray(img)[..., 3]


def content_radius(img: Image.Image, thresh: int = 8) -> float:
    a = _alpha(img) > thresh
    ys, xs = np.nonzero(a)
    if xs.size == 0:
        return 0.0
    c = (SIZE - 1) / 2.0
    return float(np.sqrt((xs - c) ** 2 + (ys - c) ** 2).max())


def corners_opaque(img: Image.Image, probe: int = 12) -> bool:
    a = _alpha(img)
    blocks = [a[:probe, :probe], a[:probe, -probe:], a[-probe:, :probe], a[-probe:, -probe:]]
    return all(int(b.min()) >= 250 for b in blocks)


def corners_transparent(img: Image.Image, probe: int = 8) -> bool:
    a = _alpha(img)
    blocks = [a[:probe, :probe], a[:probe, -probe:], a[-probe:, :probe], a[-probe:, -probe:]]
    return all(int(b.max()) <= 2 for b in blocks)


def svg_checks(path: Path, flat: bool = False) -> list[str]:
    problems: list[str] = []
    try:
        text = path.read_text(encoding="utf-8")
        ET.fromstring(text)
    except Exception as exc:  # noqa: BLE001 - report any XML problem
        return [f"{path.name}: invalid XML ({exc})"]
    if not re.search(r'viewBox\s*=\s*["\']0 0 1024 1024["\']', text):
        problems.append(f'{path.name}: missing viewBox="0 0 1024 1024"')
    if not re.search(r'\bwidth\s*=\s*["\']1024["\']', text):
        problems.append(f"{path.name}: width is not 1024")
    if not re.search(r'\bheight\s*=\s*["\']1024["\']', text):
        problems.append(f"{path.name}: height is not 1024")
    forbidden = {
        r"<text[\s>/]": "contains <text> (convert text to paths)",
        r"<image[\s>/]": "contains <image> raster",
        r"<foreignObject": "contains <foreignObject>",
        r"<script": "contains <script>",
        r"@font-face": "references a font",
        r"href\s*=\s*[\"'](?:https?:)?//": "references an external URL",
        r"url\(\s*[\"']?https?:": "references an external URL",
    }
    if flat:
        forbidden.update(FLAT_FORBIDDEN)
    for pattern, message in forbidden.items():
        if re.search(pattern, text):
            problems.append(f"{path.name}: {message}")
    return problems


def validate(cid: str, cdir: Path, build_dir: Path, flat: bool = False) -> dict:
    entry: dict = {"id": cid, "problems": [], "warnings": [], "metrics": {}, "files": {}}
    problems: list[str] = entry["problems"]
    warnings: list[str] = entry["warnings"]
    metrics: dict = entry["metrics"]

    for name in REQUIRED:
        path = cdir / name
        entry["files"][name] = path.exists()
        if not path.exists():
            problems.append(f"missing {name}")
    for name in REQUIRED:
        if name.endswith(".svg") and (cdir / name).exists():
            problems.extend(svg_checks(cdir / name, flat))
    if problems:
        return entry

    icon = Image.open(cdir / "preview-icon.png").convert("RGBA")
    fg = Image.open(build_dir / cid / "adaptive-foreground.png").convert("RGBA")
    bg = Image.open(build_dir / cid / "adaptive-background.png").convert("RGBA")
    mono = Image.open(build_dir / cid / "adaptive-monochrome.png").convert("RGBA")

    for label, img in (("icon", icon), ("foreground", fg), ("background", bg), ("monochrome", mono)):
        if img.size != (SIZE, SIZE):
            problems.append(f"{label}: expected {SIZE}x{SIZE}, got {img.size}")

    alpha = _alpha(icon)
    metrics["icon_min_alpha"] = int(alpha.min())
    if int(alpha.min()) < 250:
        problems.append("icon: must be fully opaque (iOS forbids transparency)")
    if not corners_opaque(icon):
        problems.append("icon: corners are transparent (no full-bleed background?)")

    metrics["foreground_radius"] = round(content_radius(fg), 1)
    if metrics["foreground_radius"] > SAFE_R + 2:
        problems.append(
            f"foreground: content radius {metrics['foreground_radius']:.0f}px exceeds "
            f"the 660px safe circle (r={SAFE_R:.0f})"
        )
    if not corners_transparent(fg):
        problems.append("foreground: corners must be transparent")
    if int(_alpha(fg).max()) < 200:
        problems.append("foreground: appears empty")

    if not corners_opaque(bg):
        warnings.append("background: corners are not fully opaque")
    metrics["background_min_alpha"] = int(_alpha(bg).min())

    mong = np.asarray(mono)
    opaque = mong[..., 3] > 200
    metrics["monochrome_radius"] = round(content_radius(mono), 1)
    if metrics["monochrome_radius"] > SAFE_R + 2:
        problems.append("monochrome: content outside the adaptive safe circle")
    if not opaque.any():
        problems.append("monochrome: empty layer")
    elif int(mong[opaque][:, :3].min()) < 240:
        problems.append("monochrome: visible pixels must be near-white")
    if not corners_transparent(mono):
        problems.append("monochrome: corners must be transparent")

    if (cdir / "preview-48.png").exists():
        p48 = Image.open(cdir / "preview-48.png")
        if p48.size != (48, 48):
            warnings.append("preview-48.png is not 48x48")

    return entry


# --------------------------------- sheets -------------------------------------


def build_candidate_sheet(cand: dict, icon: Image.Image, comp: Image.Image, cdir: Path) -> None:
    tile = 280
    gap, margin, header, caption_h = 28, 36, 92, 34
    tiles = [
        (downscale(carried(icon, None, shadow=False), tile), "主图 1024 · iOS / 通用"),
        (downscale(carried(icon, superellipse_mask()), tile), "iOS 圆角遮罩"),
        (downscale(carried(comp, circle_mask()), tile), "Android 圆形遮罩"),
        (downscale(carried(comp, rounded_mask()), tile), "Android 方圆遮罩"),
    ]
    width = margin * 2 + tile * len(tiles) + gap * (len(tiles) - 1)
    height = margin * 2 + header + tile + caption_h
    sheet = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(sheet)

    draw.text((margin, margin), f"{cand['letter']} · {cand['zh']}  {cand['en']}",
              font=font(FONT_ZH_BOLD, 34), fill=INK)
    draw.text((margin, margin + 52),
              "iOS 1024 · Android adaptive 预览（掩码为模拟，实际由系统裁切）",
              font=font(FONT_ZH, 18), fill=MUTED)

    y = margin + header
    for i, (img, label) in enumerate(tiles):
        x = margin + i * (tile + gap)
        sheet.paste(img, (x, y), img)
        if i == 0:
            draw.rectangle([x, y, x + tile - 1, y + tile - 1], outline=HAIRLINE, width=1)
        draw.text((x + tile // 2, y + tile + 10), label, font=font(FONT_ZH, 17),
                  fill=MUTED, anchor="ma")
    out = cdir / "preview-masks.png"
    sheet.save(out)
    print(f"wrote {rel(out)}  {sheet.size[0]}x{sheet.size[1]}")


def build_contact_sheet(cands: list[dict], icons: dict[str, Image.Image],
                        comps: dict[str, Image.Image], out: Path,
                        title: str, subtitle: str) -> None:
    margin, header, footer = 44, 128, 34
    label_w, tile, gap = 205, 236, 24
    small = 96
    col_heads = ["主图 1024", "iOS 圆角", "Android 圆形", "Android 方圆", "48 px"]
    row_h = tile + 66
    width = margin * 2 + label_w + tile * 4 + small + gap * 5
    height = margin * 2 + header + row_h * len(cands) + footer
    sheet = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(sheet)

    draw.text((margin, margin), title, font=font(FONT_ZH_BOLD, 38), fill=INK)
    draw.text((margin, margin + 56), subtitle, font=font(FONT_ZH, 18), fill=MUTED)

    x0 = margin + label_w + gap
    head_y = margin + header - 24
    draw.text((margin, head_y), "候选", font=font(FONT_ZH_BOLD, 18), fill=MUTED)
    for i, head in enumerate(col_heads):
        if i < 4:
            x = x0 + i * (tile + gap)
            draw.text((x + tile / 2, head_y), head, font=font(FONT_ZH, 17),
                      fill=MUTED, anchor="ma")
        else:
            x = x0 + 4 * (tile + gap)
            draw.text((x + small / 2, head_y), head, font=font(FONT_ZH, 17),
                      fill=MUTED, anchor="ma")

    for r, cand in enumerate(cands):
        cid = cand["id"]
        top = margin + header + r * row_h
        if r > 0:
            draw.line([(margin, top - 12), (width - margin, top - 12)], fill=HAIRLINE, width=1)
        label_x = margin
        big = font(FONT_EN_BOLD, 46)
        draw.text((label_x, top + 48), cand["letter"], font=big, fill=INK)
        bbox = draw.textbbox((label_x, top + 48), cand["letter"], font=big)
        zh_x = bbox[2] + 16
        draw.text((zh_x, top + 50), cand["zh"], font=font(FONT_ZH_BOLD, 22), fill=INK)
        draw.text((zh_x, top + 80), cand["en"], font=font(FONT_EN, 15), fill=MUTED)

        icon, comp = icons[cid], comps[cid]
        tiles = [
            downscale(carried(icon, None, shadow=False), tile),
            downscale(carried(icon, superellipse_mask()), tile),
            downscale(carried(comp, circle_mask()), tile),
            downscale(carried(comp, rounded_mask()), tile),
        ]
        for i, img in enumerate(tiles):
            x = x0 + i * (tile + gap)
            sheet.paste(img, (x, top), img)
            if i == 0:
                draw.rectangle([x, top, x + tile - 1, top + tile - 1],
                               outline=HAIRLINE, width=1)
        icon48 = downscale(icon, 48).resize((small, small), Image.NEAREST)
        x48 = x0 + 4 * (tile + gap)
        card = Image.new("RGBA", (small, small), PAPER + (255,))
        card.alpha_composite(icon48)
        sheet.paste(card, (x48, top + (tile - small) // 2), card)
        draw.rectangle([x48, top + (tile - small) // 2, x48 + small - 1,
                        top + (tile - small) // 2 + small - 1], outline=HAIRLINE, width=1)
        draw.text((x48 + small / 2, top + (tile - small) // 2 + small + 8), "×2",
                  font=font(FONT_ZH, 15), fill=MUTED, anchor="ma")

    foot = "矢量源文件 design/icon-candidates*/<id>/*.svg · 48px 列为 2× 放大展示 · 掩码为预览模拟"
    draw.text((margin, height - margin - 18), foot, font=font(FONT_ZH, 15), fill=MUTED)
    sheet.save(out)
    print(f"wrote {rel(out)}  {sheet.size[0]}x{sheet.size[1]}")


# --------------------------------- main ---------------------------------------


def load_candidates(cand_root: Path) -> list[dict]:
    cands: list[dict] = []
    for cdir in sorted(p for p in cand_root.iterdir() if p.is_dir()):
        if not (cdir / "icon.svg").exists():
            continue
        cid = cdir.name
        meta = {"letter": cid[:1].upper(), "zh": cid, "en": cid, "flat": False}
        meta_path = cdir / "meta.json"
        if meta_path.exists():
            meta.update(json.loads(meta_path.read_text(encoding="utf-8-sig")))
        meta["id"] = cid
        cands.append(meta)
    return cands


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", type=Path, default=DEFAULT_DIR,
                        help="candidate directory (default: design/icon-candidates)")
    parser.add_argument("--only", default=None, help="comma separated candidate ids")
    parser.add_argument("--skip-render", action="store_true")
    parser.add_argument("--title", default="花哪了 · 应用图标候选")
    parser.add_argument("--subtitle", default="扁平 / 液态玻璃 · iOS 1024 + Android adaptive")
    args = parser.parse_args()

    cand_root = (args.dir if args.dir.is_absolute() else ROOT / args.dir).resolve()
    if not cand_root.exists():
        raise SystemExit(f"candidate dir not found: {cand_root}")
    build_root = cand_root / "_build"
    wanted = {s.strip() for s in args.only.split(",")} if args.only else None

    cands = [c for c in load_candidates(cand_root)
             if wanted is None or c["id"] in wanted]
    if not cands:
        raise SystemExit("no matching candidates")

    icons: dict[str, Image.Image] = {}
    comps: dict[str, Image.Image] = {}
    report: dict = {"candidates": {}}

    for cand in cands:
        cid = cand["id"]
        cdir = cand_root / cid
        out = build_root / cid
        out.mkdir(parents=True, exist_ok=True)
        if not args.skip_render:
            render(cdir / "icon.svg", out / "icon.png")
            render(cdir / "adaptive-foreground.svg", out / "adaptive-foreground.png")
            render(cdir / "adaptive-background.svg", out / "adaptive-background.png")
            render(cdir / "adaptive-monochrome.svg", out / "adaptive-monochrome.png")

        icon = Image.open(out / "icon.png").convert("RGBA")
        fg = Image.open(out / "adaptive-foreground.png").convert("RGBA")
        bg = Image.open(out / "adaptive-background.png").convert("RGBA")
        mono = Image.open(out / "adaptive-monochrome.png").convert("RGBA")
        comp = adaptive_composite(bg, fg)

        icons[cid] = icon
        comps[cid] = comp

        icon.save(cdir / "preview-icon.png")
        icon.resize((48, 48), Image.LANCZOS).save(cdir / "preview-48.png")
        mono_check = Image.new("RGBA", (SIZE, SIZE), (24, 21, 20, 255))
        mono_check.alpha_composite(mono)
        mono_check.convert("RGB").resize((512, 512), Image.LANCZOS).save(
            cdir / "preview-monochrome-check.png"
        )

        entry = validate(cid, cdir, build_root, bool(cand.get("flat")))
        report["candidates"][cid] = entry
        status = "OK" if not entry["problems"] else "PROBLEMS"
        print(f"[{cid}] {status}")
        for problem in entry["problems"]:
            print(f"  ✗ {problem}")
        for warning in entry["warnings"]:
            print(f"  ⚠ {warning}")

        build_candidate_sheet(cand, icon, comp, cdir)

    contact = cand_root / "contact-sheet.png"
    build_contact_sheet(cands, icons, comps, contact, args.title, args.subtitle)
    (cand_root / "validation.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {rel(cand_root / 'validation.json')}")

    problems = [p for c in report["candidates"].values() for p in c["problems"]]
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
