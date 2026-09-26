# -*- coding: utf-8 -*-
"""量化截图与素材亮度，判断「值班室太暗」和「突脸看不清」到底是光源问题还是素材问题。"""
import os, io
from PIL import Image, ImageStat

ROOT = os.path.dirname(os.path.abspath(__file__))
SHOT = os.path.join(ROOT, "outputs", "midnight-projectionist", "screenshots")
AE   = os.path.join(ROOT, "_assets")
BUILD= os.path.join(ROOT, "_assets", "build")

def stat(p, label):
    im = Image.open(p).convert("L")
    s = ImageStat.Stat(im)
    # 中位亮度更能反映「大部分像素有多暗」
    h = im.histogram()
    tot = sum(h); acc = 0; med = 0
    for v, c in enumerate(h):
        acc += c
        if acc >= tot / 2: med = v; break
    # 可读率：亮度 > 40 的像素占比。比中位数更能回答「这房间能不能走动」。
    lit = sum(h[41:]) / tot * 100
    w, hh = im.size
    # 中心 40% 区域（突脸的脸应该在这儿）
    box = (int(w*.3), int(hh*.3), int(w*.7), int(hh*.7))
    cs = ImageStat.Stat(im.crop(box))
    print("%-26s %4dx%-4d mean=%6.1f median=%3d  可读率=%5.1f%%  中心 mean=%6.1f max=%3d" %
          (label, w, hh, s.mean[0], med, lit, cs.mean[0], im.crop(box).getextrema()[1]))

print("=== 截图 ===")
for n in ["b01-control-room", "b02-her-at-door", "b03-six-rooms", "b04-six-rooms-black",
          "b05-fear-closeup", "b06-siege-in-room", "b07-five-projectors",
          "a01-hall", "a03-her"]:
    p = os.path.join(SHOT, n + ".png")
    if os.path.exists(p): stat(p, n)
    else: print("%-26s (缺)" % n)

print()
print("=== 突脸素材 ===")
for n in ["face.jpg", "fear1.jpg", "fear2.jpg", "fear3.jpg", "fear4.jpg"]:
    p = os.path.join(BUILD, n)
    if not os.path.exists(p): p = os.path.join(AE, n)
    if os.path.exists(p): stat(p, n)
    else: print("%-26s (缺)" % n)
