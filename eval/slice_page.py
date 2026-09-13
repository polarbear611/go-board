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
from inkgray import to_gray

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


def ink_mask(im, scale_w=SCALE_W, grow=3):
    # to_gray 而不是 convert("L")：做过的书页上有红笔弧线，常跨过两图之间的
    # 空白把它们连成一个连通块，于是 6 个图变成 5 个，整页切不开。见 inkgray.py。
    g = to_gray(im)
    ratio = scale_w / g.width
    g = g.resize((scale_w, round(g.height * ratio)), Image.LANCZOS)
    ink = ImageChops.subtract(g.filter(ImageFilter.GaussianBlur(12)), g)
    b = ink.point(lambda v: 255 if v > DELTA else 0).filter(ImageFilter.MaxFilter(grow))
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


# 膨胀档位。书页拱得厉害或光偏暗时，细网格线只有一部分过得了 DELTA，
# 于是一个棋盘图的墨迹被打成虚线、裂成左右两块，`_pick_six` 就凑不齐 6 个。
# 加大膨胀能把这些断口接上；相邻两图之间的空白在 400px 分析图上有 30 px 左右，
# 膨胀到 7（每边长 3 px）也还差得远，不会把两图粘成一块。
# 默认仍是 3 —— 已验证过的那批照片在 3 上的结果与改动前逐字节一致，别动它的默认值。
GROWS = (3, 5, 7)


