#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""アプリアイコンを1ソースから全サイズ書き出す。
    python3 scripts/make-icons.py

デザイン: ネイビー地に「合格スタンプ」+「生成AI パスポート」。
試験名の「パスポート」を入国スタンプに見立てたもの。競合は文字を敷き詰めた
四角ばかりなので、円形とオレンジで検索結果での識別性を稼ぐ狙い。

出力:
  icons/appstore-1024.png                  App Store用(アルファなし・角丸なし)
  icons/icon-192.png / icon-512.png        PWA用
  icons/icon-maskable-512.png              PWA maskable用(中央80%に収める)
  icons/apple-touch-icon.png               180px
  ios/.../AppIcon.appiconset/AppIcon-512@2x.png   Xcode用(1024)
"""
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, 'icons')
APPICON = os.path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset')

NAVY, ORANGE, WHITE = (11, 46, 58), (232, 121, 47), (255, 255, 255)
JP = '/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc'
LATIN = '/System/Library/Fonts/HelveticaNeue.ttc'


def fit_font(path, text, max_w, start, index=None):
    """text が max_w に収まる最大サイズのフォントを返す"""
    size = start
    while size > 8:
        f = ImageFont.truetype(path, size) if index is None else ImageFont.truetype(path, size, index=index)
        if f.getbbox(text)[2] - f.getbbox(text)[0] <= max_w:
            return f
        size -= 4
    return f


def stamp(canvas, cx, cy, r, tilt=-12):
    """回転させた合格スタンプを透過レイヤーで返す。
    円と文字を4倍解像度で描いてから縮小し、回転時のジャギを抑える。"""
    SS = 4
    L = Image.new('RGBA', (canvas * SS, canvas * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(L)
    CX, CY, R = cx * SS, cy * SS, r * SS
    d.ellipse([CX - R, CY - R, CX + R, CY + R], fill=ORANGE + (255,))
    ring = int(R * 0.845)
    d.ellipse([CX - ring, CY - ring, CX + ring, CY + ring], outline=NAVY + (255,), width=int(R * 0.05))
    # AIは内側のリングに触れないよう少し小さめに置く
    d.text((CX, CY), 'AI', font=ImageFont.truetype(LATIN, int(R * 0.85), index=1),
           fill=NAVY + (255,), anchor='mm')
    L = L.rotate(tilt, resample=Image.BICUBIC, center=(CX, CY))
    return L.resize((canvas, canvas), Image.LANCZOS)


def build(canvas=1024, scale=1.0):
    """scale<1 で全体を縮めて余白を増やす(maskable用)"""
    im = Image.new('RGB', (canvas, canvas), NAVY)
    u = canvas / 1024 * scale
    cx = canvas // 2

    r = int(242 * u)
    st = stamp(canvas, cx, int(canvas / 2 - 154 * u), r)
    im.paste(st, (0, 0), st)

    d = ImageDraw.Draw(im)
    # 左右に十分な余白を残す。文字が角丸マスクに削られないため
    max_w = int(canvas * 0.74 * scale)
    f1 = fit_font(JP, '生成AI', max_w, int(160 * u))
    f2 = fit_font(JP, 'パスポート', max_w, int(160 * u))
    d.text((cx, int(canvas / 2 + 206 * u)), '生成AI', font=f1, fill=WHITE, anchor='mm')
    d.text((cx, int(canvas / 2 + 344 * u)), 'パスポート', font=f2, fill=WHITE, anchor='mm')
    return im


def save(img, path, size):
    out = img.resize((size, size), Image.LANCZOS).convert('RGB')  # アルファを持たせない
    out.save(path, 'PNG')
    print(f'  {os.path.relpath(path, ROOT)}  ({size}px)')


if __name__ == '__main__':
    base = build()
    print('書き出し:')
    save(base, os.path.join(ICONS, 'appstore-1024.png'), 1024)
    save(base, os.path.join(ICONS, 'icon-512.png'), 512)
    save(base, os.path.join(ICONS, 'icon-192.png'), 192)
    save(base, os.path.join(ICONS, 'apple-touch-icon.png'), 180)
    # maskableは中央80%だけが必ず見える前提なので、全体を縮めて余白を足す
    save(build(scale=0.74), os.path.join(ICONS, 'icon-maskable-512.png'), 512)
    save(base, os.path.join(APPICON, 'AppIcon-512@2x.png'), 1024)
