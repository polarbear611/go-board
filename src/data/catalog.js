// 教材目录：书 → 单元 → 小组 → 题号
//
// 数据来自逐页核对书上的页眉（单元名）与页首标题（小组名），
// 生成脚本与原始照片在 eval/。每个小组正好 6 题、占一页，
// 所以小组只存 from/to 两个端点，不必逐题罗列。
//
// **一本书一个文件**：`src/data/catalog*.local.json`（均已 gitignore —— 它们是
// 在售教材的目录，属该书内容，不进公开仓库）。加一本书 = 丢一个文件进来，
// 代码不用动。一个都没有时回落到 catalog.example.json，clone 下来即可跑。
//
// 用 import.meta.glob 而不是静态 import：静态 import 一个不存在的文件会让构建
// 直接失败，而 glob 在文件缺席时返回空对象，于是干净地回落到示例目录。
import example from './catalog.example.json'

// ── 题号前缀：两册书在题号上完全重叠 ────────────────────────────────
//
// 死活册收 187–768，手筋册的 265–288 落在同一区间里，而后端 POST 是按
// problemNo upsert —— 不带前缀存手筋第 265 题，会**静默覆盖**死活第 265 题
// （不报错、不冲突，只是那道题的棋形悄悄变了）。
//
// 死活册是先来的，沿用裸数字（prefix: ""）；后来的书各带自己的前缀，
// 手筋册是 "手筋-"，与库里早先那道 手筋-259 一致。前缀是**题库主键的一部分**，
// 定了就不能改 —— 改了等于换一批新题号，旧记录会变成孤儿。
const RAW = import.meta.glob('./catalog*.local.json', { eager: true, import: 'default' })

function normalize(raw, path) {
  const id = raw.id || path.match(/catalog\.?(.*)\.local\.json$/)?.[1] || 'default'
  const prefix = raw.prefix || ''
  return {
    id,
    prefix,
    order: raw.order ?? 99,
    title: raw.book?.title ?? id,
    series: raw.book?.series ?? '',
    meta: raw.book ?? {},
    range: raw.range ?? null,
    note: raw.note ?? '',
    // 前缀往下挂到每个小组：problemsOf(group) 才能独立拼出完整题号，
    // 调用方不必再把书一路传下去
    units: (raw.units ?? []).map((u) => ({
      ...u,
      bookId: id,
      groups: (u.groups ?? []).map((g) => ({ ...g, bookId: id, prefix })),
    })),
  }
}

const found = Object.entries(RAW)
export const books = (found.length ? found : [['./catalog.example.json', example]])
  .map(([path, raw]) => normalize(raw, path))
  .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))

/** 默认展示哪本书 */
export const defaultBook = books[0]

export function bookOf(id) {
  return books.find((b) => b.id === id) || defaultBook
}

/**
 * 题号 → 所属书、单元与小组；不在任何目录内（自己起名的题、旧题号）返回 null
 *
 * 前缀长的先试：裸数字那本的 prefix 是 ""，能匹配上任何字符串，
 * 必须放到最后，否则 "手筋-265" 会先被它认成第 265 题。
 */
const BY_PREFIX = [...books].sort((a, b) => b.prefix.length - a.prefix.length)

export function locate(problemNo) {
  const s = String(problemNo ?? '').trim()
  if (!s) return null
  for (const book of BY_PREFIX) {
    if (book.prefix && !s.startsWith(book.prefix)) continue
    const rest = book.prefix ? s.slice(book.prefix.length) : s
    if (!/^\d+$/.test(rest)) continue
    const n = Number(rest)
    for (const unit of book.units) {
      for (const group of unit.groups) {
        if (n >= group.from && n <= group.to) return { book, unit, group }
      }
    }
  }
  return null
}

/** 小组内的完整题号列表（含书前缀），可直接喂给 api/problems */
export function problemsOf(group) {
  const out = []
  for (let n = group.from; n <= group.to; n++) out.push(`${group.prefix ?? ''}${n}`)
  return out
}

/** 完整题号 → 书里的裸号，用于按钮上只显示数字 */
export function bareNo(problemNo, group) {
  const p = group?.prefix
  const s = String(problemNo)
  return p && s.startsWith(p) ? s.slice(p.length) : s
}

/** 一句话描述题号出处，用于保存对话框的即时提示 */
export function describe(problemNo) {
  const hit = locate(problemNo)
  if (!hit) return null
  const where = `第${hit.unit.no}单元 ${hit.unit.name} · ${hit.group.name} · ${hit.group.goal}`
  // 只有一本书时不必每次都念书名
  return books.length > 1 ? `${hit.book.title} · ${where}` : where
}

/** 页头那一行：系列名 + 各册简称 */
export function catalogSummary() {
  const series = (books[0].series || '').replace('阶梯围棋基础训练丛书', '阶梯围棋')
  const titles = books.map((b) => b.title.replace(/专项训练.*$/, '')).join(' · ')
  return [series, titles].filter(Boolean).join(' · ')
}

export default books