def find_diagrams(im, _depth=0):
    for grow in GROWS:
        mask, (w, h), ratio, ink = ink_mask(im, grow=grow)
        cands = components(mask, w, h, int(w * h * 0.002))
        # 长条形的（页眉灰底、桌面边缘、装订线）不可能是棋盘图
        cands = [c for c in cands
                 if c[3] > c[1] and 0.5 < (c[2]-c[0]) / (c[3]-c[1]) < 2.8]
        sel, nc, nr = _pick_six(cands)
        if sel is not None:
            break
    if sel is None:
        raise SystemExit("没能在照片里认出 6 个棋盘图——"
                         "检查是否整页入镜、有无过强阴影或反光")

    if (nc, nr) == (3, 2):                      # 照片是横的
        if _depth:
            raise SystemExit("方向判定反复失败，请检查照片")
        return find_diagrams(im.rotate(-90, expand=True), _depth + 1)

    boxes = sorted(sel, key=lambda b: b[1])
    rows = [sorted(boxes[i:i+2], key=lambda b: b[0]) for i in (0, 2, 4)]
    boxes = [list(b[:4]) for row in rows for b in row]

    # 同一页上 6 个图**尺寸相同、排成规整的 2 列 x 3 行**，可以拿健康的块
    # 把残缺的块量回来。
    #
    # 需要它是因为：书页拱起 + 阴影时，某个图下半部分的细线过不了 DELTA，
    # 连通块在中途断掉，外接矩形短了一大截（实测 p32 的第 179 题只剩 739px，
    # 同页其余五块都是 1100 上下）。切出来的图缺了最下面两行，read_tile 照样
    # 能在残图上定出网格、给出一个**看着很正常但整体错位**的结果——比切不开
    # 更难发现。`_pick_six` 的 0.55 面积一致性检查拦不住这种程度的残缺。
    #
    # **只动明显残缺的那一块**（不足同伴/中位数的 0.85）。早先试过按行列取并集
    # 统一尺寸，结果把健康的块也撑大了，边上带进隔壁图的一角，read_tile 锁错网格、
    # 整题读串（实测第 275 题全盘对不上）。宁可少修，不要误伤。
    # 先按**原始**外接矩形算出行、列之间的分界线（相邻两块空白的中点）。
    # 必须在修复之前算：修复会撑大矩形，拿修复后的结果再算分界线就没意义了。
    ybound = [(max(boxes[i][3], boxes[i+1][3]) + min(boxes[i+2][1], boxes[i+3][1])) / 2
              for i in (0, 2)]
    # 最底下一行没有下邻居，夹不住 —— 但页脚（「日期／得分／签名」那张表）就在下面，
    # 它的横线会被 read_tile 当成棋盘行，整题往上错几行（实测第 161 题错 2 行）。
    # 拿上面两个行间距的中位数往下量一格当边界：间距是版式定的，比固定倍数可靠。
    gaps = [min(boxes[i+2][1], boxes[i+3][1]) - max(boxes[i][3], boxes[i+1][3]) for i in (0, 2)]
    # 取**半个**行间距：上面两条边界都是空白的中点，这条也照做才一致。
    # 整格往下量还是会够到页脚表格的横线（实测第 168 题仍错 2 行）。
    # 代价是「第 N 题」那行字常常被切掉——对照图标题里有题号，不靠它。
    ybound.append(max(boxes[4][3], boxes[5][3]) + sorted(gaps)[len(gaps)//2] / 2)
    xbound = (max(boxes[j][2] for j in (0, 2, 4)) + min(boxes[j][0] for j in (1, 3, 5))) / 2

    SHORT = 0.85
    for i in (0, 2, 4):                                  # 行内两块比高度
        a, b = boxes[i], boxes[i+1]
        ha, hb = a[3]-a[1], b[3]-b[1]
        if ha < SHORT * hb:   a[1], a[3] = b[1], b[3]
        elif hb < SHORT * ha: b[1], b[3] = a[1], a[3]
    ws = sorted(b[2]-b[0] for b in boxes)
    wmid = (ws[2] + ws[3]) / 2                           # 6 块宽度的中位数
    for j in (0, 1):                                     # 列内三块比宽度
        col = [boxes[j], boxes[j+2], boxes[j+4]]
        ok = [b for b in col if b[2]-b[0] >= SHORT * wmid]
        if not ok:
            continue
        x0 = min(b[0] for b in ok); x1 = max(b[2] for b in ok)
        for b in col:
            if b[2]-b[0] < SHORT * wmid:
                b[0], b[2] = x0, x1

    # 夹回各自的行列格子：两个图之间必有空白，切图越过分界线就一定是吃进了
    # 隔壁的图。实测第 157 题就是这样——它的矩形被同行的第 158 题量大了，
    # 底下带进了下一行那个图的网格，read_tile 把那片网格当成本图的下半部分，
    # 整题往上错了 3 行。错得很"自洽"，不比对照图根本看不出来。
    for k, b in enumerate(boxes):
        r, c = k // 2, k % 2
        if r > 0: b[1] = max(b[1], ybound[r-1])
        if r < 2: b[3] = min(b[3], ybound[r])
        if c == 0: b[2] = min(b[2], xbound)
        else:      b[0] = max(b[0], xbound)

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

    return boxes, ratio, im, (ybound, xbound)


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    src, first = sys.argv[1], int(sys.argv[2])
    outdir = sys.argv[3] if len(sys.argv) > 3 else "eval/tiles"
    os.makedirs(outdir, exist_ok=True)

    im = ImageOps.exif_transpose(Image.open(src))   # 手机照片带方向标记，先按它转
    boxes, ratio, im, (ybound, xbound) = find_diagrams(im)   # 再按版式二次校正
    W, H = im.size
    for i, (x0, y0, x1, y1) in enumerate(boxes):
        bw, bh = (x1 - x0) / ratio, (y1 - y0) / ratio
        cx0 = max(0, int(x0 / ratio - bw * PAD))
        cy0 = max(0, int(y0 / ratio - bh * PAD))
        cx1 = min(W, int(x1 / ratio + bw * PAD))
        cy1 = min(H, int(y1 / ratio + bh * PAD * 2.2))   # 下方多留些，带上题号

        # 外扩之后再夹一次：下方那 2.2 倍留白本是为了带上「第 N 题」的字样，
        # 但这本书的三行排得比死活册紧，留白会一路伸进下一行那个图的网格里。
        # read_tile 顺着多出来的线把最底下一条当成棋盘下边缘，整题往上错几行 ——
        # 错得很自洽，不比对照图根本看不出来（实测第 157 题错了 3 行）。
        # 夹到图间空白就停；底下一行没有邻居，题号照样带得上。
        r, c = i // 2, i % 2
        if r > 0: cy0 = max(cy0, int(ybound[r-1] / ratio))
        cy1 = min(cy1, int(ybound[r] / ratio))      # r==2 用的是上面外推出来的那条
        if c == 0: cx1 = min(cx1, int(xbound / ratio))
        else:      cx0 = max(cx0, int(xbound / ratio))

        no = first + i
        im.crop((cx0, cy0, cx1, cy1)).save(f"{outdir}/q{no}.png")
        print(f"q{no}.png  {cx1-cx0}x{cy1-cy0}")


if __name__ == "__main__":
    main()
