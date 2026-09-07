#!/usr/bin/env python3
"""从单题切图里读出棋形（确定性图像处理，不调模型）。

用法: python3 eval/read_tile.py <切图...>          # 打印 JSON

书上的棋图是印刷线稿，规整、二值、无遮挡，用几何方法读比让模型猜可靠得多。
三步：

1. **背景扣除**：重度高斯模糊当纸面明暗，相减得局部反差。手机照片的
   阴影渐变、书脊暗带、以及背面透印的淡灰棋子，都是低对比的，一并滤掉。

2. **定网格**：棋子会盖住线，所以不在整幅图上找线——
   竖线只在**上部**找（题目都摆在角上，上半幅是空盘），
   横线只在**右部**找（同理，右半幅是空盘）。
   每条线再按 x = a*y + b 拟合，吸收拍照的旋转和梯形畸变；
   只按常数 x/y 处理的话，一幅图里最大能偏 30 多像素，
   而判定圆盘半径才 25 像素左右，直接错行。
   切图是贴着棋图外框裁的，所以**最左一条竖线就是 A 列，最下一条横线就是 1 路**。

3. **判子**：看交叉点内圈（半径 0.28 格）的墨迹占比。
   - 黑子：内圈几乎全黑
   - 空点：两条网格线穿过，占比小但不为零
   - 白子：白色圆盘把网格线盖掉了，内圈**干净得反常**
   星位那个小圆点面积占比只有百分之几，不影响。
"""
import sys, json
import numpy as np
from PIL import Image, ImageFilter

COLS = "ABCDEFGHJKLMNOPQRST"      # 跳过 I


