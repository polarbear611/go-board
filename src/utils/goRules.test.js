import { describe, it, expect } from 'vitest'
import { applyMove, boardEquals, serializeBoard } from './goRules.js'

// 生成 19×19 全 null 棋盘
function makeBoard() {
  return Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null))
}

describe('applyMove', () => {
  // U1 角上单子被提：黑(0,0)只剩两口气(1,0)和(0,1)，白封住后被提。
  it('U1 角上单子被提', () => {
    const board = makeBoard()
    board[0][0] = 'black'   // 角上黑子
    board[1][0] = 'white'   // 已封住一口气
    // 白落 (0,1) 封住黑(0,0)的最后一口气
    const res = applyMove(board, 0, 1, 'white', null)
    expect(res.valid).toBe(true)
    expect(res.captured).toBe(1)
    expect(res.newBoard[0][0]).toBe(null)
    expect(res.newBoard[0][1]).toBe('white')
  })

  // U2 整块被提：黑两子 (0,0)(0,1) 连通块被白包围，最后一手提两子。
  it('U2 整块被提', () => {
    const board = makeBoard()
    board[0][0] = 'black'
    board[0][1] = 'black'
    // 黑块的气：(1,0)、(1,1)、(0,2)
    board[1][0] = 'white'
    board[1][1] = 'white'
    // 白落 (0,2) 封住最后一口气
    const res = applyMove(board, 0, 2, 'white', null)
    expect(res.valid).toBe(true)
    expect(res.captured).toBe(2)
    expect(res.newBoard[0][0]).toBe(null)
    expect(res.newBoard[0][1]).toBe(null)
    expect(res.newBoard[0][2]).toBe('white')
  })

  // U3 自杀禁手：白被四颗黑子包围的空点，落子后无气且不提子。
  it('U3 自杀禁手', () => {
    const board = makeBoard()
    // 在 (5,5) 周围摆黑子，白落 (5,5) 自杀
    board[4][5] = 'black'
    board[6][5] = 'black'
    board[5][4] = 'black'
    board[5][6] = 'black'
    const res = applyMove(board, 5, 5, 'white', null)
    expect(res.valid).toBe(false)
    expect(res.reason).toBe('suicide')
  })

  // U4 提子后有气则合法：白(0,0)只剩一口气在(0,1)，黑落(0,1)提掉白子，
  // 黑(0,1)因提子获得(0,0)这口气而存活。
  it('U4 提子后有气则合法', () => {
    const board = makeBoard()
    board[0][0] = 'white'   // 角上白单子
    board[1][0] = 'black'   // 封住一口气
    // 黑落 (0,1) 提掉白(0,0)；提子前黑(0,1)看似被白(0,0)挡住，
    // 但提掉白子后 (0,0) 成空，黑(0,1)有气 → 合法
    const res = applyMove(board, 0, 1, 'black', null)
    expect(res.valid).toBe(true)
    expect(res.captured).toBeGreaterThanOrEqual(1)
    expect(res.newBoard[0][0]).toBe(null)
    expect(res.newBoard[0][1]).toBe('black')
  })

  // U5 占用点
  it('U5 占用点', () => {
    const board = makeBoard()
    board[3][3] = 'black'
    const res = applyMove(board, 3, 3, 'white', null)
    expect(res.valid).toBe(false)
    expect(res.reason).toBe('occupied')
  })

  // U6 单劫禁手 + U7 劫后可回提（严格单劫构造）
  it('U6 单劫禁手回提被禁，U7 非同形可回提', () => {
    // 标准单劫形（中心 (5,5)/(5,6) 互咬）：
    //   白(5,6) 外邻 (4,6)=B,(6,6)=B,(5,7)=B → 仅 (5,5) 一气
    //   黑落 (5,5) 外邻 (4,5)=W,(6,5)=W,(5,4)=W → 提白后仅 (5,6) 一气
    const board = makeBoard()
    board[4][5] = 'white'
    board[6][5] = 'white'
    board[5][4] = 'white'
    board[4][6] = 'black'
    board[6][6] = 'black'
    board[5][7] = 'black'
    board[5][6] = 'white'  // 白子，仅 (5,5) 一气
    // (5,5) 空。黑落 (5,5) → 提白(5,6)。
    // 黑(5,5) 外邻 (4,5)=W,(6,5)=W,(5,4)=W 全白，唯 (5,6) 提空后成气 → 合法单劫
    // 黑落子前局面（白回提若复原它即为劫）
    const prevForBlack = serializeBoard(board)
    const blackMove = applyMove(board, 5, 5, 'black', [prevForBlack])
    expect(blackMove.valid).toBe(true)
    expect(blackMove.captured).toBe(1)
    expect(blackMove.newBoard[5][6]).toBe(null)
    expect(blackMove.newBoard[5][5]).toBe('black')

    // U6 现在白想在 (5,6) 回提黑(5,5)。
    // positionHistory 含「黑落子前局面」，白回提将复原它 → ko 禁手。
    const afterBlack = blackMove.newBoard
    const koHistory = [prevForBlack, serializeBoard(afterBlack)]
    const whiteRetake = applyMove(afterBlack, 5, 6, 'white', koHistory)
    expect(whiteRetake.valid).toBe(false)
    expect(whiteRetake.reason).toBe('ko')

    // U7 劫后可回提：若 positionHistory 不含回提后的局面（例如黑在别处先落子，
    // 历史里没有那个同形局面），回提合法。
    const historyWithout = [serializeBoard(afterBlack)] // 不含 prevForBlack
    const whiteRetake2 = applyMove(afterBlack, 5, 6, 'white', historyWithout)
    expect(whiteRetake2.valid).toBe(true)
    expect(whiteRetake2.captured).toBe(1)
    expect(whiteRetake2.newBoard[5][5]).toBe(null)
    expect(whiteRetake2.newBoard[5][6]).toBe('white')
  })

  // S1 superko：落子后与历史中某个非相邻手局面同形 → ko
  it('S1 superko 同形再现被禁', () => {
    // 复用单劫形：黑落 (5,5) 提白(5,6)，得到局面 X。
    const board = makeBoard()
    board[4][5] = 'white'
    board[6][5] = 'white'
    board[5][4] = 'white'
    board[4][6] = 'black'
    board[6][6] = 'black'
    board[5][7] = 'black'
    board[5][6] = 'white'
    const blackMove = applyMove(board, 5, 5, 'black', [serializeBoard(board)])
    expect(blackMove.valid).toBe(true)
    const positionX = serializeBoard(blackMove.newBoard)

    // 假设后续在棋盘别处发生了若干手（这里直接构造一个含 positionX 的历史，
    // 且这个局面并非「上一手」），现在某手落子又将复现 positionX：
    // 从 afterBlack 出发白回提，得到的局面正是 board 形态（被白(5,6)占、黑(5,5)空）。
    // 我们让历史里包含「白回提后的那个局面」，再让另一手复现它。
    const afterBlack = blackMove.newBoard
    // 白在 (5,6) 回提 → 复原 board 形态
    const whiteRetakeBoard = afterBlack.map(r => [...r])
    whiteRetakeBoard[5][6] = 'white'
    whiteRetakeBoard[5][5] = null
    const positionY = serializeBoard(whiteRetakeBoard)

    // 历史中包含 positionY（一个非相邻手的旧局面）以及一些其它字符串
    const history = [positionY, 'someUnrelatedStateString', positionX]
    // 从 afterBlack 落 (5,6) 回提将复现 positionY → ko
    const retake = applyMove(afterBlack, 5, 6, 'white', history)
    expect(retake.valid).toBe(false)
    expect(retake.reason).toBe('ko')
  })

  // S3 不误伤：相似但 serialize 不同的局面 → 合法
  it('S3 相似但不同形不误伤', () => {
    const board = makeBoard()
    board[4][5] = 'white'
    board[6][5] = 'white'
    board[5][4] = 'white'
    board[4][6] = 'black'
    board[6][6] = 'black'
    board[5][7] = 'black'
    board[5][6] = 'white'
    const blackMove = applyMove(board, 5, 5, 'black', [serializeBoard(board)])
    expect(blackMove.valid).toBe(true)
    const afterBlack = blackMove.newBoard

    // 历史里只有「相似但不同形」的局面（多放一颗无关子），白回提不会命中
    const similarButDifferent = board.map(r => [...r])
    similarButDifferent[0][0] = 'black' // 角上多一子 → 不同形
    const history = [serializeBoard(similarButDifferent), serializeBoard(afterBlack)]
    const retake = applyMove(afterBlack, 5, 6, 'white', history)
    expect(retake.valid).toBe(true)
    expect(retake.captured).toBe(1)
    expect(retake.newBoard[5][5]).toBe(null)
    expect(retake.newBoard[5][6]).toBe('white')
  })
})

