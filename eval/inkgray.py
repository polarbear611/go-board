#!/usr/bin/env python3
"""照片 → 灰度，顺手擦掉红笔批改。

孩子做过的书页上有红笔画的长弧线，常常**跨过两个棋盘图之间的空白**。
背景扣除只看明暗，会把它当墨迹，于是相邻两图被连成一个连通块，
`slice_page.py` 找不到 6 个大小相近的块，整页切不开（实测 p30 就是这样）。
落在棋盘里的笔画还会被 `read_tile.py` 误判成子。

**不能靠亮度滤掉**：实测这支笔并不浅——红笔 L≈89，纸面 L≈211，黑印刷 L≈48，
红笔与纸面的反差有 122，远超墨迹阈值。取红通道也只把反差压到 81，照样过阈。

按**饱和度**才分得开：红笔 R−max(G,B) ≈ 47，黑印刷 ≈ 0–12（灰的，三通道齐平），
纸面也接近 0。所以判据是「彩色」而不是「深浅」，把彩色像素就地填成纸面色。

代价：铅笔写的手数标记是石墨、不带颜色，擦不掉。它们通常很小，
真压在交叉点上时仍可能被读成子——所以对照图还是得逐题看。
"""
from PIL import Image, ImageChops, ImageFilter

SAT = 30      # R−max(G,B) 超过它就算彩色批改；黑印刷实测 0–12，留足余量
GROW = 5      # 笔画边缘有一圈过渡像素，膨胀一点一起擦掉


def paper_level(gray):
    """纸面灰度：取直方图的 90 分位，比固定常数更抗整页偏暗/偏亮。"""
    h = gray.histogram()
    total = sum(h)
    acc = 0
    for v, c in enumerate(h):
        acc += c
        if acc >= total * 0.90:
            return v
    return 235


def to_gray(im, sat=SAT, grow=GROW):
    """RGB/L 图 → L 图；RGB 时先把彩色笔迹填成纸面色。"""
    if im.mode == "L":
        return im
    im = im.convert("RGB")
    r, g, b = im.split()
    gray = im.convert("L")
    # R − max(G,B)；PIL 的 subtract 自带下截 0，负值不会绕回
    colored = ImageChops.subtract(r, ImageChops.lighter(g, b))
    mask = colored.point(lambda v: 255 if v > sat else 0)
    if grow > 1:
        mask = mask.filter(ImageFilter.MaxFilter(grow))
    return Image.composite(Image.new("L", im.size, paper_level(gray)), gray, mask)


if __name__ == "__main__":
    import sys
    from PIL import ImageOps
    src, dst = sys.argv[1], sys.argv[2]
    to_gray(ImageOps.exif_transpose(Image.open(src))).save(dst)
    print(dst)