def ink(path):
    im = Image.open(path).convert("L")
    g = np.asarray(im, dtype=np.float32)
    r = max(8, min(im.size) // 18)
    bg = np.asarray(im.filter(ImageFilter.GaussianBlur(r)), dtype=np.float32)
    return bg - g                  # 比周围暗多少


def peaks(profile, height, min_dist):
    """一维找峰：超过 height 的连续段取加权重心。"""
    out, i, n = [], 0, len(profile)
    while i < n:
        if profile[i] >= height:
            j = i
            while j < n and profile[j] >= height:
                j += 1
            seg = profile[i:j]
            c = (np.arange(i, j) * seg).sum() / seg.sum()
            if not out or c - out[-1] >= min_dist:
                out.append(c)
            elif seg.sum() > profile[int(out[-1])]:
                out[-1] = c
            i = j
        else:
            i += 1
    return np.array(out)


def shear_profile(B, lo, hi, slope, axis):
    """沿倾斜方向累加成一维剖面。

    照片总带几度旋转。直接按行/列累加的话，一条横线在取样宽度内会漂移十几个
    像素，峰被抹平——实测一幅图只剩 1 条横线能被认出来。这里先把每一列（行）
    按斜率回移再累加。
    """
    n = B.shape[0] if axis == 1 else B.shape[1]
    acc = np.zeros(n, dtype=np.float32)
    for t in range(lo, hi):
        v = B[:, t] if axis == 1 else B[t, :]
        s = int(round(slope * (t - lo)))
        if s > 0:
            acc[:n - s] += v[s:]
        elif s < 0:
            acc[-s:] += v[:n + s]
        else:
            acc += v
    return acc / (hi - lo)


def best_shear(B, lo, hi, axis):
    """扫一遍斜率，取剖面最"尖"的那个。

    剖面的总和与斜率无关，所以平方和最大就等于峰最锐利——不用先知道有几条线。
    """
    best, bp = 0.0, None
    for sl in np.linspace(-0.16, 0.16, 65):
        p = shear_profile(B, lo, hi, sl, axis)
        sc = float((p ** 2).sum())
        if bp is None or sc > bp:
            best, bp = float(sl), sc
    return best, shear_profile(B, lo, hi, best, axis)


def snap_comb(pos, cell, tol=0.28):
    """只保留落在同一等间距梳齿上的峰。

    一排挨着的白子，其圆弧的上下缘会连成一道横向暗带，被当成网格线插进来
    （实测 q227 就多认出一条，整个下半幅错一路）。真正的网格线是等间距的，
    而这种假线恰好落在两线之间，用周期性一筛就掉。
    """
    pos = np.asarray(pos, dtype=float)
    if len(pos) < 4:
        return pos
    best = None
    for p0 in pos:
        for per in np.linspace(cell * 0.88, cell * 1.12, 25):
            idx = np.round((pos - p0) / per)
            inl = np.abs(pos - (p0 + idx * per)) < per * tol
            if best is None or inl.sum() > best[0]:
                best = (int(inl.sum()), inl)
    return pos[best[1]]


def densify(pos, cell):
    """把检测到的线补全成完整的一排。

    棋子会把它压住的那几条线整段盖掉——实测有的题右半幅连丢两条横线。
    若直接按检出的顺序编号，缺一条整幅就错一路，最后表现为「漏 N 多 N」
    的整体位移。这里按间距除以格距四舍五入还原真实序号，再用二次拟合
    （吸收透视造成的疏密不均）把缺的位置插回来。
    """
    pos = np.asarray(pos, dtype=float)
    idx = np.zeros(len(pos))
    for i in range(1, len(pos)):
        idx[i] = idx[i - 1] + max(1, round((pos[i] - pos[i - 1]) / cell))
    deg = 2 if len(pos) >= 5 else 1
    c = np.polyfit(idx, pos, deg)
    return np.polyval(c, np.arange(idx[0], idx[-1] + 1))


def fit_lines(B, seeds, axis, span, cell, deg=1):
    """把每条线拟合成多项式，吸收旋转、梯形畸变和书页弯曲。

    axis=0 竖线（拟合 x = f(y)），axis=1 横线（拟合 y = f(x)）。
    seeds 是每条线的初始位置（常数或上一轮的多项式系数），
    span 是沿线取样的范围。
    """
    lim = B.shape[1] if axis == 0 else B.shape[0]
    half = max(3, int(cell * 0.28))
    out = []
    for sd in seeds:
        ts, vs = [], []
        for t in range(span[0], span[1], max(2, int(cell / 12))):
            c = float(np.polyval(sd, t))
            lo, hi = int(c) - half, int(c) + half + 1
            if lo < 0 or hi > lim:
                continue
            w = (B[t, lo:hi] if axis == 0 else B[lo:hi, t]).astype(np.float32)
            sm = w.sum()
            # 线是细的；一整段全黑说明这里是棋子，不能拿来定位
            if sm < 1 or sm > half:
                continue
            ts.append(t); vs.append(lo + (np.arange(len(w)) * w).sum() / sm)
        if len(ts) < deg + 5:
            out.append(np.atleast_1d(sd)); continue
        ts, vs = np.array(ts, float), np.array(vs, float)
        c = np.polyfit(ts, vs, deg)
        keep = np.abs(np.polyval(c, ts) - vs) < cell * 0.15   # 去掉被棋子带偏的点
        if keep.sum() >= deg + 5:
            c = np.polyfit(ts[keep], vs[keep], deg)
        out.append(c)
    return out


def shift_lines(B, lines, axis, span, cell, win=0.30):
    """斜率不动，只把每条线整体平移到实际墨迹上（中位数残差）。win 是搜索半径（格）。"""
    lim = B.shape[1] if axis == 0 else B.shape[0]
    half = max(3, int(cell * win))
    out = []
    for c in lines:
        res = []
        for t in range(span[0], span[1], max(2, int(cell / 12))):
            v0 = float(np.polyval(c, t))
            lo, hi = int(v0) - half, int(v0) + half + 1
            if lo < 0 or hi > lim:
                continue
            w = (B[t, lo:hi] if axis == 0 else B[lo:hi, t]).astype(np.float32)
            sm = w.sum()
            if sm < 1 or sm > half:      # 整段全黑 = 棋子，不能拿来定位
                continue
            res.append(lo + (np.arange(len(w)) * w).sum() / sm - v0)
        c = c.copy()
        if len(res) >= 8:
            c[-1] += float(np.median(res))
        out.append(c)
    return out


def refine_curve(B, lines, axis, span, cell, mode=0, win=0.30):
    """在共享斜率之上再拟合弯曲。

    书脊附近的页面是拱起来的，外框线肉眼可见地弯，纯直线跟不住。
    但让每条线各自拟合又太自由，会被棋子边缘带跑。折中：所有线共用同一条
    弯曲曲线，各自只有一个平移量。mode=1 再让弯度随线序号线性变化
    （页面像圆筒卷起时，越靠书脊那侧弯得越狠）。
    """
    lim = B.shape[1] if axis == 0 else B.shape[0]
    half = max(3, int(cell * win))
    T, Rs, J = [], [], []
    for j, c in enumerate(lines):
        for t in range(span[0], span[1], max(2, int(cell / 12))):
            v0 = float(np.polyval(c, t))
            lo, hi = int(v0) - half, int(v0) + half + 1
            if lo < 0 or hi > lim:
                continue
            w = (B[t, lo:hi] if axis == 0 else B[lo:hi, t]).astype(np.float32)
            sm = w.sum()
            if sm < 1 or sm > half:      # 整段全黑 = 棋子，不能拿来定位
                continue
            r = lo + (np.arange(len(w)) * w).sum() / sm - v0
            if abs(r) < cell * win:
                T.append(t); Rs.append(r); J.append(j)
    n = len(lines)
    if len(T) < 6 * n:
        return lines
    T, Rs, J = np.array(T, float), np.array(Rs), np.array(J)
    t0, sc = T.mean(), max(1.0, T.std())
    U = (T - t0) / sc
    Jn = (J / max(1, n - 1)) * 2 - 1
    cols = [U, U ** 2] + ([Jn * U, Jn * U ** 2] if mode else [])
    M = np.zeros((len(T), n + len(cols)))
    M[np.arange(len(T)), J] = 1
    for i, col in enumerate(cols):
        M[:, n + i] = col
    sol = np.linalg.lstsq(M, Rs, rcond=None)[0]
    inner = np.poly1d([1.0 / sc, -t0 / sc])
    out = []
    for j, c in enumerate(lines):
        jn = (j / max(1, n - 1)) * 2 - 1
        p1 = sol[n] + (sol[n + 2] * jn if mode else 0.0)
        p2 = sol[n + 1] + (sol[n + 3] * jn if mode else 0.0)
        # poly1d 复合会返回 poly1d，下一轮 shift_lines 的 .copy() 会挂，转回数组
        bend = np.asarray(np.poly1d([p2, p1, 0.0])(inner).coefficients, dtype=float)
        out.append(np.asarray(np.polyadd(c, np.polyadd(bend, [sol[j]])), dtype=float))
    return out


def track_lines(B, lines, axis, lo, hi, cell, nstrip=7):
    """把每条网格线沿着它自己实际的走向追出来。

    此前的做法是「全网格共用一个倾斜角 + 一条共用的弯曲曲线」。这在平摊的
    书页上够用，但页面拱起来时不成立：**同一条线在左右两端的斜率就不一样**，
    越靠书脊弯得越狠。用户复核 173 道题反馈的 327 处错里，273 处是
    「漏白子」且几乎全在最左三列——正是外推到左端后偏了半格、
    判定圆盘落到棋子外面。

    改成分段追踪：把棋图横向切成 nstrip 条，每条里各自把线定位一次，
    再拿这几个锚点拟合二次曲线。棋子盖住的那几条自动跳过，
    锚点少于 3 个就退回原线，不瞎猜。
    """
    lim = B.shape[1] if axis == 0 else B.shape[0]      # 垂直于线的方向
    along = B.shape[0] if axis == 0 else B.shape[1]    # 沿线方向
    lo, hi = max(0, int(lo)), min(along, int(hi))
    half = max(3, int(cell * 0.32))
    if hi - lo < nstrip * 4:
        return [np.atleast_1d(c) for c in lines]
    edges = np.linspace(lo, hi, nstrip + 1)
    out = []
    for c in lines:
        ts, vs = [], []
        for k in range(nstrip):
            a, b = int(edges[k]), int(edges[k + 1])
            if b - a < 4:
                continue
            acc, cnt = {}, 0
            for t in range(a, b, max(1, (b - a) // 12)):
                v0 = float(np.polyval(c, t))
                p, q = int(v0) - half, int(v0) + half + 1
                if p < 0 or q > lim:
                    continue
                w = (B[t, p:q] if axis == 0 else B[p:q, t]).astype(np.float32)
                sm = w.sum()
                if sm < 1 or sm > half:      # 整段全黑 = 棋子，不能拿来定位
                    continue
                acc[t] = p + (np.arange(len(w)) * w).sum() / sm
                cnt += 1
            if cnt < 4:
                continue
            mid = (a + b) / 2
            ts.append(mid); vs.append(float(np.median(list(acc.values()))))
        if len(ts) < 3:
            out.append(np.atleast_1d(c)); continue
        ts, vs = np.array(ts), np.array(vs)
        deg = 2 if len(ts) >= 4 else 1
        out.append(np.polyfit(ts, vs, deg))
    return out


def spacing_ok(lines, span, cell):
    """相邻线的间距是否还在一格上下。用来挡住「跳到隔壁那条线」。"""
    ts = np.linspace(span[0], span[1], 5)
    for a, b in zip(lines, lines[1:]):
        d = np.polyval(b, ts) - np.polyval(a, ts)
        if d.min() < cell * 0.70 or d.max() > cell * 1.35:
            return False
    return True


def cross(vc, hc, x0, y0):
    """竖线 x=f(y) 与横线 y=g(x) 的交点，从 (x0,y0) 迭代几步即收敛。"""
    x, y = float(x0), float(y0)
    for _ in range(4):
        y = float(np.polyval(hc, x))
        x = float(np.polyval(vc, y))
    return x, y


# 网格精修的搜索窗口调度（单位：格）。先宽后窄：宽窗才追得上书页拱起造成的
# 弯曲（左端能偏 0.8 格），窄窗才定得准。一步到位地放到 0.85 格会跳线，
# 在 185 道人工确认的题上实测：单轮 0.30 → 331 错；(0.42,0.32) → 313 错、
# 全对题数 77 → 94。
SCHEDULE = (0.42, 0.32)


def read(path, debug=False, with_sites=False):
    D = ink(path)
    H, W = D.shape
    T = 22.0
    B = D > T

    def drop_edge(pos, n, margin):
        """扔掉贴着裁切边的假峰。

        切图的边缘本身会在剖面里造出一条"线"（实测左边缘 x=7、下边缘 y=1161
        都被认成了网格线）。它一旦被当成外框，整幅图就整体错一路。
        """
        return np.array([p for p in pos if margin < p < n - margin])

    # ── 竖线：只看上部（空盘区）──
    r0, r1 = int(H * 0.04), int(H * 0.42)
    sv, colp = best_shear(B, r0, r1, 0)
    vx = peaks(colp, 0.45, 12)
    if len(vx) < 4:
        raise ValueError("竖线太少")
    cell = float(np.median(np.diff(vx)))
    vx = snap_comb(drop_edge(peaks(colp, 0.45, cell * 0.6), W, cell * 0.3), cell)
    if len(vx) < 4:
        raise ValueError("竖线太少")

    # ── 横线：取样范围由竖线定，不用图宽的固定比例 ──
    # 按 0.58W~0.98W 取会切到棋图外的空白，把剖面稀释掉，
    # 最下面那条外框线就可能低于阈值而漏检（实测 q216 即如此）。
    c0, c1 = int(vx[len(vx) // 2]), int(vx[-1])
    sh, rowp = best_shear(B, c0, c1, 1)
    hy = snap_comb(drop_edge(peaks(rowp, 0.38, cell * 0.6), H, cell * 0.3), cell)
    if len(hy) < 4:
        raise ValueError("横线太少")

    gaps = np.diff(hy)
    cell_h = float(np.median(gaps[gaps < cell * 1.5])) if (gaps < cell * 1.5).any() else cell
    vx = densify(vx, cell)
    hy = densify(hy, cell_h)

    # 全网格共用一个倾斜角，而不是每条线各拟合各的。
    # 逐条拟合时，横线只能在右半幅（空盘区）取样，斜率各自带点噪声，
    # 外推到左边一千多像素后相邻两条会挤到一起——实测 q227 的第 4、5 路
    # 在左边缘几乎重合，下半幅整片判错。倾斜角本来就是拍照姿态决定的，
    # 全图一个值，反而比逐条自由拟合稳。
    vlines = [np.array([sv, x - sv * r0]) for x in vx]
    hlines = [np.array([sh, y - sh * c0]) for y in hy]
    # 精修范围就用网格自身的跨度，别用图宽比例——图外的空白没有线可追
    vspan = (max(0, int(hy[0] - cell)), min(H, int(hy[-1] + cell)))
    hspan = (max(0, int(vx[0] - cell)), min(W, int(vx[-1] + cell)))
    # 由粗到细多轮收敛。
    #
    # 只跑一轮窄窗是不行的：书页拱起时，左端的横线能比初始模型偏 0.8 格，
    # 而窄窗的搜索半径和离群点过滤都只有 0.3 格——**恰好把携带弯曲信息的
    # 样本全过滤掉了**，于是模型永远追不上左端，表现为最左三列白子成片漏判
    # （用户复核 173 道反馈的 327 处错，273 处是这一类）。
    # 先用宽窗把线粗略拉过去，再逐步收窄精修。
    # 每一轮都带护栏：窗口放宽能追上弯曲，但也可能让某条线整个跳到隔壁那条上。
    # 跳线的代价远大于追不上（前者把整幅图判反，后者只是漏几个子），
    # 所以任何一轮只要把相邻间距搞得不像一格，就整体回退这一轮。
    for win in SCHEDULE:
        for lines, axis, span in ((vlines, 0, vspan), (hlines, 1, hspan)):
            moved = refine_curve(B, shift_lines(B, lines, axis, span, cell, win),
                                 axis, span, cell, win=win)
            if spacing_ok(moved, span, cell):
                if axis == 0: vlines = moved
                else: hlines = moved

    # 切图贴着外框裁，所以最左竖线 = A 列，最下横线 = 1 路
    rin = int(cell * 0.28)
    yy, xx = np.mgrid[-rin:rin + 1, -rin:rin + 1]
    disc = (xx ** 2 + yy ** 2) <= rin ** 2

    # 白子要正着认，不能只靠「内圈干净」：网格之外的空白纸面内圈同样干净，
    # 会被整片误判成白子（实测一道题多出 25 个）。这里再查一圈轮廓——
    # 沿 48 个方向看半径 0.34~0.60 格处有没有墨迹。阈值是在 96 道
    # 已标注的题（9480 个交叉点）上网格搜出来的：黑>0.70、白内圈<0.07 且
    # 整圈覆盖>0.35。此时黑子内圈最低 0.983、非黑最高 0.432，中间隔着一条鸿沟；
    # 白子内圈最高 0.090、空点最低 0.086，卡在 0.07 宁可漏也不误判。
    NA = 48
    ang = np.arange(NA) * (2 * np.pi / NA)
    rr = np.arange(cell * 0.34, cell * 0.60, 1.0)
    ring_dx = np.round(np.cos(ang)[:, None] * rr[None, :]).astype(int)
    ring_dy = np.round(np.sin(ang)[:, None] * rr[None, :]).astype(int)
    rmax = int(cell * 0.60) + 1

    # 取样前把图外扩一圈空白。
    # 切图只在棋图外框外留 6% 余量（约 0.6 格），而整圈检测要 0.6 格半径——
    # A 列和 1 路正好卡在边界检查的门槛上，整列交叉点被跳过，
    # 表现为「左边一竖排白子全漏」（实测 173 道复核题里 273 处错都是这一类）。
    # 补白不会凭空造出墨迹：真棋子的轮廓本来就在框内，照样测得到。
    pad = rmax + 2
    BP = np.pad(B, pad, constant_values=False)
    HP, WP = BP.shape

    # 落在灰色地带的交叉点数量 = 这幅图的可疑度。
    # 两条鸿沟都很宽；真掉进沟里，多半是网格没对准（书页拱得太厉害）。
    # ── 判子：先按内圈+整圈定一版，再用"净覆盖"把漏掉的白子捞回来 ──
    #
    # 整圈覆盖对空点也偏高，因为**相邻棋子的边缘会落进检测环**
    # （相邻一格 = 1-0.47 = 0.53 格，正好在 0.34~0.60 的环里）。
    # 把指向已识别棋子的方向剔掉，剩下方向的覆盖率就干净多了：
    # 在 185 道人工确认的题上，漏掉的白子净覆盖中位数 0.394，真空点只有 0.104。
    # 加上这条后整体错判从 317 降到 265。
    site = {}
    for i, vc in enumerate(vlines):
        for j, hc in enumerate(reversed(hlines)):        # 自下而上 = 1 路起
            x, y = cross(vc, hc, np.polyval(vc, H / 2), np.polyval(hc, W / 2))
            xi, yi = int(round(x)) + pad, int(round(y)) + pad
            if not (rmax < xi < WP - rmax and rmax < yi < HP - rmax):
                continue
            f = BP[yi - rin:yi + rin + 1, xi - rin:xi + rin + 1][disc].mean()
            cov = BP[yi + ring_dy, xi + ring_dx].any(axis=1).mean()
            kind = "b" if f > 0.70 else ("w" if f < 0.07 and cov > 0.35 else "e")
            site[(i, j)] = [xi, yi, float(f), float(cov), kind]

    # 题目的棋子总是聚在角上一团，而右半幅空白区常有背面透印的鬼影环——
    # 它同样能把"净覆盖"顶起来。所以只在已识别棋子的包围盒（外扩一路）之内
    # 才允许靠净覆盖补判白子，否则会在空白处凭空补出一片。
    occ = [(i, j) for (i, j), v in site.items() if v[4] != "e"]
    if occ:
        i0 = min(i for i, _ in occ) - 1; i1 = max(i for i, _ in occ) + 1
        j0 = min(j for _, j in occ) - 1; j1 = max(j for _, j in occ) + 1
    else:
        i0 = i1 = j0 = j1 = -99

    weak = 0
    edge = []
    black, white = [], []
    for (i, j), (xi, yi, f, cov, kind) in site.items():
        near = i0 <= i <= i1 and j0 <= j <= j1
        if kind == "e" and f < 0.12 and near:
            keep = [a for a in range(NA)
                    if site.get((i + round(np.cos(ang[a])), j - round(np.sin(ang[a]))),
                                [0, 0, 0, 0, "e"])[4] == "e"]
            if len(keep) >= 12 and BP[yi + ring_dy[keep], xi + ring_dx[keep]].any(axis=1).mean() > 0.32:
                kind = "w"
        if 0.07 <= f <= 0.115 or 0.45 <= f <= 0.95:
            weak += 1
        # 边缘情况：判成空但"净覆盖"接近白子门槛，或判成黑但内圈不够黑。
        # 人工核对时只看这些点就够了，不必扫全盘。
        if kind == "e" and f < 0.20 and near:
            keep = [a for a in range(NA)
                    if site.get((i + round(np.cos(ang[a])), j - round(np.sin(ang[a]))),
                                [0, 0, 0, 0, "e"])[4] == "e"]
            # 净覆盖够高却因内圈略脏没被判成白子的点。空点的净覆盖 p95 只有 0.23，
            # 所以 0.20 这条线一幅图上大约只标出两三个，人工扫一眼就行。
            if len(keep) >= 12 and BP[yi + ring_dy[keep], xi + ring_dx[keep]].any(axis=1).mean() >= 0.20:
                edge.append(COLS[i] + str(j + 1))
        elif kind == "b" and f < 0.97:
            edge.append(COLS[i] + str(j + 1))
        name = COLS[i] + str(j + 1)
        if kind == "b":
            black.append(name)
        elif kind == "w":
            white.append(name)
    if debug:
        print(f"  cell={cell:.1f} 竖线{len(vx)} 横线{len(hy)} 可疑{weak}", file=sys.stderr)
    out = {"black": sorted(black), "white": sorted(white),
           "weak": weak, "edge": sorted(set(edge)), "cell": round(cell, 1)}
    if with_sites:
        # 供核对工具复用：交叉点在原图中的坐标（已减去补白）
        out["sites"] = {COLS[i] + str(j + 1): (v[0] - pad, v[1] - pad)
                        for (i, j), v in site.items()}
    return out


if __name__ == "__main__":
    res = {}
    for p in sys.argv[1:]:
        no = p.split("/")[-1].lstrip("q").split(".")[0]
        try:
            res[no] = read(p)
        except Exception as e:
            res[no] = {"error": str(e)}
    print(json.dumps(res, ensure_ascii=False, indent=1))
