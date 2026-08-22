"""Fit a generated image to the exact size a component expects (cover-crop + resize).

Usage: python tools/art/fit.py SRC DEST WIDTH HEIGHT [--focus fx,fy] [--quality N] [--crop l,t,r,b]
  --focus  where to keep when cropping, 0..1 in each axis (default 0.5,0.5 = centre)
  --crop   optional absolute pre-crop box in source pixels
ChatGPT returns 1024x1024 / 1536x1024 / 1024x1536; the app wants other ratios, so we
crop the longer axis around the focus point, then Lanczos-resize. PNG keeps alpha, JPG gets quality.
"""
import sys
from PIL import Image

def main(argv):
    src, dest, w, h = argv[0], argv[1], int(argv[2]), int(argv[3])
    fx = fy = 0.5; quality = 86; pre = None
    i = 4
    while i < len(argv):
        if argv[i] == '--focus': fx, fy = (float(v) for v in argv[i + 1].split(',')); i += 2
        elif argv[i] == '--quality': quality = int(argv[i + 1]); i += 2
        elif argv[i] == '--crop': pre = tuple(int(v) for v in argv[i + 1].split(',')); i += 2
        else: raise SystemExit('unknown arg ' + argv[i])
    im = Image.open(src)
    if pre: im = im.crop(pre)
    sw, sh = im.size
    scale = max(w / sw, h / sh)
    cw, ch = w / scale, h / scale  # crop box in source pixels
    left = min(max(0, sw * fx - cw / 2), sw - cw); top = min(max(0, sh * fy - ch / 2), sh - ch)
    im = im.crop((round(left), round(top), round(left + cw), round(top + ch))).resize((w, h), Image.LANCZOS)
    if dest.lower().endswith(('.jpg', '.jpeg')):
        im.convert('RGB').save(dest, quality=quality, optimize=True, progressive=True)
    else:
        im.save(dest, optimize=True)
    print(dest, im.size)

main(sys.argv[1:])
