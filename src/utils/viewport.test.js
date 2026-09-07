import { describe, it, expect } from 'vitest'
import {
  FULL_RECT, MARGIN, MIN_SIDE, QUADRANT_SIDE, QUADRANT_SPAN, BOARD_SPAN,
  quadrantRect, fitRect, clientToSvg, svgToIntersection, lerpRect, rectEquals,
} from './viewport'
import { BOARD_SIZE, CELL_SIZE, PADDING } from '../constants/board'
import { STONE_R } from '../components/Board/Stone'

const empty = () =>
  Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null))

// 按 [row, col] 摆黑子
const withStones = (coords) => {
  const b = empty()
  coords.forEach(([r, c]) => { b[r][c] = 'black' })
  return b
}

const isSquare = (r) => r.w === r.h

// 矩形完整落在棋盘内（否则圆角处会漏出页面底色）
const inBounds = (r) =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= BOARD_SPAN && r.y + r.h <= BOARD_SPAN

describe('视口不变量', () => {
  // 这两条看起来像巧合，但是承重的
  it('V1 MARGIN === PADDING —— 象限矩形要正好贴住棋盘外框', () => {
    expect(MARGIN).toBe(PADDING)
    // TL 左上角贴 0，BR 右下角贴满 BOARD_SPAN
    expect(quadrantRect('TL').x).toBe(0)
    const br = quadrantRect('BR')
    expect(br.x + br.w).toBe(BOARD_SPAN)
  })

  it('V2 MARGIN > STONE_R —— 中心线切边处不会切出半颗棋子', () => {
    expect(MARGIN).toBeGreaterThan(STONE_R)
  })

  // 曾经踩过：PADDING=32 时行标注中心 x=18 落在 A 列棋子半径 18.4 之内，
  // 只要 A 列/1 路有子就会被压住，自适应放大后尤其明显。
  it('V3 坐标标注不与首行/首列的棋子重叠', () => {
    const LABEL_INSET = 14   // 与 BoardLabels.jsx 保持一致
    const LABEL_HALF_W = 5.5 // 两位数字标注的半宽
    // 标注右边缘必须落在棋子左边缘之前
    expect(LABEL_INSET + LABEL_HALF_W).toBeLessThan(PADDING - STONE_R)
  })
})

describe('quadrantRect', () => {
  it('Q1 四个象限均为正方形且不越界', () => {
    for (const q of ['TL', 'TR', 'BL', 'BR']) {
      const r = quadrantRect(q)
      expect(isSquare(r)).toBe(true)
      expect(r.w).toBe(QUADRANT_SIDE)
      expect(inBounds(r)).toBe(true)
    }
  })

  it('Q2 左右象限在中心线（天元 index 9）重叠一路，棋形不被切断', () => {
    const tl = quadrantRect('TL')
    const tr = quadrantRect('TR')
    // 中心线交叉点的用户坐标
    const center = PADDING + 9 * CELL_SIZE
    // 两个象限都必须含住中心线
    expect(tl.x).toBeLessThanOrEqual(center)
    expect(tl.x + tl.w).toBeGreaterThanOrEqual(center)
    expect(tr.x).toBeLessThanOrEqual(center)
    expect(tr.x + tr.w).toBeGreaterThanOrEqual(center)
    expect(QUADRANT_SPAN).toBe(10)
  })

  it('Q3 行序：TL 在上（含 row 0），BL 在下（含 row 18）', () => {
    expect(quadrantRect('TL').y).toBe(0)
    const bl = quadrantRect('BL')
    expect(bl.y + bl.h).toBe(BOARD_SPAN)
  })
})

