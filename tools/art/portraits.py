"""Split a 3x2 portrait sheet (1536x1024, equal cells) into six 192x224 webp portraits.
Usage: python tools/art/portraits.py SHEET PREFIX OUTDIR   e.g. ... bo-portraits-m-src.png m apps/manager/public/portraits
Each cell is trimmed by a small margin (the grid line), then cover-cropped to 6:7 around the face (upper-middle)."""
import sys
from PIL import Image

sheet, prefix, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
W, H = 192, 224
im = Image.open(sheet).convert('RGB')
cols, rows = 3, 2
cw, ch = im.width / cols, im.height / rows
margin = 6
n = 0
for r in range(rows):
    for c in range(cols):
        n += 1
        cell = im.crop((round(c * cw + margin), round(r * ch + margin), round((c + 1) * cw - margin), round((r + 1) * ch - margin)))
        sw, sh = cell.size
        scale = max(W / sw, H / sh)
        bw, bh = W / scale, H / scale
        fx, fy = 0.5, 0.46  # faces sit a little above centre in these busts
        left = min(max(0, sw * fx - bw / 2), sw - bw); top = min(max(0, sh * fy - bh / 2), sh - bh)
        out = cell.crop((round(left), round(top), round(left + bw), round(top + bh))).resize((W, H), Image.LANCZOS)
        out.save(f'{outdir}/{prefix}-{n}.webp', quality=84, method=6)
        print(f'{outdir}/{prefix}-{n}.webp', out.size)
