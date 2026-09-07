import { CELL_SIZE, PADDING } from '../../constants/board'

export const STONE_R = CELL_SIZE * 0.46

// 黑子渐变 id（在 Board 的 <defs> 中定义）
const BLACK_GRAD = 'stoneBlack'
const WHITE_GRAD = 'stoneWhite'
const GHOST_BLACK = 'ghostBlack'
const GHOST_WHITE = 'ghostWhite'

// SVG <defs> 中的渐变定义，让棋子有立体感
export function StoneDefs() {
  return (
    <defs>
      {/* 黑子：左上高光 */}
      <radialGradient id={BLACK_GRAD} cx="38%" cy="32%" r="60%">
        <stop offset="0%" stopColor="#6b6b6b" />
        <stop offset="45%" stopColor="#1a1a1a" />
        <stop offset="100%" stopColor="#000" />
      </radialGradient>
      {/* 白子：左上高光 */}
      <radialGradient id={WHITE_GRAD} cx="38%" cy="32%" r="60%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="55%" stopColor="#e8e8e8" />
        <stop offset="100%" stopColor="#c0c0c0" />
      </radialGradient>
      {/* 幽灵预览：半透明 */}
      <radialGradient id={GHOST_BLACK} cx="38%" cy="32%" r="60%">
        <stop offset="0%" stopColor="#666" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.4" />
      </radialGradient>
      <radialGradient id={GHOST_WHITE} cx="38%" cy="32%" r="60%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#bbb" stopOpacity="0.4" />
      </radialGradient>
    </defs>
  )
}

// 终局死子叉号标记（明显的 ✕，与棋色对比）
function DeadCross({ cx, cy, color }) {
  const r = STONE_R * 0.55
  const stroke = color === 'black' ? '#ff6b6b' : '#d63333'
  return (
    <g style={{ pointerEvents: 'none' }}>
      <line x1={cx - r} y1={cy - r} x2={cx + r} y2={cy + r} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={cx - r} y1={cy + r} x2={cx + r} y2={cy - r} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />
    </g>
  )
}

// 实体棋子（moveNum 有值时在棋子上显示步序数字；dead=true 时半透明 + 叉号）
export function Stone({ row, col, color, moveNum, dead = false }) {
  const cx = PADDING + col * CELL_SIZE
  const cy = PADDING + row * CELL_SIZE
  const grad = color === 'black' ? `url(#${BLACK_GRAD})` : `url(#${WHITE_GRAD})`
  const stroke = color === 'black' ? '#111' : '#888'

  if (dead) {
    return (
      <g style={{ pointerEvents: 'none', opacity: 0.4 }}>
        <circle
          cx={cx} cy={cy} r={STONE_R}
          fill={grad}
          stroke={stroke}
          strokeWidth={color === 'white' ? 1 : 0.5}
        />
        <DeadCross cx={cx} cy={cy} color={color} />
      </g>
    )
  }

  if (!moveNum) {
    return (
      <circle
        cx={cx} cy={cy} r={STONE_R}
        fill={grad}
        stroke={stroke}
        strokeWidth={color === 'white' ? 1 : 0.5}
        style={{ pointerEvents: 'none' }}
      />
    )
  }

  const fontSize = moveNum < 10 ? CELL_SIZE * 0.38 : moveNum < 100 ? CELL_SIZE * 0.30 : CELL_SIZE * 0.23
  const textFill = color === 'black' ? '#fff' : '#1a1a1a'

  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle
        cx={cx} cy={cy} r={STONE_R}
        fill={grad}
        stroke={stroke}
        strokeWidth={color === 'white' ? 1 : 0.5}
      />
      <text
        x={cx} y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight="600"
        fill={textFill}
        style={{ userSelect: 'none', fontFamily: 'system-ui, sans-serif' }}
      >
        {moveNum}
      </text>
    </g>
  )
}

// 落子预览（鼠标悬浮时的幽灵棋子）
export function GhostStone({ row, col, color }) {
  const cx = PADDING + col * CELL_SIZE
  const cy = PADDING + row * CELL_SIZE
  const grad = color === 'black' ? `url(#${GHOST_BLACK})` : `url(#${GHOST_WHITE})`
  const stroke = color === 'black' ? '#000' : '#aaa'

  return (
    <circle
      cx={cx} cy={cy} r={STONE_R}
      fill={grad}
      stroke={stroke}
      strokeWidth="0.5"
      style={{ pointerEvents: 'none' }}
    />
  )
}
