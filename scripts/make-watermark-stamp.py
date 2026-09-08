"""
Build `public/logo-stamp.webp` — the mark stamped into every listing photo.

WHY A GENERATED ASSET AND NOT CANVAS TEXT. `watermark.ts` runs in the browser
and could draw the caption with `ctx.fillText`. It must not: the caption would
then depend on the web font having finished loading at the moment the seller
picks a photo, and on the browser's own letter-spacing support. A seller on a
slow phone would silently get the fallback system font baked into their photo
for ever. Baking the caption into one asset makes every stamped photo
identical, whoever uploads it and whenever.

WHY PYTHON IN A NODE REPO. The caption has to be set in Plus Jakarta Sans —
the site's own typeface — and the only copy we have is the variable woff2 that
`next/font/local` serves. sharp's SVG renderer (librsvg) ignores `font-family`
entirely on this platform: naming the font, naming a nonexistent font and
naming Arial all produce byte-identical output, so it always draws its own
fallback. fontTools reads the woff2 and pins the variable axis at the weight
we want; Pillow draws that instance directly. Neither has a usable Node
equivalent here.

Run it after changing the wordmark, the caption or the brand colours:

    pip install fonttools brotli pillow
    python scripts/make-watermark-stamp.py
"""

import io
import os
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FONT_SRC = os.path.join(ROOT, "src", "app", "fonts", "PlusJakartaSans-latin.woff2")
MARK_SRC = os.path.join(ROOT, "public", "logo-mark.png")
OUT_PNG = os.path.join(ROOT, "public", "logo-stamp.png")
OUT_WEBP = os.path.join(ROOT, "public", "logo-stamp.webp")

# The business, then where to find it. Both, because neither alone is enough:
# a thief's repost carries the name to somebody who then has to search for us,
# and carries the domain to somebody who can type it straight in.
CAPTION = "MAZED AUTO · MAZED.TN"

WIDTH = 1200                # the stamp is authored large and scaled down
CAPTION_WIDTH_RATIO = 0.92  # caption spans this much of the monogram's width
LETTER_SPACING_EM = 0.16    # caps need air; this is what stops it reading as a word
WEIGHT = 800
# --gold-pale. Not white (which disowns the gold above it) and not --gold-mid
# (too dark to survive a bright photo at watermark opacity).
CAPTION_FILL = (253, 236, 175, 255)


def jakarta_at(weight: int) -> bytes:
    """The variable font pinned to one weight, as a static TTF in memory."""
    font = TTFont(FONT_SRC)
    font.flavor = None  # woff2 -> raw sfnt
    static = instancer.instantiateVariableFont(font, {"wght": weight})
    buf = io.BytesIO()
    static.save(buf)
    return buf.getvalue()


def text_width(font: ImageFont.FreeTypeFont, text: str, tracking: float) -> float:
    """Pillow has no letter-spacing, so the caption is set one glyph at a time."""
    return sum(font.getlength(ch) + tracking for ch in text) - tracking


def main() -> int:
    for path in (FONT_SRC, MARK_SRC):
        if not os.path.exists(path):
            print(f"missing input: {path}", file=sys.stderr)
            return 1

    ttf = jakarta_at(WEIGHT)

    # Solve for the size that makes the caption span CAPTION_WIDTH_RATIO of the
    # stamp. Fixed-point rather than a search: width is very nearly linear in
    # size, so this lands in three or four passes.
    target = WIDTH * CAPTION_WIDTH_RATIO
    size = 100.0
    for _ in range(40):
        font = ImageFont.truetype(io.BytesIO(ttf), int(round(size)))
        width = text_width(font, CAPTION, size * LETTER_SPACING_EM)
        if abs(width - target) < 1.0:
            break
        size *= target / width
    size = int(round(size))
    font = ImageFont.truetype(io.BytesIO(ttf), size)
    tracking = size * LETTER_SPACING_EM

    missing = [c for c in CAPTION if font.getmask(c).getbbox() is None and c != " "]
    if missing:
        print(f"font has no glyph for: {missing!r}", file=sys.stderr)
        return 1

    # Measure the INK, not the line box. A font's ascent and descent are sized
    # for text that has to sit on a baseline next to other text; this caption
    # sits alone under a logo, so leading above and below it is just a gap that
    # shifts the mark off centre.
    probe = Image.new("L", (int(target * 1.3), size * 3), 0)
    pd = ImageDraw.Draw(probe)
    x = 0.0
    for ch in CAPTION:
        pd.text((x, size), ch, font=font, fill=255, anchor="ls")
        x += font.getlength(ch) + tracking
    box = probe.getbbox()
    cap_w, cap_h = box[2] - box[0], box[3] - box[1]

    mark = Image.open(MARK_SRC).convert("RGBA")
    mark_h = round(WIDTH * mark.height / mark.width)
    mark = mark.resize((WIDTH, mark_h), Image.LANCZOS)

    gap = round(size * 0.62)
    stamp = Image.new("RGBA", (WIDTH, mark_h + gap + cap_h), (0, 0, 0, 0))
    stamp.paste(mark, (0, 0), mark)

    caption = Image.new("RGBA", (cap_w, cap_h), (0, 0, 0, 0))
    cd = ImageDraw.Draw(caption)
    x = -box[0]
    for ch in CAPTION:
        cd.text((x, size - box[1]), ch, font=font, fill=CAPTION_FILL, anchor="ls")
        x += font.getlength(ch) + tracking
    stamp.alpha_composite(caption, ((WIDTH - cap_w) // 2, mark_h + gap))

    stamp.save(OUT_PNG, optimize=True)
    stamp.save(OUT_WEBP, quality=94, method=6)

    print(f"caption {size}px, tracking {tracking:.1f}px, ink {cap_w}x{cap_h}")
    print(f"stamp   {stamp.width}x{stamp.height}  (aspect {stamp.width / stamp.height:.3f})")
    for p in (OUT_PNG, OUT_WEBP):
        print(f"  {os.path.relpath(p, ROOT)}  {os.path.getsize(p) / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
