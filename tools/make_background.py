# -*- coding: utf-8 -*-
"""背景画像（沖縄の海・人物なし）を img/okinawa-sea.svg に描く。
空 → 水平線と遠い島 → 深い青 → エメラルドのリーフ → 白い砂浜。乱数は固定なので毎回同じ絵になる。
実行: python tools/make_background.py
"""
import os
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "img", "okinawa-sea.svg")
W, H = 900, 1600
HORIZON = 250
SHORE = 1330
rnd = random.Random(20261127)

parts = []
add = parts.append

add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">')
add("""<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#8fcdee"/><stop offset=".6" stop-color="#c4e9f7"/><stop offset="1" stop-color="#eaf8fc"/>
</linearGradient>
<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#0a4a84"/><stop offset=".18" stop-color="#0e6aa6"/><stop offset=".40" stop-color="#1596c0"/>
  <stop offset=".60" stop-color="#25bcc8"/><stop offset=".80" stop-color="#6ddccf"/><stop offset="1" stop-color="#bff0e2"/>
</linearGradient>
<linearGradient id="sand" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#efe6cf"/><stop offset=".25" stop-color="#f7f1e2"/><stop offset="1" stop-color="#fbf8ef"/>
</linearGradient>
<radialGradient id="sun" cx=".78" cy=".08" r=".55">
  <stop offset="0" stop-color="#ffffff" stop-opacity=".75"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</radialGradient>
<filter id="soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
<filter id="reef" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>""")

# 空と日差し
add(f'<rect width="{W}" height="{HORIZON + 2}" fill="url(#sky)"/>')
add(f'<rect width="{W}" height="{HORIZON}" fill="url(#sun)"/>')

# 水平線近くの夏の雲
clouds = []
for _ in range(9):
    cx = rnd.uniform(-40, W + 40)
    cy = rnd.uniform(HORIZON - 70, HORIZON - 18)
    for _ in range(rnd.randint(3, 5)):
        clouds.append(f'<ellipse cx="{cx + rnd.uniform(-55, 55):.0f}" cy="{cy + rnd.uniform(-14, 8):.0f}" '
                      f'rx="{rnd.uniform(30, 70):.0f}" ry="{rnd.uniform(12, 26):.0f}"/>')
add('<g fill="#ffffff" opacity=".85" filter="url(#soft)">' + "".join(clouds) + "</g>")
add('<g fill="#ffffff" opacity=".5" filter="url(#soft)">'
    '<ellipse cx="180" cy="120" rx="120" ry="16"/><ellipse cx="640" cy="80" rx="150" ry="14"/></g>')

# 遠くの島（低い平らな島影）
add(f'<path d="M30 {HORIZON} C60 {HORIZON-6} 90 {HORIZON-12} 130 {HORIZON-13} C170 {HORIZON-14} 200 {HORIZON-9} 240 {HORIZON-10} '
    f'C270 {HORIZON-11} 290 {HORIZON-5} 320 {HORIZON} Z" fill="#5f8f93" opacity=".55"/>')
add(f'<path d="M700 {HORIZON} C720 {HORIZON-5} 760 {HORIZON-7} 800 {HORIZON-6} C830 {HORIZON-5} 850 {HORIZON-2} 870 {HORIZON} Z" '
    f'fill="#6e9b9c" opacity=".4"/>')

# 海
add(f'<rect y="{HORIZON}" width="{W}" height="{SHORE - HORIZON + 40}" fill="url(#sea)"/>')
add(f'<rect y="{HORIZON}" width="{W}" height="1.5" fill="#ffffff" opacity=".55"/>')

# サンゴ礁の濃い影（エメラルドの中の青い斑）
reefs = []
for _ in range(14):
    y = rnd.uniform(HORIZON + 380, SHORE - 160)
    reefs.append(f'<ellipse cx="{rnd.uniform(0, W):.0f}" cy="{y:.0f}" rx="{rnd.uniform(60, 150):.0f}" ry="{rnd.uniform(14, 34):.0f}"/>')
add('<g fill="#0d6f93" opacity=".28" filter="url(#reef)">' + "".join(reefs) + "</g>")

# リーフの縁に立つ白波
add(f'<path d="M0 {HORIZON+300} C150 {HORIZON+292} 300 {HORIZON+306} 450 {HORIZON+298} C600 {HORIZON+290} 750 {HORIZON+304} 900 {HORIZON+296}" '
    f'stroke="#ffffff" stroke-width="2.5" fill="none" opacity=".45" filter="url(#soft)"/>')

# 日差しのきらめき（深い所ほど細かく、浅い所は少なく）
glints = []
for _ in range(120):
    y = HORIZON + abs(rnd.gauss(0, 260)) + 6
    if y > SHORE - 60:
        continue
    depth = (y - HORIZON) / (SHORE - HORIZON)
    w = rnd.uniform(6, 26) * (0.5 + depth * 1.6)
    glints.append(f'<rect x="{rnd.uniform(0, W):.0f}" y="{y:.0f}" width="{w:.0f}" height="{0.9 + depth * 1.6:.1f}" rx="1"'
                  f' opacity="{rnd.uniform(.25, .7) * (1 - depth * .6):.2f}"/>')
add('<g fill="#ffffff">' + "".join(glints) + "</g>")

# 浅瀬の波紋
for i, y in enumerate(range(SHORE - 210, SHORE - 30, 42)):
    off = (i % 2) * 70
    add(f'<path d="M{-60+off} {y} q75 -9 150 0 t150 0 t150 0 t150 0 t150 0 t150 0 t150 0" '
        f'stroke="#ffffff" stroke-width="1.4" fill="none" opacity="{0.18 + i * 0.05:.2f}"/>')

# 砂浜と波打ち際
edge = f"M0 {SHORE} C120 {SHORE-16} 230 {SHORE+14} 360 {SHORE} C480 {SHORE-14} 600 {SHORE+16} 720 {SHORE+2} C800 {SHORE-8} 860 {SHORE-4} 900 {SHORE}"
add(f'<path d="{edge} L900 {H} L0 {H} Z" fill="url(#sand)"/>')
add(f'<path d="{edge}" transform="translate(0 6)" stroke="#d9ccad" stroke-width="10" fill="none" opacity=".35"/>')
add(f'<path d="{edge}" stroke="#ffffff" stroke-width="7" fill="none" opacity=".95"/>')
add(f'<path d="{edge}" transform="translate(0 -12)" stroke="#ffffff" stroke-width="3" fill="none" opacity=".6"/>')

add("</svg>")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(parts) + "\n")
print(OUT, os.path.getsize(OUT), "bytes")