describe('serializeBoard', () => {
  it('空盘 / 含黑白子的盘 结果稳定且可区分', () => {
    const empty = makeBoard()
    const s1 = serializeBoard(empty)
    const s2 = serializeBoard(makeBoard())
    // 空盘稳定：长度 = 19*19，全 '.'
    expect(s1.length).toBe(19 * 19)
    expect(s1).toBe(s2)
    expect(s1).toBe('.'.repeat(19 * 19))

    const withStones = makeBoard()
    withStones[3][3] = 'black'
    withStones[4][4] = 'white'
    const s3 = serializeBoard(withStones)
    // 与空盘可区分
    expect(s3).not.toBe(s1)
    // 稳定（同输入同输出）
    expect(serializeBoard(withStones)).toBe(s3)
    // 对应格子正确
    expect(s3[3 * 19 + 3]).toBe('b')
    expect(s3[4 * 19 + 4]).toBe('w')

    // 异色可区分
    const diff = makeBoard()
    diff[3][3] = 'white'
    diff[4][4] = 'black'
    expect(serializeBoard(diff)).not.toBe(s3)
  })
})

describe('boardEquals', () => {
  // U8
  it('U8 同形返回 true，异形返回 false', () => {
    const a = makeBoard()
    a[3][3] = 'black'
    a[4][4] = 'white'
    const b = makeBoard()
    b[3][3] = 'black'
    b[4][4] = 'white'
    expect(boardEquals(a, b)).toBe(true)

    const c = makeBoard()
    c[3][3] = 'black'
    c[4][4] = 'black' // 异色
    expect(boardEquals(a, c)).toBe(false)

    const d = makeBoard()
    d[3][3] = 'black'
    // d 缺少 (4,4)
    expect(boardEquals(a, d)).toBe(false)
  })
})
