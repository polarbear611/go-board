// 终局数子（中国规则）：活子 + 围空
// 纯函数，独立实现洪水填充，避免改动 goRules.js

const SIZE = 19

function getNeighbors(row, col) {
  const n = []
  if (row > 0)        n.push([row - 1, col])
  if (row < SIZE - 1) n.push([row + 1, col])
  if (col > 0)        n.push([row, col - 1])
  if (col < SIZE - 1) n.push([row, col + 1])
  return n
}

/**
 * 中国规则数子。
 * @param {Array} board      19×19，[row][col] 为 'black'|'white'|null
 * @param {Set<string>} deadStones  被标记为死的棋子位置（`${row}-${col}`）
 * @param {number} komi      贴目，默认 7.5
 * @returns {{
 *   blackArea: number, whiteArea: number, dame: number,
 *   komi: number, margin: number, winner: 'black'|'white'|'draw', winBy: number,
 *   territory: Array  // 19×19，每点 'black'|'white'|'dame'|null
 * }}
 */
export function computeScore(board, deadStones = new Set(), komi = 7.5) {
  // 1) effectiveBoard：死子被提（置 null）
  const eff = board.map((rowArr, r) =>
    rowArr.map((cell, c) => (deadStones.has(`${r}-${c}`) ? null : cell))
  )

  // territory：默认全 null（棋子点保持 null，空点稍后填归属）
  const territory = Array.from({ length: SIZE }, () => Array(SIZE).fill(null))

  let blackArea = 0
  let whiteArea = 0
  let dame = 0

  // 统计活子数（effectiveBoard 上的棋子）
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (eff[r][c] === 'black') blackArea++
      else if (eff[r][c] === 'white') whiteArea++
    }
  }

  // 2) 对空点连通区域洪水填充，判断归属
  const visited = Array.from({ length: SIZE }, () => Array(SIZE).fill(false))

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (eff[r][c] !== null || visited[r][c]) continue

      // 收集一个空区域 + 其接触到的颜色集合
      const region = []
      const colors = new Set()
      const stack = [[r, c]]
      visited[r][c] = true

      while (stack.length) {
        const [cr, cc] = stack.pop()
        region.push([cr, cc])
        for (const [nr, nc] of getNeighbors(cr, cc)) {
          const v = eff[nr][nc]
          if (v === null) {
            if (!visited[nr][nc]) {
              visited[nr][nc] = true
              stack.push([nr, nc])
            }
          } else {
            colors.add(v)
          }
        }
      }

      let owner
      if (colors.size === 1) {
        owner = colors.has('black') ? 'black' : 'white'
      } else {
        // size === 0（空盘）或 size === 2（双方都接触）→ 单官
        owner = 'dame'
      }

      for (const [pr, pc] of region) {
        territory[pr][pc] = owner
      }

      if (owner === 'black') blackArea += region.length
      else if (owner === 'white') whiteArea += region.length
      else dame += region.length
    }
  }

  // 3) 贴目判定（margin 恰为 0 → 和棋）
  const margin = blackArea - whiteArea - komi
  const winner = margin > 0 ? 'black' : margin < 0 ? 'white' : 'draw'
  const winBy = Math.abs(margin)

  return { blackArea, whiteArea, dame, komi, margin, winner, winBy, territory }
}
