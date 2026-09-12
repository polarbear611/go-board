#!/usr/bin/env python3
"""把书页切图和 read_tile 的解析结果并排画出来，供人工逐题复核。

    python3 eval/compare.py eval/out/tiles/q283.png '{"black":["C1"],"white":[]}' 出图.png

平时由 eval/ingest.py 调用 render_pair()，命令行入口只用于单题返工。

为什么是「照片 + 重绘」而不是「在照片上打点」：在照片上叠标记，标记和棋子
挤在一起，多一颗少一颗恰恰看不出来；分开画反而一眼就能比出行列。右图按
**从下往上数的行号 + 跳过 I 的列标**画，和棋盘坐标系一致，说「E3 多了一颗白」
时两边对得上。
"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

COL = "ABCDEFGHJKLMNOPQRST"
NC, NR = 12, 9            # 画 A–M × 1–9：书上的题都缩在角上，整盘画反而看不清
CELL, PAD = 46, 44


def _font(size=22):
    for p in ("/System/Library/Fonts/Supplemental/Arial.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def render_board(black, white, title):
    F = _font()
    w = PAD * 2 + (NC - 1) * CELL
    h = PAD * 2 + (NR - 1) * CELL + 34
    im = Image.new("RGB", (w, h), "#f2e2bf")
    d = ImageDraw.Draw(im)
    # 行号从下往上：xy(c, r) 里 r 是棋盘行号（1 在最下），和 constants/board.js 一致
    xy = lambda c, r: (PAD + c * CELL, PAD + (NR - r) * CELL + 12)

    for c in range(NC):                       # A 列是棋盘左边缘，画粗
        x, _ = xy(c, 1)
        d.line([(x, xy(0, NR)[1]), (x, xy(0, 1)[1])], fill="black", width=3 if c == 0 else 1)
    for r in range(1, NR + 1):                # 第 1 行是棋盘下边缘，画粗
        _, y = xy(0, r)
        d.line([(xy(0, r)[0], y), (xy(NC - 1, r)[0], y)], fill="black", width=3 if r == 1 else 1)
    for c, r in ((3, 4), (9, 4)):             # 星位 D4 / K4：对网格最快的校验点
        x, y = xy(c, r)
        d.ellipse([x - 4, y - 4, x + 4, y + 4], fill="black")

    for pts, color in ((black, "black"), (white, "white")):
        for p in pts:
            c = COL.index(p[0])
            r = int(p[1:])
            if c >= NC or r > NR:             # 落在画幅外：标出来，别悄悄吞掉
                d.text((PAD, h - 20), f"⚠ {p} 在画幅外", fill="#a00", font=F)
                continue
            x, y = xy(c, r)
            rr = CELL * 0.46
            d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=color, outline="black", width=2)

    for c in range(NC):
        x, _ = xy(c, 1)
        d.text((x - 7, xy(0, 1)[1] + 10), COL[c], fill="#333", font=F)
    for r in range(1, NR + 1):
        _, y = xy(0, r)
        d.text((8, y - 11), str(r), fill="#333", font=F)
    d.text((PAD, 6), title, fill="#a00", font=F)
    return im


def render_pair(tile_path, parsed, label, out_path):
    photo = Image.open(tile_path)
    photo.thumbnail((760, 760))
    black, white = parsed["black"], parsed["white"]
    sus = []
    if parsed.get("weak"):
        sus.append("weak")
    if parsed.get("edge"):
        sus.append("edge " + ",".join(parsed["edge"]))
    title = f"{label}   黑{len(black)} 白{len(white)}" + (f"   [{'; '.join(sus)}]" if sus else "")
    right = render_board(black, white, title)
    out = Image.new("RGB", (photo.width + right.width + 12, max(photo.height, right.height)), "white")
    out.paste(photo, (0, 0))
    out.paste(right, (photo.width + 12, 0))
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    out.save(out_path)
    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    tile, parsed, dst = sys.argv[1], json.loads(sys.argv[2]), sys.argv[3]
    parsed.setdefault("weak", 0)
    parsed.setdefault("edge", [])
    print(render_pair(tile, parsed, Path(tile).stem, dst))
