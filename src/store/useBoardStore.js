import { useReducer, useCallback } from 'react'
import { BOARD_SIZE, labelsToBoard } from '../constants/board'
import { applyMove, serializeBoard } from '../utils/goRules'

const makeEmptyBoard = () =>
  Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null))

// 洪水填充：找出与 (row,col) 同色相连的整块棋子坐标
function findConnectedGroup(board, row, col) {
  const color = board[row][col]
  if (!color) return []
  const group = []
  const visited = new Set()
  const stack = [[row, col]]
  while (stack.length) {
    const [r, c] = stack.pop()
    const key = r * BOARD_SIZE + c
    if (visited.has(key)) continue
    visited.add(key)
    if (board[r][c] !== color) continue
    group.push([r, c])
    if (r > 0)             stack.push([r - 1, c])
    if (r < BOARD_SIZE - 1) stack.push([r + 1, c])
    if (c > 0)             stack.push([r, c - 1])
    if (c < BOARD_SIZE - 1) stack.push([r, c + 1])
  }
  return group
}

const initialState = {
  stones: makeEmptyBoard(),
  gameMode: 'free',       // 'free'（自由摆棋）| 'play'（试下/规则模式）
  penColor: 'black',      // 自由摆棋画笔：'black' | 'white' | 'erase'
  turnColor: 'black',     // 试下模式当前落子方
  capturedBlack: 0,       // 白方提走的黑子数
  capturedWhite: 0,       // 黑方提走的白子数
  playMoves: [],          // 试下步序：[{row, col}, ...]，index+1 即步号
  problemSetup: null,     // 题目初始局面：{ blackStones, whiteStones, firstPlayer } | null
  positionHistory: [],    // 试下局面序列（serializeBoard 字符串），用于 superko
  passCount: 0,           // 连续虚手计数
  gamePhase: 'playing',   // 'playing' | 'scoring'（连续两次虚手进入终局态）
  deadStones: [],         // 终局标记的死子位置（`${row}-${col}` 数组，用时转 Set）
  history: [],            // undo 栈
  future: [],             // redo 栈
  invalidMsg: null,       // 'ko' | 'suicide' | null，短暂显示后清除
}

