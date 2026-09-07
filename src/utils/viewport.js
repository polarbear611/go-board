// 棋盘视口：把「看棋盘的哪一块」表达为一个 SVG viewBox 矩形。
//
// 设计要点（改动前请先读）：
//
// 1. 视口对外永远是一个**冻结的矩形** { x, y, w, h }，不是 'fit' 这类需要
//    在渲染时读 stones 才能解析的模式名。因为 stones 就是 undo 历史，
//    模式化的 fit 会让「撤销一手」顺带改掉取景框——用不该碰视图状态的
//    操作改了视图状态。fitRect 只在用户点「适应棋形」时调用一次。
//
// 2. 矩形恒为正方形。棋盘容器是 aspect-square，而非方 viewBox 在
//    preserveAspectRatio="xMidYMid meet" 下产生的 letterbox 带**不会被裁剪**
//    （裁剪发生在 SVG 视口而非 viewBox），会漏出相邻象限的内容。
//
// 3. fitRect 用「先定边长再平移」，绝不裁剪边。先补方再裁剪会把方形裁没。

import { BOARD_SIZE, CELL_SIZE, PADDING, STONE } from '../constants/board'

// 视口留白。必须等于 PADDING：象限矩形要正好贴上棋盘外框，
// 大了会在边缘漏出页面底色，小了会切掉棋盘外框线。
export const MARGIN = PADDING

// 象限跨 10 个交叉点（0..9 或 9..18），在中心线（index 9，天元）重叠一路，
// 保证跨中线的棋形不会被切断。
export const QUADRANT_SPAN = 10
const SPAN_UNITS = (QUADRANT_SPAN - 1) * CELL_SIZE

// 象限边长。也是 fitRect 的放大上限——再往里放大就比一个角还窄了。
export const QUADRANT_SIDE = SPAN_UNITS + 2 * MARGIN
export const MIN_SIDE = QUADRANT_SIDE

export const BOARD_SPAN = PADDING * 2 + (BOARD_SIZE - 1) * CELL_SIZE

// 全盘视口
export const FULL_RECT = Object.freeze({ x: 0, y: 0, w: BOARD_SPAN, h: BOARD_SPAN })

// 适应棋形时，棋形外扩几路留白
const FIT_PAD_LINES = 2

export const QUADRANTS = ['TL', 'TR', 'BL', 'BR']

// 交叉点索引 -> SVG 用户坐标
const unit = (i) => PADDING + i * CELL_SIZE

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

/**
 * 四个象限之一的视口矩形。
 * 注意行序：内部 row 0 是**上**边（棋盘标号 19），row 18 是下边（标号 1）。
 * @param {'TL'|'TR'|'BL'|'BR'} q
 */
export function quadrantRect(q) {
  const c0 = q === 'TR' || q === 'BR' ? BOARD_SIZE - QUADRANT_SPAN : 0
  const r0 = q === 'BL' || q === 'BR' ? BOARD_SIZE - QUADRANT_SPAN : 0
  return {
    x: unit(c0) - MARGIN,
    y: unit(r0) - MARGIN,
    w: QUADRANT_SIDE,
    h: QUADRANT_SIDE,
  }
}

/**
 * 把一个正方形边长摆到棋盘范围内：**平移**，不缩边。
 * 先裁剪再补方会来回震荡，所以这里只允许平移。
 */
function placeSquare(centerX, centerY, side) {
  const s = clamp(side, MIN_SIDE, BOARD_SPAN)
  return {
    x: clamp(centerX - s / 2, 0, BOARD_SPAN - s),
    y: clamp(centerY - s / 2, 0, BOARD_SPAN - s),
    w: s,
    h: s,
  }
}

/**
 * 按当前棋子的包围盒取景。空盘回退全盘。
 *
 * 角上的题目会因为平移钳制自然吸附到棋盘边缘，不需要额外的吸附规则。
 *
 * 已知局限：贴边死活题常横跨很多列却只占 2-3 行，补方后边长逼近整盘，
 * 此时几乎不放大。角上的题目不受影响。
 *
 * @param {Array<Array<string|null>>} stones 棋盘 [row][col]
 */
export function fitRect(stones) {
  let minRow = Infinity, maxRow = -Infinity
  let minCol = Infinity, maxCol = -Infinity

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (stones[r][c] === STONE.EMPTY) continue
      if (r < minRow) minRow = r
      if (r > maxRow) maxRow = r
      if (c < minCol) minCol = c
      if (c > maxCol) maxCol = c
    }
  }

  // 空盘：没什么可取景的
  if (maxRow === -Infinity) return { ...FULL_RECT }

  // 棋形外扩留白后所需的宽高（含两侧 MARGIN）
  const spanCols = maxCol - minCol + 2 * FIT_PAD_LINES
  const spanRows = maxRow - minRow + 2 * FIT_PAD_LINES
  const needed = Math.max(spanCols, spanRows) * CELL_SIZE + 2 * MARGIN

  // 以棋形中心定位，再平移回界内
  return placeSquare(
    (unit(minCol) + unit(maxCol)) / 2,
    (unit(minRow) + unit(maxRow)) / 2,
    needed,
  )
}

/** 两个矩形是否等价（用于跳过无意义的补间） */
export function rectEquals(a, b) {
  return !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

/** 线性插值两个矩形，t ∈ [0,1]。宽高钳制 >= 1，避免奇异矩阵。 */
export function lerpRect(a, b, t) {
  const mix = (p, q) => p + (q - p) * t
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    w: Math.max(1, mix(a.w, b.w)),
    h: Math.max(1, mix(a.h, b.h)),
  }
}

/**
 * 客户端坐标 -> SVG 用户坐标的纯数学版本。
 * 运行时优先用 svg.getScreenCTM()（读实时 DOM，补间期间也不会脱节），
 * 这个纯函数是拿不到 CTM 时的兜底，也让换算逻辑可以被单测覆盖。
 */
export function clientToSvg(rect, viewBox, clientX, clientY) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  // aspect-square 容器 + xMidYMid meet：取较小缩放比，两轴一致
  const scale = Math.min(rect.width / viewBox.w, rect.height / viewBox.h)
  const drawnW = viewBox.w * scale
  const drawnH = viewBox.h * scale
  const offsetX = (rect.width - drawnW) / 2
  const offsetY = (rect.height - drawnH) / 2
  return {
    x: viewBox.x + (clientX - rect.left - offsetX) / scale,
    y: viewBox.y + (clientY - rect.top - offsetY) / scale,
  }
}

/**
 * SVG 用户坐标 -> 交叉点索引。落点超过半格容差则视为没点中。
 * 返回 null 或 { row, col }（保证是整数，见下）。
 */
export function svgToIntersection(svgX, svgY) {
  const col = Math.round((svgX - PADDING) / CELL_SIZE)
  const row = Math.round((svgY - PADDING) / CELL_SIZE)

  // 正向断言：NaN 与任何数比较都是 false，会**通过**下面的范围检查，
  // 于是返回 { row: NaN, col: NaN }，调用方 stones[NaN][NaN] 直接抛错白屏。
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null
  if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) return null

  const dx = Math.abs(svgX - unit(col))
  const dy = Math.abs(svgY - unit(row))
  if (dx > CELL_SIZE * 0.5 || dy > CELL_SIZE * 0.5) return null

  return { row, col }
}
