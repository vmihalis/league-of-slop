#!/usr/bin/env python3
"""Build labeled side-by-side review sheets of candidate images.

Usage: sheet.py <champ> [...]   -> assets/candidates/_sheets/<champ>.png
       sheet.py all             -> one sheet per champion + _overview.png
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
CAND = ROOT / "assets" / "candidates"
SHEETS = CAND / "_sheets"
TILE = 720


def font(size):
    for f in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def sheet(champ, tile=TILE):
    files = sorted(CAND.glob(f"{champ}_*.png"))
    if not files:
        return None
    pad, head = 16, 70
    img = Image.new("RGB", (len(files) * (tile + pad) + pad, tile + head + pad), "white")
    d = ImageDraw.Draw(img)
    d.text((pad, 14), champ.upper(), fill="black", font=font(40))
    for i, f in enumerate(files):
        x = pad + i * (tile + pad)
        img.paste(Image.open(f).convert("RGB").resize((tile, tile)), (x, head))
        label = f.stem.split("_", 1)[1].upper()
        d.rectangle((x, head, x + 64, head + 64), fill="black")
        d.text((x + 18, head + 8), label, fill="white", font=font(44))
    out = SHEETS / f"{champ}.png"
    img.save(out)
    return out


def main(argv):
    SHEETS.mkdir(parents=True, exist_ok=True)
    champs = sorted({p.stem.split("_", 1)[0] for p in CAND.glob("*_*.png")}) if argv == ["all"] else argv
    outs = [o for c in champs if (o := sheet(c))]
    for o in outs:
        print(o)
    if argv == ["all"] and outs:
        rows = [Image.open(o) for o in outs]
        w = max(r.width for r in rows)
        ov = Image.new("RGB", (w, sum(r.height for r in rows)), "white")
        y = 0
        for r in rows:
            ov.paste(r, (0, y))
            y += r.height
        ov.thumbnail((2400, 8000))
        ov.save(SHEETS / "_overview.png")
        print(SHEETS / "_overview.png")


if __name__ == "__main__":
    main(sys.argv[1:])
