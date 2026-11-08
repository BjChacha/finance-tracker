#!/usr/bin/env python3
"""Apply one chosen icon candidate to the Expo asset set.

Writes the six PNGs under assets/ that app.json points at, refreshes the two
background-colour fields in app.json, and (with --sync-android) regenerates the
Android launcher mipmaps in place so an existing `npm run build:apk` picks the
new icon up without a full `expo prebuild`.

Usage:
  python scripts/icon/apply_candidate.py --list
  python scripts/icon/apply_candidate.py a-liquid-coin --dry-run
  python scripts/icon/apply_candidate.py a-liquid-coin --sync-android
  python scripts/icon/apply_candidate.py r1-allocation --dir design/icon-candidates-flat --sync-android
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_candidates import circle_mask  # noqa: E402
from render_svg import render  # noqa: E402

DEFAULT_ROOT = Path(__file__).resolve().parents[2]

DENSITIES = [("mdpi", 1.0), ("hdpi", 1.5), ("xhdpi", 2.0), ("xxhdpi", 3.0), ("xxxhdpi", 4.0)]
LEGACY_DP = 48
ADAPTIVE_DP = 108

ASSETS = {
    "icon.png": ("icon", "RGB"),
    "android-icon-foreground.png": ("adaptive-foreground", "RGBA"),
    "android-icon-background.png": ("adaptive-background", "RGBA"),
    "android-icon-monochrome.png": ("adaptive-monochrome", "RGBA"),
    "favicon.png": ("favicon", "RGB"),
    "splash-icon.png": ("splash", "RGBA"),
}


def hex_color(rgb: tuple[int, int, int]) -> str:
    return "#%02X%02X%02X" % rgb


def dominant_color(img: Image.Image) -> str:
    """Average of the outer ring — a good stand-in for the adaptive fallback colour."""
    arr = np.asarray(img.convert("RGB"), dtype=np.float64)
    band = np.concatenate([arr[:64].reshape(-1, 3), arr[-64:].reshape(-1, 3),
                           arr[:, :64].reshape(-1, 3), arr[:, -64:].reshape(-1, 3)])
    mean = band.mean(axis=0)
    return hex_color(tuple(min(255, max(0, int(round(v)))) for v in mean))


def paste_scaled(art: Image.Image, scale: float, size: int = 1024) -> Image.Image:
    inner = int(size * scale)
    small = art.resize((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    off = (size - inner) // 2
    canvas.alpha_composite(small, (off, off))
    return canvas


def render_sources(cdir: Path, out: Path) -> dict[str, Image.Image]:
    out.mkdir(parents=True, exist_ok=True)
    render(cdir / "icon.svg", out / "icon.png")
    render(cdir / "adaptive-foreground.svg", out / "fg.png")
    render(cdir / "adaptive-background.svg", out / "bg.png")
    render(cdir / "adaptive-monochrome.svg", out / "mono.png")
    icon = Image.open(out / "icon.png").convert("RGBA")
    if int(np.asarray(icon)[..., 3].min()) < 250:
        raise SystemExit("icon.svg must be fully opaque for iOS")
    return {
        "icon": icon,
        "fg": Image.open(out / "fg.png").convert("RGBA"),
        "bg": Image.open(out / "bg.png").convert("RGBA"),
        "mono": Image.open(out / "mono.png").convert("RGBA"),
    }


def update_app_json(path: Path, color: str, dry_run: bool) -> list[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    changed: list[str] = []
    adaptive = data.get("expo", {}).get("android", {}).get("adaptiveIcon", {})
    if adaptive.get("backgroundColor") != color:
        changed.append(f"app.json: adaptiveIcon.backgroundColor {adaptive.get('backgroundColor')} -> {color}")
        adaptive["backgroundColor"] = color
    for plugin in data.get("expo", {}).get("plugins", []):
        if isinstance(plugin, list) and plugin and plugin[0] == "expo-quick-actions":
            config = plugin[1] if len(plugin) > 1 else {}
            for name, cfg in (config.get("androidIcons") or {}).items():
                if isinstance(cfg, dict) and cfg.get("backgroundColor") != color:
                    changed.append(
                        f"app.json: quick-actions {name}.backgroundColor "
                        f"{cfg.get('backgroundColor')} -> {color}"
                    )
                    cfg["backgroundColor"] = color
    if changed and not dry_run:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


def update_colors_xml(path: Path, color: str, dry_run: bool) -> list[str]:
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8")
    original = text
    for name in ("iconBackground", "add_background_color"):
        text = re.sub(
            rf'(<color\s+name="{name}">)([^<]*)(</color>)',
            rf"\g<1>{color}\g<3>",
            text,
        )
    if text != original and not dry_run:
        path.write_text(text, encoding="utf-8")
    return [f"colors.xml: {name} -> {color}" for name in ("iconBackground", "add_background_color")]


def save_launcher(img: Image.Image, path: Path) -> None:
    """Save a launcher resource in the format its extension declares."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() == ".webp":
        img.save(path, "WEBP", lossless=True, quality=100, method=6)
    else:
        img.save(path, "PNG")