function boardReducer(state, action) {
  switch (action.type) {

    // ── 自由摆棋落子 ──────────────────────────────────────────────
    case 'FREE_PLACE': {
      const { row, col } = action.payload
      const current = state.stones[row][col]
      let next = null
      if (state.penColor !== 'erase' && current !== state.penColor) {
        next = state.penColor
      }
      const newStones = state.stones.map((r, ri) =>
        ri === row ? r.map((s, ci) => (ci === col ? next : s)) : r
      )
      return {
        ...state,
        stones: newStones,
        history: [...state.history, snapshot(state)],
        future: [],
      }
    }

    // ── 试下落子（带围棋规则校验）────────────────────────────────
    case 'PLAY_PLACE': {
      const { row, col } = action.payload
      // 完整位置 superko：参照此前出现过的所有局面
      const result = applyMove(state.stones, row, col, state.turnColor, state.positionHistory)

      if (!result.valid) {
        // 非法落子：显示提示，不改变棋盘
        return { ...state, invalidMsg: result.reason }
      }

      const nextTurn = state.turnColor === 'black' ? 'white' : 'black'
      const capturedBlack = state.capturedBlack + (state.turnColor === 'white' ? result.captured : 0)
      const capturedWhite = state.capturedWhite + (state.turnColor === 'black' ? result.captured : 0)

      return {
        ...state,
        stones: result.newBoard,
        turnColor: nextTurn,
        capturedBlack,
        capturedWhite,
        playMoves: [...state.playMoves, { row, col }],
        positionHistory: [...state.positionHistory, serializeBoard(result.newBoard)],
        passCount: 0,
        gamePhase: 'playing',  // 落子回到对弈态（若之前为 scoring）
        deadStones: [],        // 继续对弈落子，清空死子标记
        history: [...state.history, snapshot(state)],
        future: [],
        invalidMsg: null,
      }
    }

    // ── 终局标记死子（仅 scoring 态，点击棋子整块切换死活）────────
    case 'TOGGLE_DEAD': {
      if (state.gamePhase !== 'scoring') return state
      const { row, col } = action.payload
      if (!state.stones[row][col]) return state // 空点忽略

      const group = findConnectedGroup(state.stones, row, col)
      const keys = group.map(([r, c]) => `${r}-${c}`)
      const current = new Set(state.deadStones)
      const allDead = keys.every((k) => current.has(k))

      let nextDead
      if (allDead) {
        // 整块已全部标死 → 取消标记
        keys.forEach((k) => current.delete(k))
        nextDead = [...current]
      } else {
        // 否则整块加入死子
        keys.forEach((k) => current.add(k))
        nextDead = [...current]
      }

      return {
        ...state,
        deadStones: nextDead,
        history: [...state.history, snapshot(state)],
        future: [],
        invalidMsg: null,
      }
    }

    // ── 虚手 Pass（仅 play 模式有效）──────────────────────────────
    case 'PASS': {
      const nextPass = state.passCount + 1
      const nextTurn = state.turnColor === 'black' ? 'white' : 'black'
      return {
        ...state,
        turnColor: nextTurn,
        passCount: nextPass,
        gamePhase: nextPass >= 2 ? 'scoring' : 'playing',
        history: [...state.history, snapshot(state)],
        future: [],
        invalidMsg: null,
      }
    }

    // ── 继续对弈（从终局态回到对弈态）────────────────────────────
    case 'RESUME_PLAY':
      return { ...state, gamePhase: 'playing', passCount: 0, deadStones: [] }

    case 'CLEAR_MSG':
      return { ...state, invalidMsg: null }

    case 'SET_PEN_COLOR':
      return { ...state, penColor: action.payload }

    case 'SET_GAME_MODE': {
      const base = { ...state, gameMode: action.payload, deadStones: [], invalidMsg: null }
      // 切到 play 模式：从当前局面干净开始对弈
      if (action.payload === 'play') {
        return {
          ...base,
          positionHistory: [serializeBoard(state.stones)],
          passCount: 0,
          gamePhase: 'playing',
        }
      }
      return base
    }

    case 'SET_TURN_COLOR':
      return { ...state, turnColor: action.payload }

    case 'UNDO': {
      if (!state.history.length) return state
      const prev = state.history[state.history.length - 1]
      return {
        ...state,
        ...prev,
        history: state.history.slice(0, -1),
        future: [snapshot(state), ...state.future],
        invalidMsg: null,
      }
    }

    case 'REDO': {
      if (!state.future.length) return state
      const next = state.future[0]
      return {
        ...state,
        ...next,
        history: [...state.history, snapshot(state)],
        future: state.future.slice(1),
        invalidMsg: null,
      }
    }

    case 'RESET': {
      const newBoard = makeEmptyBoard()
      return {
        ...state,
        stones: newBoard,
        turnColor: 'black',
        capturedBlack: 0,
        capturedWhite: 0,
        playMoves: [],
        positionHistory: [serializeBoard(newBoard)],
        passCount: 0,
        gamePhase: 'playing',
        deadStones: [],
        history: [...state.history, snapshot(state)],
        future: [],
        invalidMsg: null,
      }
    }

    case 'IMPORT_STONES': {
      const { blackStones = [], whiteStones = [], firstPlayer = 'black' } = action.payload
      const newBoard = labelsToBoard({ blackStones, whiteStones })
      return {
        ...state,
        stones: newBoard,
        turnColor: firstPlayer,
        capturedBlack: 0,
        capturedWhite: 0,
        playMoves: [],
        // 加载 / 导入题目时记录初始局面，供试下后还原
        problemSetup: { blackStones, whiteStones, firstPlayer },
        positionHistory: [serializeBoard(newBoard)],
        passCount: 0,
        gamePhase: 'playing',
        deadStones: [],
        history: [...state.history, snapshot(state)],
        future: [],
        invalidMsg: null,
      }
    }

    // ── 还原题目初始局面（清空试下痕迹，不污染题目）──────────────
    case 'RESTORE_PROBLEM': {
      if (!state.problemSetup) return state
      const { blackStones, whiteStones, firstPlayer } = state.problemSetup
      const newBoard = labelsToBoard({ blackStones, whiteStones })
      return {
        ...state,
        stones: newBoard,
        turnColor: firstPlayer,
        capturedBlack: 0,
        capturedWhite: 0,
        playMoves: [],
        positionHistory: [serializeBoard(newBoard)],
        passCount: 0,
        gamePhase: 'playing',
        deadStones: [],
        history: [...state.history, snapshot(state)],
        future: [],
        invalidMsg: null,
      }
    }

    default:
      return state
  }
}

