// 目录层的单测。跑在只有 catalog.example.json 的环境里也必须全绿 ——
// 真实教材目录是 gitignore 的本地文件，CI / clone 下来的仓库都没有它，
// 所以这里不断言任何具体书名、题号，只断言**结构性质**。
import { describe as group, it, expect } from 'vitest'
import { books, bookOf, locate, problemsOf, bareNo, describe, catalogSummary } from './catalog'

group('目录加载', () => {
  it('至少有一本书，且字段齐全', () => {
    expect(books.length).toBeGreaterThan(0)
    for (const b of books) {
      expect(typeof b.id).toBe('string')
      expect(b.id).not.toBe('')
      expect(typeof b.prefix).toBe('string')
      expect(b.units.length).toBeGreaterThan(0)
    }
  })

  it('id 唯一', () => {
    expect(new Set(books.map((b) => b.id)).size).toBe(books.length)
  })

  // 前缀是题库主键的一部分。两本书前缀相同 = 题号空间重叠 = 后端 upsert
  // 会让后存的那本静默覆盖前一本，且不报错。
  it('前缀唯一，且至多一本用空前缀', () => {
    const ps = books.map((b) => b.prefix)
    expect(new Set(ps).size).toBe(ps.length)
    expect(ps.filter((p) => p === '').length).toBeLessThanOrEqual(1)
  })

  it('同一本书内小组题号不重叠，且按序排列', () => {
    for (const b of books) {
      const gs = b.units.flatMap((u) => u.groups)
      const sorted = [...gs].sort((x, y) => x.from - y.from)
      for (const g of gs) expect(g.to).toBeGreaterThanOrEqual(g.from)
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].from).toBeGreaterThan(sorted[i - 1].to)
      }
    }
  })

  it('每个小组都带上了本书的前缀', () => {
    for (const b of books) {
      for (const u of b.units) for (const g of u.groups) expect(g.prefix).toBe(b.prefix)
    }
  })
})

group('locate / problemsOf', () => {
  const first = books[0]
  const g0 = first.units[0].groups[0]

  it('组内首尾题号都能定位回同一组', () => {
    for (const n of [g0.from, g0.to]) {
      const hit = locate(`${first.prefix}${n}`)
      expect(hit).not.toBeNull()
      expect(hit.book.id).toBe(first.id)
      expect(hit.group.from).toBe(g0.from)
    }
  })

  it('problemsOf 拼出完整题号，数量对得上', () => {
    const list = problemsOf(g0)
    expect(list).toHaveLength(g0.to - g0.from + 1)
    expect(list[0]).toBe(`${first.prefix}${g0.from}`)
    for (const no of list) expect(locate(no)?.group.from).toBe(g0.from)
  })

  it('bareNo 把前缀剥掉，用于按钮上只显示数字', () => {
    expect(bareNo(`${first.prefix}${g0.from}`, g0)).toBe(String(g0.from))
  })

  it('自己起名的题、空值、非数字一律返回 null', () => {
    for (const bad of ['有眼杀无眼-248', '', null, undefined, 'abc', '手筋-', '12x']) {
      expect(locate(bad)).toBeNull()
    }
  })

  // 空前缀那本能匹配任何字符串，必须最后才试 —— 否则 "手筋-265" 会先被它
  // 当成第 265 题，静默定位到错的一本书上。
  it('带前缀的题号不会被空前缀那本抢走', () => {
    const bare = books.find((b) => b.prefix === '')
    const pref = books.find((b) => b.prefix !== '')
    if (!bare || !pref) return                       // 示例目录只有一本，跳过
    const g = pref.units[0].groups[0]
    const hit = locate(`${pref.prefix}${g.from}`)
    expect(hit?.book.id).toBe(pref.id)
  })

  it('两本书的同一个裸数字解析到不同的书', () => {
    const bare = books.find((b) => b.prefix === '')
    const pref = books.find((b) => b.prefix !== '')
    if (!bare || !pref) return
    const g = pref.units[0].groups[0]
    const a = locate(String(g.from))                 // 裸数字 → 无前缀那本
    const b = locate(`${pref.prefix}${g.from}`)
    if (a) expect(a.book.id).toBe(bare.id)
    expect(b.book.id).toBe(pref.id)
  })
})

group('辅助函数', () => {
  it('bookOf 认得每个 id，认不得的回落到第一本', () => {
    for (const b of books) expect(bookOf(b.id).id).toBe(b.id)
    expect(bookOf('没有这本书').id).toBe(books[0].id)
  })

  it('describe 对目录内题号给出非空描述，对目录外给 null', () => {
    const g = books[0].units[0].groups[0]
    expect(describe(`${books[0].prefix}${g.from}`)).toBeTruthy()
    expect(describe('有眼杀无眼-248')).toBeNull()
  })

  it('catalogSummary 不为空', () => {
    expect(catalogSummary()).toBeTruthy()
  })
})
