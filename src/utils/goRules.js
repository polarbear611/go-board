const SIZE = 19

function getNeighbors(row, col) {
  const n = []
  if (row > 0)      n.push([row - 1, col])
  if (row < SIZE-1) n.push([row + 1, col])
  if (col > 0)      n.push([row, col - 1])
  if (col < SIZE-1) n.push([row, col + 1])
  return n
}

// 洪水填充找连通块
function findGroup(board, row, col) {
  const color = board[row][col]
  if (!color) return []
  const group = []
  const visited = new Set()
  const stack = [[row, col]]
  while (stack.length) {
    const [r, c] = stack.pop()
    const key = r * SIZE + c
    if (visited.has(key)) continue
    visited.add(key)
    if (board[r][c] !== color) continue
    group.push([r, c])
    for (const [nr, nc] of getNeighbors(r, c)) {
      if (!visited.has(nr * SIZE + nc)) stack.push([nr, nc])
    }
  }
  return group
}

// 检查连通块是否还有气
function hasLiberties(board, group) {
  for (const [r, c] of group) {
    for (const [nr, nc] of getNeighbors(r, c)) {
      if (board[nr][nc] === null) return true
    }
  }
  return false
}

// 比较两个棋盘是否完全相同（用于打劫判断）
export function boardEquals(a, b) {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (a[r][c] !== b[r][c]) return false
  return true
}

// 将棋盘序列化为稳定字符串（用于完整位置 superko 判定）
// 逐格拼接：黑→'b'，白→'w'，空→'.'
export function serializeBoard(board) {
  let s = ''
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      s += board[r][c] === 'black' ? 'b' : board[r][c] === 'white' ? 'w' : '.'
  return s
}

/**
 * 按围棋规则落子
 * @param {Array}  board    当前棋盘
 * @param {number} row
 * @param {number} col
 * @param {string} color    'black' | 'white'
 * @param {string[]} positionHistory 此前出现过的所有局面的 serializeBoard 字符串数组
 *                   （含起始局面、每手落子后的局面）。缺省 [] → 不触发劫。
 * @returns {{ valid: false, reason: string } | { valid: true, newBoard, captured: number }}
 */
export function applyMove(board, row, col, color, positionHistory = []) {
  if (board[row][col] !== null) return { valid: false, reason: 'occupied' }

  const newBoard = board.map(r => [...r])
  newBoard[row][col] = color
  const opponent = color === 'black' ? 'white' : 'black'

  // 提走无气的对方连通块
  let captured = 0
  const checked = new Set()
  for (const [nr, nc] of getNeighbors(row, col)) {
    if (newBoard[nr][nc] !== opponent) continue
    const key = nr * SIZE + nc
    if (checked.has(key)) continue
    const group = findGroup(newBoard, nr, nc)
    group.forEach(([r, c]) => checked.add(r * SIZE + c))
    if (!hasLiberties(newBoard, group)) {
      group.forEach(([r, c]) => { newBoard[r][c] = null })
      captured += group.length
    }
  }

  // 禁入点：落子后己方棋块仍无气（提子后如有气则合法）
  if (!hasLiberties(newBoard, findGroup(newBoard, row, col))) {
    return { valid: false, reason: 'suicide' }
  }

  // 完整位置 superko：落子后局面若与历史中任一局面同形 → 禁手
  // （覆盖单劫与多劫循环 / 同形再现）
  if (positionHistory && positionHistory.length > 0) {
    const serialized = serializeBoard(newBoard)
    if (positionHistory.includes(serialized)) {
      return { valid: false, reason: 'ko' }
    }
  }

  return { valid: true, newBoard, captured }
}