// 保存当前棋盘快照（用于撤销）
function snapshot(state) {
  return {
    stones: state.stones,
    turnColor: state.turnColor,
    capturedBlack: state.capturedBlack,
    capturedWhite: state.capturedWhite,
    playMoves: state.playMoves,
    // 纳入快照，保证 undo/redo 跨「加载/还原题目」时 problemSetup 一致
    problemSetup: state.problemSetup,
    // 试下对弈相关字段，保证 undo/redo 一致
    positionHistory: state.positionHistory,
    passCount: state.passCount,
    gamePhase: state.gamePhase,
    deadStones: state.deadStones,
  }
}

export function useBoardStore() {
  const [state, dispatch] = useReducer(boardReducer, initialState)

  const placeStone = useCallback((row, col) => {
    let type
    if (state.gameMode === 'play') {
      // 终局态点击棋子标记死活，否则正常落子
      type = state.gamePhase === 'scoring' ? 'TOGGLE_DEAD' : 'PLAY_PLACE'
    } else {
      type = 'FREE_PLACE'
    }
    dispatch({ type, payload: { row, col } })
  }, [state.gameMode, state.gamePhase])

  return {
    stones: state.stones,
    gameMode: state.gameMode,
    penColor: state.penColor,
    turnColor: state.turnColor,
    capturedBlack: state.capturedBlack,
    capturedWhite: state.capturedWhite,
    playMoves: state.playMoves,
    problemSetup: state.problemSetup,
    passCount: state.passCount,
    gamePhase: state.gamePhase,
    deadStones: state.deadStones,
    canUndo: state.history.length > 0,
    canRedo: state.future.length > 0,
    invalidMsg: state.invalidMsg,

    placeStone,
    setPenColor:   useCallback((c) => dispatch({ type: 'SET_PEN_COLOR', payload: c }), []),
    setGameMode:   useCallback((m) => dispatch({ type: 'SET_GAME_MODE', payload: m }), []),
    setTurnColor:  useCallback((c) => dispatch({ type: 'SET_TURN_COLOR', payload: c }), []),
    clearMsg:      useCallback(() => dispatch({ type: 'CLEAR_MSG' }), []),
    undo:          useCallback(() => dispatch({ type: 'UNDO' }), []),
    redo:          useCallback(() => dispatch({ type: 'REDO' }), []),
    reset:         useCallback(() => dispatch({ type: 'RESET' }), []),
    importStones:  useCallback((p) => dispatch({ type: 'IMPORT_STONES', payload: p }), []),
    restoreProblem: useCallback(() => dispatch({ type: 'RESTORE_PROBLEM' }), []),
    pass:          useCallback(() => dispatch({ type: 'PASS' }), []),
    resumePlay:    useCallback(() => dispatch({ type: 'RESUME_PLAY' }), []),
  }
}
