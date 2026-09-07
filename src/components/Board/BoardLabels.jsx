import {
  CELL_SIZE, PADDING, COL_LABELS, ROW_LABELS, LINE_COLOR, BOARD_COLOR,
} from '../../constants/board'

// 标注中心离视口边缘的距离。
// 不再由 PADDING 推导 —— 正是那个耦合让标注被推进了棋子半径里。
// 约束：LABEL_INSET + 标注半宽(≈5.5) < PADDING - 棋子半径(18.4)。
// 当前 PADDING=44 ⇒ 上限 20.1，取 14 两边都留有余量。
const LABEL_INSET = 14
const FONT_SIZE = 11

// 衬底条厚度：视口边缘是棋盘内部切边时，标注会压在格线上，需要衬一层
const STRIP = 26

/**
 * 坐标标注（列 A-T 跳过 I，行 19-1）。
 *
 * 标注条**钉在视口边缘**而非棋盘边缘：缩放到左下象限后，钉在棋盘上边的
 * 列标会落到 viewBox 之外直接消失。钉在视口边缘则任意视口都有坐标可读。
 *
 * 字号保持 11 用户单位不变 —— 缩放时整个 SVG 一起放大，标注自然跟着变大，
 * 这里再调大反而会在象限视图里过头。
 */
function BoardLabels({ viewRect }) {
  const { x: vx, y: vy, w: vw, h: vh } = viewRect

  // 视口边缘落在棋盘内部（而非外框留白）时才需要衬底
  const needTopStrip = vy > 0
  const needLeftStrip = vx > 0

  // 只画落在视口内的标注
  const visible = (pos, lo, hi) => pos >= lo - CELL_SIZE && pos <= hi + CELL_SIZE

  const colY = vy + LABEL_INSET
  const rowX = vx + LABEL_INSET

  return (
    <g style={{ pointerEvents: 'none' }}>
      {needTopStrip && (
        <rect x={vx} y={vy} width={vw} height={STRIP} fill={BOARD_COLOR} opacity={0.92} />
      )}
      {needLeftStrip && (
        <rect x={vx} y={vy} width={STRIP} height={vh} fill={BOARD_COLOR} opacity={0.92} />
      )}

      <g
        fill={LINE_COLOR}
        fontSize={FONT_SIZE}
        fontFamily="var(--font-mono), ui-monospace, monospace"
        textAnchor="middle"
        dominantBaseline="central"
        opacity={0.8}
      >
        {/* 列标注：钉在视口上边 */}
        {COL_LABELS.map((label, i) => {
          const x = PADDING + i * CELL_SIZE
          if (!visible(x, vx, vx + vw)) return null
          return <text key={`col-${i}`} x={x} y={colY}>{label}</text>
        })}

        {/* 行标注：钉在视口左边 */}
        {ROW_LABELS.map((label, i) => {
          const y = PADDING + i * CELL_SIZE
          if (!visible(y, vy, vy + vh)) return null
          return <text key={`row-${i}`} x={rowX} y={y}>{label}</text>
        })}
      </g>
    </g>
  )
}

export default BoardLabels
