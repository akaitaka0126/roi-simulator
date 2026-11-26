# -*- coding: utf-8 -*-
"""アプリアイコン（沖縄の海の色 + 右肩上がりの棒 + ROI）を icons/ に作る。
実行: python tools/make_icons.py   （Pillow が必要: pip install pillow）
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")
os.makedirs(OUT, exist_ok=True)
FONT_CANDIDATES = [r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\segoeuib.ttf",
                   "/System/Library/Fonts/Helvetica.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]

STOPS = [(0.00, (143, 205, 238)), (0.34, (196, 233, 247)), (0.345, (10, 74, 132)),
         (0.55, (14, 106, 166)), (0.78, (37, 188, 200)), (1.00, (109, 220, 207))]


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size):
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
            if t0 <= t <= t1:
                d.line([(0, y), (size, y)], fill=lerp(c0, c1, (t - t0) / max(t1 - t0, 1e-9)))
                break
    return img


def font(px):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return ImageFont.truetype(p, px)
    return ImageFont.load_default()


def draw_mark(img, box):
    """box=(x0,y0,x1,y1) の中に、白い右肩上がりの棒 3 本と ROI の文字を描く"""
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    base = y0 + h * 0.60
    bw = w * 0.17
    gap = w * 0.085
    heights = [0.20, 0.33, 0.48]
    left = x0 + (w - (bw * 3 + gap * 2)) / 2
    for i, bh in enumerate(heights):
        bx = left + i * (bw + gap)
        d.rounded_rectangle([bx, base - h * bh, bx + bw, base], radius=bw * 0.18, fill=(255, 255, 255))
    f = font(int(h * 0.25))
    text = "ROI"
    tb = d.textbbox((0, 0), text, font=f)
    tx = x0 + (w - (tb[2] - tb[0])) / 2 - tb[0]
    ty = base + h * 0.07 - tb[1]
    d.text((tx, ty), text, font=f, fill=(255, 255, 255))


def icon(size, pad_ratio):
    scale = 4
    big = gradient(size * scale)
    p = size * scale * pad_ratio
    draw_mark(big, (p, p, size * scale - p, size * scale - p))
    return big.resize((size, size), Image.LANCZOS)


def rounded(img, radius_ratio=0.22):
    s = img.size[0]
    mask = Image.new("L", (s * 4, s * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s * 4 - 1, s * 4 - 1], radius=int(s * 4 * radius_ratio), fill=255)
    mask = mask.resize((s, s), Image.LANCZOS)
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


rounded(icon(192, 0.16)).save(os.path.join(OUT, "icon-192.png"), optimize=True)
rounded(icon(512, 0.16)).save(os.path.join(OUT, "icon-512.png"), optimize=True)
icon(512, 0.24).save(os.path.join(OUT, "icon-maskable-512.png"), optimize=True)   # 端が丸く切られても欠けない余白
icon(180, 0.14).save(os.path.join(OUT, "apple-touch-icon.png"), optimize=True)    # iOS は自分で角を丸める
icon(32, 0.10).save(os.path.join(OUT, "favicon-32.png"), optimize=True)
for f in sorted(os.listdir(OUT)):
    print(f, os.path.getsize(os.path.join(OUT, f)), "bytes")
