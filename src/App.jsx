import { useEffect, useRef, useState } from 'react'
import Board from './components/Board/Board'
import ControlPanel from './components/ControlPanel/ControlPanel'
import ImageImport from './components/ImageImport/ImageImport'
import { SaveProblemDialog, LoadProblemDialog } from './components/ProblemDialog/ProblemDialog'
import { catalogSummary } from './data/catalog'
import BoardBackground from './components/Background/BoardBackground'
import { useBoardStore } from './store/useBoardStore'
import { boardToLabels, labelsToBoard } from './constants/board'
import { computeScore } from './utils/scoring'
import { FULL_RECT, quadrantRect, fitRect } from './utils/viewport'
import { isMuted, setMuted, playMove, preloadSounds } from './utils/sound'
import { IconSoundOn, IconSoundOff } from './components/ControlPanel/Icons'

function App() {
  const {
    stones, gameMode, penColor, turnColor,
    capturedBlack, capturedWhite, playMoves, problemSetup,
    gamePhase, deadStones,
    canUndo, canRedo, invalidMsg,
    placeStone, setPenColor, setGameMode,
    clearMsg, undo, redo, reset, importStones, restoreProblem,
    pass, resumePlay,
  } = useBoardStore()

  // 贴目（中国规则默认 7.5）
  const [komi, setKomi] = useState(7.5)

  // 视口。存的是**冻结的矩形**，不是需要在渲染时读 stones 才能解析的模式名 ——
  // stones 就是 undo 历史，模式化的 fit 会让「撤销一手」顺带改掉取景框。
  // key 只用于高亮当前按钮。
  const [viewport, setViewport] = useState({ key: 'full', rect: FULL_RECT })

  // 终局态：数子结果（含地域）。非终局态不计算/不显示。
  const isScoring = gameMode === 'play' && gamePhase === 'scoring'
  const score = isScoring
    ? computeScore(stones, new Set(deadStones), komi)
    : null
  const deadSet = isScoring ? new Set(deadStones) : null

  // 数子阶段强制全盘。computeScore 永远扫描完整 19x19：缩在角上看不见的
  // 空点照样计入胜负，视野外的死子又永远点不到 —— 会得到一个自信的错数字。
  const viewRect = isScoring ? FULL_RECT : viewport.rect
  const viewportKey = isScoring ? 'full' : viewport.key
  const territory = isScoring ? score.territory : null

  // 试下模式的步序编号 map：'row-col' → 步号
  const moveNumMap = {}
  if (gameMode === 'play') {
    playMoves.forEach(({ row, col }, idx) => {
      moveNumMap[`${row}-${col}`] = idx + 1
    })
  }

  // 音效。触发时机按**状态增量**判断，不写在 reducer（必须纯）里，
  // 也不写在点击回调里 —— 回调不知道这一手是否合法，点在已有子上照样会响。
  //
  //   吃子数增加        → 提子声（音源里已含落子声，不要再叠一次）
  //   盘上恰好多/少一子 → 落子声
  //   其余一律静音：载入题目 / 还原 / 清空 / 识别导入是整片变动，
  //                  撤销一手提子（吃子数减少、盘上多出几子）也不该响。
  const [muted, setMutedFlag] = useState(isMuted)
  const prevSound = useRef(null)
  useEffect(() => { preloadSounds() }, [])   // 48KB，别等到第一手才现取
  useEffect(() => {
    let total = 0
    for (const row of stones) for (const c of row) if (c) total++
    const cap = capturedBlack + capturedWhite
    const prev = prevSound.current
    prevSound.current = { total, cap }
    if (!prev) return                       // 首次渲染只记录，不出声
    if (cap > prev.cap) playMove(cap - prev.cap)
    else if (Math.abs(total - prev.total) === 1) playMove(0)
  }, [stones, capturedBlack, capturedWhite])

  const [showImport, setShowImport] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [showLoad, setShowLoad] = useState(false)

  useEffect(() => {
    function onKey(e) {
      // 输入框里打字不该触发快捷键。ProblemDialog 会自动聚焦题号输入框，
      // 而 b/w/e 只由 gameMode === 'free' 门控 —— 正是保存对话框通常打开的状态，
      // 在题号里输入会在弹窗背后静默改掉画笔颜色。
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return

      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if (meta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
      if (!meta && !e.altKey && gameMode === 'free') {
        if (e.key === 'b' || e.key === 'B') setPenColor('black')
        if (e.key === 'w' || e.key === 'W') setPenColor('white')
        if (e.key === 'e' || e.key === 'E') setPenColor('erase')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, setPenColor, gameMode])

  function handleSetViewport(key) {
    if (key === 'full') return setViewport({ key, rect: FULL_RECT })
    if (key === 'fit') return setViewport({ key, rect: fitRect(stones) })
    setViewport({ key, rect: quadrantRect(key) })
  }

  // 题目换了盘面，按新棋形取一次景
  function fitTo(nextStones) {
    setViewport({ key: 'fit', rect: fitRect(nextStones) })
  }

  function handleImport({ blackStones, whiteStones, firstPlayer }) {
    importStones({ blackStones, whiteStones, firstPlayer })
    fitTo(labelsToBoard({ blackStones, whiteStones }))
    setShowImport(false)
  }

  // 保存题目：序列化当前棋盘 + 先手方（取当前 turnColor，默认黑先）
  function getBoardData() {
    const { blackStones, whiteStones } = boardToLabels(stones)
    return { blackStones, whiteStones, firstPlayer: turnColor || 'black' }
  }

  function handleLoad({ blackStones, whiteStones, firstPlayer }) {
    importStones({ blackStones, whiteStones, firstPlayer })
    fitTo(labelsToBoard({ blackStones, whiteStones }))
    setShowLoad(false)
  }

  // onReset / onRestore 原本是直接透传给面板的，视口需要跟着动，故包一层：
  // 清空后停在一个空象限、或还原题目后取景没跟上，都是死路。
  function handleReset() {
    reset()
    setViewport({ key: 'full', rect: FULL_RECT })
  }

  function handleRestore() {
    restoreProblem()
    if (problemSetup) fitTo(labelsToBoard(problemSetup))
  }

  const boardMode = gameMode === 'play' ? turnColor : penColor

  return (
    <div className="min-h-screen bg-ground flex flex-col relative">
      <BoardBackground />

      {/* 单行页头：标题与副题并排，把纵向空间让给棋盘 */}
      <header className="relative z-10 flex items-baseline gap-3 px-6 lg:px-8 py-2.5 border-b border-rule">
        <h1 className="text-xl font-semibold tracking-tight text-ink font-display leading-none">
          GoSandbox
        </h1>
        {/* 教材名从目录读，别再写死 —— 在用的书不止一本，catalogSummary 会把各册串起来 */}
        <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-accent leading-none hidden sm:block">
          {catalogSummary()}
        </p>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-xs text-ink-faint font-mono leading-none hidden md:block">
            {gameMode === 'free' ? 'B·W·E 切换' : '规则试下模式'} · ⌘Z 撤销
          </div>
          <button
            onClick={() => { const next = !muted; setMuted(next); setMutedFlag(next) }}
            title={muted ? '开启落子音效' : '关闭落子音效'}
            aria-pressed={!muted}
            className={[
              'p-1.5 rounded-lg border border-rule transition-colors',
              muted ? 'bg-surface text-ink-faint hover:text-ink' : 'bg-surface text-accent hover:bg-sunk',
            ].join(' ')}
          >
            {muted ? <IconSoundOff size={16} /> : <IconSoundOn size={16} />}
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col lg:flex-row items-center lg:items-start justify-center gap-6 p-4 lg:p-8">
        {/* 棋盘装在衬板里：实色表面 + 1px 边框，与右侧面板同一套语言 */}
        <div className="w-full max-w-[min(640px,calc(100vh-7rem))] bg-surface border border-rule rounded-2xl p-3 shadow-sm">
          <Board
            stones={stones}
            mode={boardMode}
            moveNumMap={moveNumMap}
            onIntersectionClick={placeStone}
            invalidMsg={invalidMsg}
            onClearMsg={clearMsg}
            deadStones={deadSet}
            territory={territory}
            viewport={viewRect}
          />
        </div>

        <ControlPanel
          gameMode={gameMode}
          onSetGameMode={setGameMode}
          penColor={penColor}
          onSetPenColor={setPenColor}
          turnColor={turnColor}
          capturedBlack={capturedBlack}
          capturedWhite={capturedWhite}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          onReset={handleReset}
          onOpenImport={() => setShowImport(true)}
          onOpenSave={() => setShowSave(true)}
          onOpenLoad={() => setShowLoad(true)}
          canRestore={!!problemSetup}
          onRestore={handleRestore}
          moveCount={playMoves.length}
          gamePhase={gamePhase}
          onPass={pass}
          onResume={resumePlay}
          score={score}
          komi={komi}
          onSetKomi={setKomi}
          viewportKey={viewportKey}
          onSetViewport={handleSetViewport}
          viewportLocked={isScoring}
        />
      </main>

      {showImport && (
        <ImageImport onImport={handleImport} onClose={() => setShowImport(false)} />
      )}

      {showSave && (
        <SaveProblemDialog getBoardData={getBoardData} onClose={() => setShowSave(false)} />
      )}

      {showLoad && (
        <LoadProblemDialog onLoad={handleLoad} onClose={() => setShowLoad(false)} />
      )}
    </div>
  )
}

export default App
