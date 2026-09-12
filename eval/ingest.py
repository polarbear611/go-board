#!/usr/bin/env python3
"""一批书页照片 → 切图 → 识别 → 待校对的 payload。

用法:
    python3 eval/ingest.py --book tesuji --first 289 照片1.jpg 照片2.jpg ...
    python3 eval/ingest.py --book tesuji --first 289 --clipshare 4

    --book       书的 id，对应 src/data/catalog[.<id>].local.json，题号前缀从那里读
    --first      这批照片里**第一页第一题**的题号；每页固定 6 题，逐页递增
    --clipshare  不给文件路径，改从局域网共享板拉最新的 N 个文件（手机拍完直接传）
    --out        输出目录，默认 eval/out/

产出（都在 --out 下）:
    tiles/q<题号>.png       单题切图，校对台用
    cmp/c<题号>.png         左照片右解析的对照图，**人工复核就看这个**
    <book>-<first>.json     待校对 payload，逐条 {problemNo, blackStones, whiteStones, firstPlayer}
    <book>-<first>.md       这一批的清单：每页题号区间、可疑点、以及要往目录里补的小组

这一步**不写数据库、不碰线上**。校对完再跑 eval/publish.py。

为什么要出对照图：read_tile.py 是确定性图像处理，全书成绩逐题只有 76.8%
（逐子 96.29%），而且错子高度集中——四分之一的题有错、其余完全正确。
「抽查几道都对」说明不了任何问题，必须逐题对着照片过一遍。对照图就是为了
让这件事快到可以真的做完。

它自报的 weak / edge 不是可靠的分诊信号（全量数据上有可疑点的 33% 有错、
零可疑点的 22% 有错），所以清单里照列，但别拿它当「只看这几道」的依据。
"""
import argparse, json, os, subprocess, sys, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PER_PAGE = 6


# ── 书的前缀：以 src/data 里的目录文件为唯一来源 ──────────────────────
#
# 别在这里硬编码 {"tesuji": "手筋-"}。前缀是题库主键的一部分，代码里抄一份
# 就会有抄错、改了一处没改另一处的机会，而错的后果是**静默覆盖另一本书的题**。
def load_book(book_id):
    cands = [ROOT / "src/data" / f"catalog.{book_id}.local.json"]
    if book_id in ("", "default", "shihuo"):
        cands.insert(0, ROOT / "src/data/catalog.local.json")
    for p in cands:
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            if d.get("id", book_id) == book_id or p.name == "catalog.local.json":
                return p, d
    raise SystemExit(
        f"找不到书 '{book_id}' 的目录文件（试过 {', '.join(str(c) for c in cands)}）。\n"
        f"新书先照着 src/data/catalog.example.json 建一个 catalog.{book_id}.local.json，"
        f"里面必须有一个非空且此前没用过的 prefix。"
    )


def clipshare_base():
    url = os.environ.get("CLIPSHARE_URL")
    if not url:
        conf = Path.home() / ".claude/skills/clipshare/runtime.conf"
        if conf.exists():
            for line in conf.read_text(encoding="utf-8").splitlines():
                if line.startswith("CLIPSHARE_URL="):
                    url = line.split("=", 1)[1].strip()
    return (url or "http://localhost:8765").rstrip("/")


