import { BOARD_SIZE, CELL_SIZE, PADDING, STAR_POINTS, LINE_COLOR } from '../../constants/board'

// 渲染棋盘格线与星位
function BoardGrid() {
  const lineEnd = PADDING + (BOARD_SIZE - 1) * CELL_SIZE

  return (
    <g>
      {/* 横线与竖线 */}
      {Array.from({ length: BOARD_SIZE }, (_, i) => {
        const pos = PADDING + i * CELL_SIZE
        return (
          <g key={i}>
            <line
              x1={PADDING} y1={pos}
              x2={lineEnd}  y2={pos}
              stroke={LINE_COLOR}
              strokeWidth={i === 0 || i === BOARD_SIZE - 1 ? 2.6 : 0.8}
            />
            <line
              x1={pos} y1={PADDING}
              x2={pos} y2={lineEnd}
              stroke={LINE_COLOR}
              strokeWidth={i === 0 || i === BOARD_SIZE - 1 ? 2.6 : 0.8}
            />
          </g>
        )
      })}

      {/* 星位（天元 + 八个角星） */}
      {STAR_POINTS.map(([row, col]) => (
        <circle
          key={`star-${row}-${col}`}
          cx={PADDING + col * CELL_SIZE}
          cy={PADDING + row * CELL_SIZE}
          r={4.2}
          fill={LINE_COLOR}
        />
      ))}
    </g>
  )
}

export default BoardGrid
