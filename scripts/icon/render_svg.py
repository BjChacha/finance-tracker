#!/usr/bin/env python3
"""Rasterize a standalone SVG file to a transparent PNG with headless Edge.

Why a browser: the icons use SVG filters / blend modes; PIL cannot render SVG
and cairosvg is not installed. Headless Chromium renders them faithfully.

Usage:
  python scripts/icon/render_svg.py <in.svg> <out.png> [--size 1024]

The SVG is rendered at its intrinsic size (its width/height attributes), then
downscaled with LANCZOS when --size differs.  Output keeps the alpha channel.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]


def find_browser() -> str:
    for path in BROWSERS:
        if Path(path).exists():
            return path
    raise SystemExit("no Edge/Chrome found for rasterization")


def intrinsic_size(svg_text: str) -> tuple[int, int]:
    w = re.search(r'<svg[^>]*\bwidth="([0-9.]+)', svg_text)
    h = re.search(r'<svg[^>]*\bheight="([0-9.]+)', svg_text)
    if not w or not h:
        raise SystemExit("SVG must declare numeric width/height attributes (1024x1024)")
    return round(float(w.group(1))), round(float(h.group(1)))


def render(svg_path: Path, out_path: Path, size: int | None = None) -> Path:
    svg_path = svg_path.resolve()
    out_path = out_path.resolve()
    if not svg_path.exists():
        raise SystemExit(f"missing SVG: {svg_path}")
    text = svg_path.read_text(encoding="utf-8")
    iw, ih = intrinsic_size(text)
    if iw != ih:
        raise SystemExit(f"SVG must be square, got {iw}x{ih}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    target = size or iw
    browser = find_browser()

    with tempfile.TemporaryDirectory(prefix="icon-render-") as tmp:
        raw = Path(tmp) / "raw.png"
        cmd = [
            browser,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            "--run-all-compositor-stages-before-draw",
            f"--window-size={iw},{ih}",
            "--default-background-color=00000000",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--disable-sync",
            f"--user-data-dir={tmp}",
            f"--screenshot={raw}",
            svg_path.as_uri(),
        ]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if not raw.exists():
            sys.stderr.write(proc.stdout + proc.stderr)
            raise SystemExit(f"browser produced no screenshot (exit {proc.returncode})")
        img = Image.open(raw).convert("RGBA")
        if img.size != (iw, ih):
            raise SystemExit(f"unexpected render size {img.size}, wanted {(iw, ih)}")
        if target != iw:
            img = img.resize((target, target), Image.LANCZOS)
        img.save(out_path)
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("svg", type=Path)
    parser.add_argument("png", type=Path)
    parser.add_argument("--size", type=int, default=None, help="output edge length (default: intrinsic)")
    args = parser.parse_args()
    path = render(args.svg, args.png, args.size)
    img = Image.open(path)
    print(f"wrote {path}  {img.size[0]}x{img.size[1]} {img.mode}")


if __name__ == "__main__":
    main()