def sync_android(res: Path, sources: dict[str, Image.Image], color: str, dry_run: bool) -> list[str]:
    written: list[str] = []
    icon = sources["icon"]
    fg = sources["fg"]
    bg = sources["bg"]
    comp = bg.copy()
    comp.alpha_composite(fg)
    for density, scale in DENSITIES:
        ddir = res / f"mipmap-{density}"
        if not ddir.exists():
            continue
        legacy = int(round(LEGACY_DP * scale))
        adaptive = int(round(ADAPTIVE_DP * scale))
        legacy_img = icon.resize((legacy, legacy), Image.LANCZOS)
        round_img = Image.new("RGBA", (legacy, legacy), (0, 0, 0, 0))
        round_img.paste(legacy_img, (0, 0), circle_mask(legacy))
        targets = {
            ddir / "ic_launcher.webp": legacy_img,
            ddir / "ic_launcher_round.webp": round_img,
            ddir / "ic_launcher_background.webp": bg.resize((adaptive, adaptive), Image.LANCZOS),
            ddir / "ic_launcher_foreground.webp": fg.resize((adaptive, adaptive), Image.LANCZOS),
            ddir / "ic_launcher_monochrome.webp": sources["mono"].resize((adaptive, adaptive), Image.LANCZOS),
            ddir / "add.png": comp.resize((adaptive, adaptive), Image.LANCZOS),
            ddir / "add_foreground.png": fg.resize((adaptive, adaptive), Image.LANCZOS),
            ddir / "add_round.png": Image.new("RGBA", (adaptive, adaptive), (0, 0, 0, 0)),
        }
        round_adaptive = comp.resize((adaptive, adaptive), Image.LANCZOS)
        targets[ddir / "add_round.png"].paste(round_adaptive, (0, 0), circle_mask(adaptive))
        for path, img in targets.items():
            if not dry_run:
                save_launcher(img, path)
            written.append(str(path.relative_to(res.parents[3])) if path.is_relative_to(res.parents[3]) else str(path))
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate", nargs="?", help="candidate id, e.g. a-liquid-coin")
    parser.add_argument("--list", action="store_true", help="list candidates and exit")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT,
                        help="output root, for testing (candidates always come from the repo)")
    parser.add_argument("--dir", type=Path, default=DEFAULT_ROOT / "design" / "icon-candidates",
                        help="candidate directory")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--sync-android", action="store_true",
                        help="regenerate android/app/src/main/res launcher mipmaps in place")
    args = parser.parse_args()

    cand_root = args.dir if args.dir.is_absolute() else DEFAULT_ROOT / args.dir
    candidates = sorted(p.name for p in cand_root.iterdir() if (p / "icon.svg").exists())
    if args.list or not args.candidate:
        print("candidates:")
        for name in candidates:
            print(f"  {name}")
        return
    cdir = cand_root / args.candidate
    if not (cdir / "icon.svg").exists():
        raise SystemExit(f"unknown candidate: {args.candidate} (have: {', '.join(candidates)})")

    sources = render_sources(cdir, cand_root / "_apply")
    color = dominant_color(sources["bg"])
    print(f"candidate: {args.candidate}")
    print(f"adaptive fallback colour: {color}")

    outputs: dict[Path, Image.Image] = {}
    icon = sources["icon"]
    outputs[args.root / "assets" / "icon.png"] = icon.convert("RGB")
    outputs[args.root / "assets" / "android-icon-foreground.png"] = sources["fg"]
    outputs[args.root / "assets" / "android-icon-background.png"] = sources["bg"]
    outputs[args.root / "assets" / "android-icon-monochrome.png"] = sources["mono"]
    outputs[args.root / "assets" / "favicon.png"] = icon.resize((48, 48), Image.LANCZOS).convert("RGB")
    outputs[args.root / "assets" / "splash-icon.png"] = paste_scaled(sources["fg"], 0.86)

    for path, img in outputs.items():
        print(f"  {'(dry) ' if args.dry_run else ''}write {path.relative_to(args.root)}  {img.size[0]}x{img.size[1]} {img.mode}")
        if not args.dry_run:
            path.parent.mkdir(parents=True, exist_ok=True)
            img.save(path)

    config_changes = update_app_json(args.root / "app.json", color, args.dry_run)
    for line in config_changes:
        print(f"  {'(dry) ' if args.dry_run else ''}{line}")

    android_res = args.root / "android" / "app" / "src" / "main" / "res"
    if args.sync_android and android_res.exists():
        written = sync_android(android_res, sources, color, args.dry_run)
        for line in update_colors_xml(android_res / "values" / "colors.xml", color, args.dry_run):
            print(f"  {'(dry) ' if args.dry_run else ''}{line}")
        print(f"  {'(dry) ' if args.dry_run else ''}synced {len(written)} android launcher resources")
    elif args.sync_android:
        print("  ! android/ not found; skipped launcher sync (run `npx expo prebuild -p android`)")

    print()
    if args.dry_run:
        print("dry run only — nothing written")
    else:
        print("assets updated.")
        if not args.sync_android:
            print("run `npx expo prebuild --platform android` to regenerate launcher resources,")
            print("or re-run with --sync-android to patch mipmaps in place.")
        print("then build: EXPO_PUBLIC_DEEPSEEK_API_KEY=... npm run build:apk")


if __name__ == "__main__":
    main()
