#!/usr/bin/env python3
"""把校对好的 payload 上架到线上题库，并回读验证。

    python3 eval/publish.py eval/out/tesuji-289.json            # 干跑：只打印会发生什么
    python3 eval/publish.py eval/out/tesuji-289.json --write     # 真写
    python3 eval/publish.py ... --write --force                  # 允许覆盖已存在的题号

**默认干跑**。线上是 twin 生产环境里的真库，后端 POST 是按 problemNo 的
upsert —— 写错题号不会报错、不会冲突，只会让另一道题的棋形悄悄变掉。
所以这里有三道闸：

1. **干跑是默认**，--write 才发请求；
2. **题号已存在就中止**，除非显式 --force。新一批题永远应该是纯新增，
   撞上已有题号 = 前缀写错了 或 这批题号算错了，不是「顺手覆盖掉」；
3. **写完逐条回读比对**，不一致就非零退出。「HTTP 200」只说明请求到了，
   不说明存进去的是你要的东西。

写完会把这一批追加进 eval/ground-truth.<book>.json（人工基准，gitignore），
confidence 一律记 verified —— 走到这一步意味着对照图已经逐张看过了。
"""
import argparse, json, sys, urllib.error, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
API = "https://go.xlingdata.com/api/problems"


def req(url, method="GET", body=None):
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method,
                               headers={"Content-Type": "application/json"} if data else {})
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, None


def book_of(prefix):
    """按前缀反查是哪本书，用于给 ground-truth 文件起名。"""
    for p in sorted((ROOT / "src/data").glob("catalog*.local.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        if d.get("prefix", "") == prefix:
            return d.get("id", p.stem), d
    return None, None


def locate(cat, problem_no):
    """题号 → 目录里的单元与小组。与 src/data/catalog.js 的 locate() 同义，
    归档时把出处一起写进基准文件，和死活册那份的字段对齐。"""
    prefix = cat.get("prefix", "")
    rest = problem_no[len(prefix):] if prefix and problem_no.startswith(prefix) else problem_no
    if not rest.isdigit():
        return {}
    n = int(rest)
    for u in cat.get("units", []):
        for g in u.get("groups", []):
            if g["from"] <= n <= g["to"]:
                return {"unit": u["no"], "unitName": u["name"],
                        "group": g["name"], "goal": g.get("goal", "")}
    return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("payload")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--api", default=API)
    a = ap.parse_args()

    items = json.loads(Path(a.payload).read_text(encoding="utf-8"))
    nos = [it["problemNo"] for it in items]
    if len(set(nos)) != len(nos):
        raise SystemExit("payload 里有重复题号，先改掉")

    prefix = ""
    for cand in sorted({n.rsplit("-", 1)[0] + "-" for n in nos if "-" in n}, key=len, reverse=True):
        if all(n.startswith(cand) for n in nos):
            prefix = cand
            break
    book_id, cat = book_of(prefix)

    print(f"目标   {a.api}")
    print(f"来源   {a.payload}")
    print(f"书     {cat['book']['title'] if cat else '（前缀 %r 没对上任何目录文件）' % prefix}")
    print(f"题号   {nos[0]} … {nos[-1]}（{len(nos)} 道）")

    # ── 闸 2：撞号检查 ────────────────────────────────────────────────
    status, existing = req(a.api)
    if status != 200:
        raise SystemExit(f"读不到线上题库（HTTP {status}），中止")
    have = {p["problemNo"] for p in existing}
    clash = [n for n in nos if n in have]
    print(f"线上   现有 {len(have)} 道；本批中已存在 {len(clash)} 道"
          + (f" → {', '.join(clash[:8])}{' …' if len(clash) > 8 else ''}" if clash else "（纯新增）"))
    if clash and not a.force:
        raise SystemExit(
            "\n中止：这批题号在线上已经有了。\n"
            "新一批题应该是纯新增——撞号通常意味着前缀写错了（比如把手筋册的题\n"
            "存成裸数字，会覆盖死活册的同号题），或者 --first 算错了一页。\n"
            "确认过就是要覆盖，再加 --force。"
        )

    if not a.write:
        print("\n[干跑] 没有发任何写请求。确认无误后加 --write。")
        return

    # ── 写 ────────────────────────────────────────────────────────────
    print()
    bad = []
    for it in items:
        st, _ = req(a.api, "POST", it)
        print(f"  POST {it['problemNo']:<12} {st}")
        if st not in (200, 201):
            bad.append(it["problemNo"])
    if bad:
        raise SystemExit(f"\n{len(bad)} 条写失败：{bad}")

    # ── 闸 3：回读比对 ────────────────────────────────────────────────
    print("\n回读比对…")
    diff = []
    for it in items:
        st, got = req(f"{a.api}/{urllib.parse.quote(it['problemNo'])}")
        if st != 200 or not got:
            diff.append((it["problemNo"], f"读不回来 HTTP {st}"))
            continue
        for k in ("blackStones", "whiteStones"):
            if sorted(got[k]) != sorted(it[k]):
                diff.append((it["problemNo"], k))
        if got["firstPlayer"] != it["firstPlayer"]:
            diff.append((it["problemNo"], "firstPlayer"))
    if diff:
        for n, w in diff:
            print(f"  ✗ {n}  {w}")
        raise SystemExit(f"\n{len(diff)} 处不一致——线上与 payload 不符，别当成功了")
    print(f"  ✓ {len(items)} 条全部一致")

    # ── 人工基准归档 ──────────────────────────────────────────────────
    if book_id:
        gt = HERE / f"ground-truth.{book_id}.json"
        d = json.loads(gt.read_text(encoding="utf-8")) if gt.exists() else {
            "book": cat["book"], "note": "人工逐题核对过的基准；由 eval/publish.py 追加。", "problems": []}
        seen = {p["problemNo"] for p in d["problems"]}
        for it in items:
            rec = {"problemNo": it["problemNo"], "firstPlayer": it["firstPlayer"],
                   "black": sorted(it["blackStones"]), "white": sorted(it["whiteStones"]),
                   "confidence": "verified", **locate(cat, it["problemNo"])}
            if it["problemNo"] in seen:
                d["problems"] = [rec if p["problemNo"] == it["problemNo"] else p for p in d["problems"]]
            else:
                d["problems"].append(rec)
        d["problems"].sort(key=lambda p: (len(p["problemNo"]), p["problemNo"]))
        d["counts"] = {"verified": len(d["problems"]), "total": len(d["problems"])}
        gt.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"  基准已归档 {gt.name}（共 {len(d['problems'])} 道）")

    st, after = req(a.api)
    print(f"\n上架完成：线上 {len(have)} → {len(after)} 道")


if __name__ == "__main__":
    main()
