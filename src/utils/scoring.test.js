import { describe, it, expect } from 'vitest'
import { computeScore } from './scoring.js'

// 生成 19×19 全 null 棋盘
function makeBoard() {
  return Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null))
}

describe('computeScore — 中国规则数子', () => {
  // C1 一道竖直墙把棋盘分割：左侧只接触黑 → 黑地；右侧用一道白墙 → 白地。
  // 黑墙占满第 9 列（col=9）全部 19 个交叉点；白墙占满第 13 列（col=13）全部 19 点。
  // - col 0..8（9 列 × 19 = 171 空点）只接触黑墙 → 黑地。
  // - col 9 = 黑活子 19。
  // - col 10..12（3 列 × 19 = 57 空点）同时接触黑墙(col9)与白墙(col13) → 单官。
  // - col 13 = 白活子 19。
  // - col 14..18（5 列 × 19 = 95 空点）只接触白墙 → 白地。
  it('C1 竖墙分割：单侧接触算地，两侧接触为单官', () => {
    const board = makeBoard()
    for (let r = 0; r < 19; r++) {
      board[r][9] = 'black'
      board[r][13] = 'white'
    }
    const { blackArea, whiteArea, dame, territory } = computeScore(board, new Set(), 7.5)

    // 黑：左侧 171 空地 + 19 活子 = 190
    expect(blackArea).toBe(171 + 19)
    // 白：右侧 95 空地 + 19 活子 = 114
    expect(whiteArea).toBe(95 + 19)
    // 单官：中间 57
    expect(dame).toBe(57)

    // 抽查 territory 归属
    expect(territory[0][0]).toBe('black')   // 左侧空点
    expect(territory[0][9]).toBe(null)      // 黑棋子点
    expect(territory[0][11]).toBe('dame')   // 中间夹层
    expect(territory[0][13]).toBe(null)     // 白棋子点
    expect(territory[0][18]).toBe('white')  // 右侧空点
  })

  // C2 黑在左上角围出一块目，双方各有活子。
  // 黑墙：(0,2),(1,2),(2,0),(2,1),(2,2) 围住左上 2×2 角 (0,0)(0,1)(1,0)(1,1) → 4 目黑地。
  // 黑墙子数 = 5。白：在 (18,18)(18,17) 放两子，且让棋盘其余空点变单官（需让大空区同时接触黑白）。
  // 为了精确：白同样围出一块。白墙：(16,18),(17,16),(17,17),(17,18)? 简化——
  // 这里改为：白在右下角围 1 目。白墙 (18,17),(17,18),(17,17) 围住角 (18,18) → 1 目白地。
  // 白墙子数 = 3。中间大空区同时接触黑墙与白墙 → 单官。
  it('C2 围空 = 活子 + 地，双方各有活子', () => {
    const board = makeBoard()
    // 黑围左上角 2×2 = 4 目
    board[0][2] = 'black'
    board[1][2] = 'black'
    board[2][0] = 'black'
    board[2][1] = 'black'
    board[2][2] = 'black'
    // 白围右下角 1 目
    board[18][17] = 'white'
    board[17][18] = 'white'
    board[17][17] = 'white'

    const { blackArea, whiteArea, dame } = computeScore(board, new Set(), 7.5)

    // 黑 = 5 活子 + 4 角地
    expect(blackArea).toBe(5 + 4)
    // 白 = 3 活子 + 1 角地
    expect(whiteArea).toBe(3 + 1)

    // 总交叉点 361 = blackArea + whiteArea + dame
    expect(blackArea + whiteArea + dame).toBe(361)
  })

  // C3 含死子：黑墙完全封闭左上角 2×2 角，白在角内放一颗死子。
  // 黑墙：(0,2)(1,2)(2,0)(2,1)(2,2)，角内 4 点 (0,0)(0,1)(1,0)(1,1)。
  // 白死子放 (0,0)。棋盘外部为一大片空区（只接触黑墙）。
  //
  // 不标记死子：白活子 = 1（(0,0)）。角内剩 3 空 (0,1)(1,0)(1,1) 接触黑墙+白死子 → 单官。
  // 标记 (0,0) 死子：白活子 0；角内 4 点全归黑（只接触黑）。
  // 断言相对变化：黑 +4（被提点+其余 3 点从单官转黑地），白 -1（死子被提），单官 -3。
  it('C3 标记死子后死子被提、其点归对方', () => {
    const board = makeBoard()
    board[0][2] = 'black'
    board[1][2] = 'black'
    board[2][0] = 'black'
    board[2][1] = 'black'
    board[2][2] = 'black'
    board[0][0] = 'white' // 角内白死子

    const before = computeScore(board, new Set(), 7.5)
    const after = computeScore(board, new Set(['0-0']), 7.5)

    // 白死子被提：白活子从 1 → 0
    expect(before.whiteArea).toBe(1)
    expect(after.whiteArea).toBe(0)

    // 角内 4 点全归黑：黑增加 4（含被提的死子点 + 原 3 个单官点）
    expect(after.blackArea - before.blackArea).toBe(4)
    // 单官减少 3（角内 3 点转为黑地）
    expect(before.dame - after.dame).toBe(3)

    // territory：标记前角内空点为单官，标记后归黑（含原死子点）
    expect(before.territory[0][1]).toBe('dame')
    expect(after.territory[0][0]).toBe('black')
    expect(after.territory[0][1]).toBe('black')
    expect(after.territory[1][1]).toBe('black')

    // 总点数守恒
    expect(after.blackArea + after.whiteArea + after.dame).toBe(361)
  })

  // C4 贴目判定：用 C1 的局面，blackArea=190, whiteArea=114 已知。
  it('C4 贴目与胜负判定（默认 komi 与自定义 komi）', () => {
    const board = makeBoard()
    for (let r = 0; r < 19; r++) {
      board[r][9] = 'black'
      board[r][13] = 'white'
    }

    // 默认 komi = 7.5：margin = 190 - 114 - 7.5 = 68.5，黑胜
    const a = computeScore(board, new Set(), 7.5)
    expect(a.margin).toBeCloseTo(68.5)
    expect(a.winner).toBe('black')
    expect(a.winBy).toBeCloseTo(68.5)

    // 自定义 komi = 100：margin = 190 - 114 - 100 = -24，白胜
    const b = computeScore(board, new Set(), 100)
    expect(b.margin).toBeCloseTo(-24)
    expect(b.winner).toBe('white')
    expect(b.winBy).toBeCloseTo(24)

    // komi = 76：margin = 190 - 114 - 76 = 0，和棋
    const c = computeScore(board, new Set(), 76)
    expect(c.margin).toBeCloseTo(0)
    expect(c.winner).toBe('draw')
    expect(c.winBy).toBeCloseTo(0)
  })
})