describe('fitRect', () => {
  it('F1 空盘回退全盘', () => {
    expect(fitRect(empty())).toEqual({ ...FULL_RECT })
  })

  it('F2 先定边长再平移 —— 贴角棋形不会被裁成非方形', () => {
    // 这是「先补方再裁剪」会失败的反例：棋子贴右上角
    // 外扩后向右越界，若先补方再裁剪会得到 5×7 的非方矩形
    const r = fitRect(withStones([[0, 14], [1, 16], [2, 18]]))
    expect(isSquare(r)).toBe(true)
    expect(inBounds(r)).toBe(true)
  })

  it('F3 单颗棋子不会放大过头（受 MIN_SIDE 下限保护）', () => {
    const r = fitRect(withStones([[9, 9]]))
    expect(r.w).toBe(MIN_SIDE)
    expect(isSquare(r)).toBe(true)
  })

  it('F4 角上题目吸附到棋盘边缘 —— 平移钳制天然产生，无需额外规则', () => {
    // 题535 的棋形：左下角 B1..H5 一带
    const r = fitRect(withStones([
      [18, 1], [18, 3], [17, 2], [16, 1], [16, 6], [14, 1],
    ]))
    expect(r.x).toBe(0)                    // 吸住左边缘
    expect(r.y + r.h).toBe(BOARD_SPAN)     // 吸住下边缘
    expect(isSquare(r)).toBe(true)
  })

  it('F5 满盘棋形退回全盘，且不越界', () => {
    const r = fitRect(withStones([[0, 0], [18, 18]]))
    expect(r).toEqual({ ...FULL_RECT })
  })

  it('F6 任意随机棋形都恒为正方形且不越界', () => {
    for (let i = 0; i < 200; i++) {
      const n = 1 + Math.floor(Math.random() * 6)
      const coords = Array.from({ length: n }, () => [
        Math.floor(Math.random() * BOARD_SIZE),
        Math.floor(Math.random() * BOARD_SIZE),
      ])
      const r = fitRect(withStones(coords))
      expect(isSquare(r)).toBe(true)
      expect(inBounds(r)).toBe(true)
      expect(r.w).toBeGreaterThanOrEqual(MIN_SIDE)
    }
  })
})

describe('svgToIntersection', () => {
  it('S1 交叉点正中命中', () => {
    expect(svgToIntersection(PADDING, PADDING)).toEqual({ row: 0, col: 0 })
    const p = PADDING + 9 * CELL_SIZE
    expect(svgToIntersection(p, p)).toEqual({ row: 9, col: 9 })
  })

  it('S2 超过半格容差判为未命中', () => {
    // 正好落在两个交叉点中间
    expect(svgToIntersection(PADDING + CELL_SIZE * 0.5, PADDING)).not.toBeNull()
    // 盘外
    expect(svgToIntersection(-500, -500)).toBeNull()
  })

  it('S3 NaN 必须被拦下 —— NaN 与任何数比较都为 false，会溜过范围检查', () => {
    expect(svgToIntersection(NaN, NaN)).toBeNull()
    expect(svgToIntersection(NaN, PADDING)).toBeNull()
    expect(svgToIntersection(PADDING, NaN)).toBeNull()
    expect(svgToIntersection(Infinity, Infinity)).toBeNull()
  })
})

describe('clientToSvg', () => {
  const rect = { left: 0, top: 0, width: 640, height: 640 }

  it('C1 全盘视口下，容器中心映射到棋盘中心', () => {
    const p = clientToSvg(rect, FULL_RECT, 320, 320)
    expect(p.x).toBeCloseTo(BOARD_SPAN / 2)
    expect(p.y).toBeCloseTo(BOARD_SPAN / 2)
  })

  it('C2 象限视口下，点击换算随 viewBox 原点平移', () => {
    const br = quadrantRect('BR')
    // 容器左上角 = viewBox 原点
    const p = clientToSvg(rect, br, 0, 0)
    expect(p.x).toBeCloseTo(br.x)
    expect(p.y).toBeCloseTo(br.y)
  })

  it('C3 缩放后同一交叉点仍解析为同一坐标（回归防线）', () => {
    const bl = quadrantRect('BL')
    // 左下象限里的 A1（row 18, col 0）
    const targetX = PADDING + 0 * CELL_SIZE
    const targetY = PADDING + 18 * CELL_SIZE
    // 反推它在容器里的像素位置
    const scale = 640 / bl.w
    const px = (targetX - bl.x) * scale
    const py = (targetY - bl.y) * scale
    const p = clientToSvg(rect, bl, px, py)
    expect(svgToIntersection(p.x, p.y)).toEqual({ row: 18, col: 0 })
  })

  it('C4 宽高为 0 的容器返回 null，不产生 NaN', () => {
    expect(clientToSvg({ left: 0, top: 0, width: 0, height: 0 }, FULL_RECT, 5, 5)).toBeNull()
  })
})

describe('lerpRect / rectEquals', () => {
  it('L1 端点精确，宽度不会插值出 0', () => {
    const a = FULL_RECT
    const b = quadrantRect('BR')
    expect(rectEquals(lerpRect(a, b, 0), a)).toBe(true)
    expect(rectEquals(lerpRect(a, b, 1), b)).toBe(true)
    for (let t = 0; t <= 1; t += 0.1) {
      expect(lerpRect(a, b, t).w).toBeGreaterThanOrEqual(1)
    }
  })
})