def pull_clipshare(n, dest):
    base = clipshare_base()
    try:
        with urllib.request.urlopen(f"{base}/api/state", timeout=5) as r:
            state = json.load(r)
    except Exception as e:
        raise SystemExit(f"连不上共享板 {base}：{e}\n（host 没起，或 IP 变了）")
    files = state.get("files", [])[:n]          # /api/state 已按时间倒序
    if len(files) < n:
        raise SystemExit(f"共享板上只有 {len(files)} 个文件，要 {n} 个")
    dest.mkdir(parents=True, exist_ok=True)
    out = []
    # 倒序 → 正序：手机上是先拍先传，倒序列表的最后一个才是这批的第一页
    for f in reversed(files):
        p = dest / f["name"]
        urllib.request.urlretrieve(f"{base}/files/{f['id']}/{f['name']}", p)
        out.append(p)
        print(f"  拉取 {f['name']}  {f['size'] // 1024} KB")
    return out


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"{' '.join(str(c) for c in cmd)} 失败：\n{r.stderr or r.stdout}")
    return r.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photos", nargs="*")
    ap.add_argument("--book", required=True)
    ap.add_argument("--first", type=int, required=True)
    ap.add_argument("--clipshare", type=int, default=0)
    ap.add_argument("--out", default=str(HERE / "out"))
    a = ap.parse_args()

    cat_path, cat = load_book(a.book)
    prefix = cat.get("prefix", "")
    out = Path(a.out); (out / "tiles").mkdir(parents=True, exist_ok=True); (out / "cmp").mkdir(exist_ok=True)

    print(f"书：{cat['book']['title']}  前缀 {prefix or '（裸数字）'}  目录 {cat_path.name}")

    photos = [Path(p) for p in a.photos]
    if a.clipshare:
        if photos:
            raise SystemExit("--clipshare 和显式文件路径二选一")
        print(f"从共享板拉最新 {a.clipshare} 张：")
        photos = pull_clipshare(a.clipshare, out / "pages")
    if not photos:
        raise SystemExit("没给照片，也没给 --clipshare")

    # ── 切图 ──────────────────────────────────────────────────────────
    pages = []
    for i, ph in enumerate(photos):
        first = a.first + i * PER_PAGE
        print(f"\n切图 {ph.name} → 第 {first}–{first + PER_PAGE - 1} 题")
        print(run([sys.executable, str(HERE / "slice_page.py"), str(ph), str(first), str(out / "tiles")]).rstrip())
        pages.append((ph, first))

    # ── 识别 ──────────────────────────────────────────────────────────
    nos = [a.first + k for k in range(len(photos) * PER_PAGE)]
    auto = {}
    for n in nos:
        auto.update(json.loads(run([sys.executable, str(HERE / "read_tile.py"), str(out / "tiles" / f"q{n}.png")])))

    # ── 对照图 ────────────────────────────────────────────────────────
    from compare import render_pair          # 同目录
    for n in nos:
        render_pair(out / "tiles" / f"q{n}.png", auto[str(n)], f"{prefix}{n}", out / "cmp" / f"c{n}.png")

    # ── payload ───────────────────────────────────────────────────────
    #
    # firstPlayer 固定 black：这两本书的题干都是「黑先」。真遇到白先的册子，
    # 在这里加参数，别在校对台上逐题改。
    payload = [{
        "problemNo": f"{prefix}{n}",
        "blackStones": sorted(auto[str(n)]["black"]),
        "whiteStones": sorted(auto[str(n)]["white"]),
        "firstPlayer": "black",
    } for n in nos]
    stem = f"{a.book}-{a.first}"
    (out / f"{stem}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    # ── 清单 ──────────────────────────────────────────────────────────
    lines = [f"# {cat['book']['title']} {prefix}{nos[0]}–{prefix}{nos[-1]}", ""]
    lines.append(f"- 照片 {len(photos)} 张，题目 {len(nos)} 道，前缀 `{prefix}`")
    lines.append(f"- payload：`{out / (stem + '.json')}`")
    lines.append(f"- 对照图：`{out / 'cmp'}/c<题号>.png` —— **逐张看完再上架**")
    lines.append("")
    lines.append("| 页 | 题号 | 自报可疑点 |")
    lines.append("|---|---|---|")
    for (ph, first) in pages:
        sus = [f"{n}:{','.join(auto[str(n)]['edge']) or 'weak'}"
               for n in range(first, first + PER_PAGE)
               if auto[str(n)]["weak"] or auto[str(n)]["edge"]]
        lines.append(f"| {ph.name} | {first}–{first + PER_PAGE - 1} | {'；'.join(sus) or '—'} |")
    lines += ["", "## 还要做的两件事", "",
              f"1. **补目录**：把这几页页眉上的单元名、页首的小组名，按 6 题一组追加到 `{cat_path.name}` 的 units 里。",
              "   目录不补，题目在加载弹窗里只会出现在「最近保存」，翻不到。",
              f"2. **校对完再上架**：`python3 eval/publish.py {out / (stem + '.json')}`（先干跑看 diff，加 --write 才真写）。"]
    (out / f"{stem}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"\n{'=' * 60}")
    print(f"payload  {out / (stem + '.json')}   {len(payload)} 条")
    print(f"对照图   {out / 'cmp'}/c{nos[0]}.png … c{nos[-1]}.png")
    print(f"清单     {out / (stem + '.md')}")
    print("下一步：逐张看对照图 → 补目录 → eval/publish.py")


if __name__ == "__main__":
    main()
