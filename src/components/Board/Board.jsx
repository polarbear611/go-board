import { useRef, useState, useEffect } from 'react'
import { BOARD_COLOR, CELL_SIZE, PADDING } from '../../constants/board'
import {
  FULL_RECT, BOARD_SPAN, clientToSvg, svgToIntersection, lerpRect, rectEquals,
} from '../../utils/viewport'
import BoardGrid from './BoardGrid'
import BoardLabels from './BoardLabels'
import { Stone, GhostStone, StoneDefs } from './Stone'

const TWEEN_MS = 180

// 终局地域小标记：黑地黑点 / 白地白点 / 单官淡灰点（叠在空交叉点上）
function TerritoryMark({ row, col, owner }) {
  const cx = PADDING + col * CELL_SIZE
  const cy = PADDING + row * CELL_SIZE
  const r = CELL_SIZE * 0.14
  if (owner === 'black') {
    return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill="#111" opacity={0.85} rx={1} />
  }
  if (owner === 'white') {
    return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill="#fafafa" opacity={0.9} rx={1} stroke="#888" strokeWidth={0.5} />
  }
  // dame 单官：淡灰小点
  return <circle cx={cx} cy={cy} r={r * 0.55} fill="#777" opacity={0.5} />
}

function Board({
  stones, mode, moveNumMap = {}, onIntersectionClick, invalidMsg, onClearMsg,
  deadStones = null, territory = null, viewport = FULL_RECT,
}) {
  const svgRef = useRef(null)
  const [hover, setHover] = useState(null)
  const [shake, setShake] = useState(false)

  // 视口补间。目标矩形由外部给定，这里只负责把当前矩形推过去。
  // 经 React state 驱动而非直接 setAttribute —— 后者会让补间期间的
  // 命中测试与画面脱节。
  const [viewRect, setViewRect] = useState(viewport)
  const tweenRef = useRef(null)

  useEffect(() => {
    const from = tweenRef.current?.current ?? viewRect
    if (rectEquals(from, viewport)) return

    if (tweenRef.current) cancelAnimationFrame(tweenRef.current.raf)
    const start = performance.now()
    const state = { current: from, raf: 0 }
    tweenRef.current = state

    const step = (now) => {
      const t = Math.min(1, (now - start) / TWEEN_MS)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      state.current = lerpRect(from, viewport, eased)
      setViewRect(state.current)
      if (t < 1) {
        state.raf = requestAnimationFrame(step)
      } else {
        tweenRef.current = null
      }
    }
    state.raf = requestAnimationFrame(step)

    return () => cancelAnimationFrame(state.raf)
    // viewRect 有意不入依赖：它是补间的产物，入依赖会自我触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport])

  // 非法落子时短暂抖动 + 清除提示
  useEffect(() => {
    if (!invalidMsg) return
    setShake(true)
    const t = setTimeout(() => { setShake(false); onClearMsg?.() }, 600)
    return () => clearTimeout(t)
  }, [invalidMsg, onClearMsg])

  // 客户端坐标 -> 交叉点。
  // 优先用 getScreenCTM()：它读实时 DOM，viewBox 原点/缩放/letterbox 全部
  // 天然处理，补间期间也不会与画面脱节。拿不到 CTM 时退回纯数学换算。
  function clientToIntersection(clientX, clientY) {
    const svg = svgRef.current
    if (!svg) return null

    const ctm = typeof svg.getScreenCTM === 'function' ? svg.getScreenCTM() : null
    // 奇异矩阵的 inverse() 不抛错，而是返回全 NaN —— 交给 svgToIntersection 拦下
    const p = ctm
      ? new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
      : clientToSvg(svg.getBoundingClientRect(), viewRect, clientX, clientY)
    if (!p) return null

    return svgToIntersection(p.x, p.y)
  }

  const cursor = mode === 'erase' ? 'crosshair' : 'default'
  const showGhost = hover && mode !== 'erase' && stones[hover.row][hover.col] === null

  // 非法落子提示文字
  const msgText = invalidMsg === 'ko' ? '打劫' : invalidMsg === 'suicide' ? '禁入点' : null

  return (
    <div className="w-full mx-auto aspect-square select-none relative">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`${viewRect.x} ${viewRect.y} ${viewRect.w} ${viewRect.h}`}
        // 显式写出：viewport.js 保证矩形恒为正方形，正是为了配合它。
        // 非方矩形在 meet 下的 letterbox 带不会被裁剪，会漏出相邻象限。
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          cursor,
          display: 'block',
          animation: shake ? 'board-shake 0.35s ease' : 'none',
        }}
        onClick={(e) => {
          const pos = clientToIntersection(e.clientX, e.clientY)
          if (pos) onIntersectionClick(pos.row, pos.col)
        }}
        onMouseMove={(e) => setHover(clientToIntersection(e.clientX, e.clientY))}
        onMouseLeave={() => setHover(null)}
        // 触屏会先合成一次 mousemove 再 click，导致幽灵子点完就赖在屏幕上
        onPointerDown={(e) => { if (e.pointerType !== 'mouse') setHover(null) }}
      >
        <StoneDefs />
        <rect width={BOARD_SPAN} height={BOARD_SPAN} fill={BOARD_COLOR} rx={6} />
        <BoardGrid />
        {stones.map((rowArr, ri) =>
          rowArr.map((color, ci) =>
            color ? (
              <Stone
                key={`${ri}-${ci}`}
                row={ri} col={ci} color={color}
                moveNum={moveNumMap[`${ri}-${ci}`]}
                dead={deadStones ? deadStones.has(`${ri}-${ci}`) : false}
              />
            ) : null
          )
        )}

        {/* 终局地域叠加（仅 scoring 态传入 territory 时渲染） */}
        {territory && territory.map((rowArr, ri) =>
          rowArr.map((owner, ci) =>
            owner ? (
              <TerritoryMark key={`t-${ri}-${ci}`} row={ri} col={ci} owner={owner} />
            ) : null
          )
        )}

        {showGhost && <GhostStone row={hover.row} col={hover.col} color={mode} />}

        {/* 坐标标注钉在视口边缘，必须画在棋子之上 */}
        <BoardLabels viewRect={viewRect} />
      </svg>

      {/* 非法落子悬浮提示 */}
      {msgText && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-ink/85 text-white text-sm font-bold px-4 py-2 rounded-full">
            {msgText}，此处不能落子
          </div>
        </div>
      )}
    </div>
  )
}

export default Board
