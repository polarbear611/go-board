#!/usr/bin/env python3
"""把一页书的手机照片切成单题图。

用法: python3 eval/slice_page.py <照片> <起始题号> [输出目录]

书页版式固定是 3 行 x 2 列共 6 道题，但每次拍的取景、距离、方向都不一样，
所以既不写死裁剪框，也不假设方向：先找出 6 个棋盘图，再由它们的排布
反推方向。

两个关键处理：

**背景扣除**——先把灰度图重度高斯模糊当作纸面本身的明暗，再用它减原图，
得到「比周围暗多少」。手机照片的阴影渐变和书脊暗带都是低频的，会被一起
减掉；直接用全局阈值二值化则会把整个偏暗的下半页连成一块，6 个图糊成
1 个（实测如此）。副作用是背面透印的淡灰棋子对比度太低，也一并被滤掉。

**不设绝对尺寸门槛**——退远了拍时页面只占画面一小块，按「宽度占全图
比例」筛会一个都筛不到（实测如此）。改成找 6 个彼此大小相近、且排成
2 列 x 3 行点阵的连通块。若排成 3 列 x 2 行，说明照片是横的，转正后重来。
"""
import sys, os
from collections import deque
from PIL import Image, ImageOps, ImageFilter, ImageChops

SCALE_W = 400     # 分析用缩略图宽度；只用来定位，裁剪仍在原图上做
DELTA   = 24      # 判为墨迹的最小局部反差
PAD     = 0.06    # 外接矩形外扩比例


def components(mask, w, h, min_area):
    """4 邻接连通域 -> [(x0, y0, x1, y1, area)]"""
    seen = bytearray(w * h)
    out = []
    for s in range(w * h):
        if mask[s] and not seen[s]:
            q = deque([s]); seen[s] = 1
            x0 = x1 = s % w; y0 = y1 = s // w; area = 0
            while q:
                p = q.popleft(); area += 1
                x, y = p % w, p // w
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
                for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        n = ny * w + nx
                        if mask[n] and not seen[n]:
                            seen[n] = 1; q.append(n)
            if area >= min_area:
                out.append((x0, y0, x1, y1, area))
    return out


def ink_mask(im, scale_w=SCALE_W):
    g = im.convert("L")
    ratio = scale_w / g.width
    g = g.resize((scale_w, round(g.height * ratio)), Image.LANCZOS)
    ink = ImageChops.subtract(g.filter(ImageFilter.GaussianBlur(12)), g)
    b = ink.point(lambda v: 255 if v > DELTA else 0).filter(ImageFilter.MaxFilter(3))
    return bytes(1 if v > 127 else 0 for v in b.tobytes()), b.size, ratio, ink


def _clusters(vals, tol):
    """把一维坐标按 tol 容差归并，返回簇的个数。"""
    vs = sorted(vals); n = 1
    for a, b in zip(vs, vs[1:]):
        if b - a > tol:
            n += 1
    return n


def _pick_six(cands):
    """取最大的 6 个块，校验大小一致 + 排成矩形点阵。返回 (boxes, ncol, nrow)。"""
    area = lambda c: (c[2] - c[0]) * (c[3] - c[1])
    sel = sorted(cands, key=lambda c: -area(c))[:6]
    if len(sel) < 6:
        return None, 0, 0
    # 同一页上 6 个图大小接近；差太多说明混进了页眉插画或桌面杂物
    if area(sel[5]) < 0.55 * area(sel[0]):
        return None, 0, 0
    bw = sorted((c[2] - c[0]) for c in sel)[3]
    bh = sorted((c[3] - c[1]) for c in sel)[3]
    nc = _clusters([(c[0] + c[2]) / 2 for c in sel], bw * 0.45)
    nr = _clusters([(c[1] + c[3]) / 2 for c in sel], bh * 0.45)
    if {nc, nr} != {2, 3}:
        return None, 0, 0
    return sel, nc, nr


def find_diagrams(im, _depth=0):
    mask, (w, h), ratio, ink = ink_mask(im)
    cands = components(mask, w, h, int(w * h * 0.002))
    # 长条形的（页眉灰底、桌面边缘、装订线）不可能是棋盘图
    cands = [c for c in cands
             if c[3] > c[1] and 0.5 < (c[2]-c[0]) / (c[3]-c[1]) < 2.8]
    sel, nc, nr = _pick_six(cands)
    if sel is None:
        raise SystemExit("没能在照片里认出 6 个棋盘图——"
                         "检查是否整页入镜、有无过强阴影或反光")

    if (nc, nr) == (3, 2):                      # 照片是横的
        if _depth:
            raise SystemExit("方向判定反复失败，请检查照片")
        return find_diagrams(im.rotate(-90, expand=True), _depth + 1)

    boxes = sorted(sel, key=lambda b: b[1])
    rows = [sorted(boxes[i:i+2], key=lambda b: b[0]) for i in (0, 2, 4)]
    boxes = [b[:4] for row in rows for b in row]

    # 页眉（灰底讲解块 + 插画）墨迹密度远高于页脚留白；若反了说明上下颠倒。
    # 只在棋盘图所占的横向范围内比较，避免把画面里的桌面算进去。
    top = min(b[1] for b in boxes)
    bot = max(b[3] for b in boxes)
    lx, rx = min(b[0] for b in boxes), max(b[2] for b in boxes)
    px = ink.tobytes()
    def dens(y0, y1):
        if y1 - y0 < 3:
            return 0.0
        total = sum(sum(px[y * w + lx: y * w + rx]) for y in range(y0, y1))
        return total / ((y1 - y0) * max(1, rx - lx))
    if dens(0, top) * 1.5 < dens(min(h, bot), h):
        if _depth > 1:
            raise SystemExit("方向判定反复失败，请检查照片")
        return find_diagrams(im.rotate(180, expand=True), _depth + 2)

    return boxes, ratio, im


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    src, first = sys.argv[1], int(sys.argv[2])
    outdir = sys.argv[3] if len(sys.argv) > 3 else "eval/tiles"
    os.makedirs(outdir, exist_ok=True)

    im = ImageOps.exif_transpose(Image.open(src))   # 手机照片带方向标记，先按它转
    boxes, ratio, im = find_diagrams(im)            # 再按版式二次校正
    W, H = im.size
    for i, (x0, y0, x1, y1) in enumerate(boxes):
        bw, bh = (x1 - x0) / ratio, (y1 - y0) / ratio
        cx0 = max(0, int(x0 / ratio - bw * PAD))
        cy0 = max(0, int(y0 / ratio - bh * PAD))
        cx1 = min(W, int(x1 / ratio + bw * PAD))
        cy1 = min(H, int(y1 / ratio + bh * PAD * 2.2))   # 下方多留些，带上题号
        no = first + i
        im.crop((cx0, cy0, cx1, cy1)).save(f"{outdir}/q{no}.png")
        print(f"q{no}.png  {cx1-cx0}x{cy1-cy0}")


if __name__ == "__main__":
    main()
