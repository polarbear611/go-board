import ViewportPad from './ViewportPad'
import {
  IconStoneBlack, IconStoneWhite, IconErase,
  IconUndo, IconRedo, IconClear,
  IconSave, IconLoad, IconCamera, IconRestore,
} from './Icons'

function ControlPanel({
  gameMode, onSetGameMode,
  penColor, onSetPenColor,
  turnColor, capturedBlack, capturedWhite,
  canUndo, canRedo, onUndo, onRedo, onReset,
  onOpenImport, onOpenSave, onOpenLoad,
  canRestore, onRestore,
  moveCount = 0, gamePhase = 'playing', onPass, onResume,
  score = null, komi = 7.5, onSetKomi,
  viewportKey = 'full', onSetViewport, viewportLocked = false,
}) {
  const isPlay = gameMode === 'play'

  return (
    // 面板与棋盘顶端对齐；lg 下粘住并限高，内容再多也不会跑出一屏
    <div className="flex flex-col gap-2 w-full lg:w-64 lg:sticky lg:top-8 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto [&>*]:shrink-0">

      {/* 模式切换 Tab */}
      <div className="flex rounded-2xl overflow-hidden border border-rule">
        {[
          { id: 'free', label: '自由摆棋' },
          { id: 'play', label: '规则试下' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onSetGameMode(id)}
            className={[
              'flex-1 py-2.5 text-[15px] font-semibold transition-all',
              gameMode === id
                ? 'bg-accent text-white'
                : 'bg-surface text-ink-soft hover:text-ink hover:bg-sunk',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      <ViewportPad
        value={viewportKey}
        onChange={onSetViewport}
        disabled={viewportLocked}
        disabledHint="数子需要看到全盘：盘上任何一处的死子都会算进胜负。"
      />

      {/* 自由摆棋：笔色选择 */}
      {!isPlay && (
        // 分段控件：一行装下三个笔色。快捷键在页头已经写着，不再各占一行。
        <div className="grid grid-cols-3 rounded-2xl overflow-hidden border border-rule">
          {[
            { id: 'black', Icon: IconStoneBlack, label: '黑子', shortcut: 'B' },
            { id: 'white', Icon: IconStoneWhite, label: '白子', shortcut: 'W' },
            { id: 'erase', Icon: IconErase,      label: '擦除', shortcut: 'E' },
          ].map(({ id, Icon, label, shortcut }) => (
            <button
              key={id}
              onClick={() => onSetPenColor(id)}
              title={`${label}（${shortcut}）`}
              className={[
                'flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-all',
                penColor === id
                  ? 'bg-accent text-white'
                  : 'bg-surface text-ink hover:bg-sunk',
              ].join(' ')}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 试下模式：当前手方 + 提子计数 */}
      {isPlay && (
        <div className="bg-surface border border-rule rounded-2xl p-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className={[
              'w-7 h-7 rounded-full border-2 flex-shrink-0',
              turnColor === 'black'
                ? 'bg-[#17150f] border-[#17150f]'
                : 'bg-white border-[#9a9384]',
            ].join(' ')} />
            <span className="text-base font-semibold text-ink">
              {turnColor === 'black' ? '黑方落子' : '白方落子'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-sunk rounded-xl py-3">
              <p className="text-xs text-ink-faint mb-1">白提黑</p>
              <p className="text-2xl font-bold text-ink font-mono tabular-nums">{capturedBlack}</p>
            </div>
            <div className="bg-sunk rounded-xl py-3">
              <p className="text-xs text-ink-faint mb-1">黑提白</p>
              <p className="text-2xl font-bold text-ink font-mono tabular-nums">{capturedWhite}</p>
            </div>
          </div>

          {/* 当前手数 */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-faint">当前手数</span>
            <span className="font-mono font-semibold text-ink">{moveCount}</span>
          </div>

          {/* 终局态：数子面板 / 继续对弈，或虚手按钮 */}
          {gamePhase === 'scoring' ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl bg-accent-soft border border-accent/35 px-3 py-3">
                <p className="text-sm font-semibold text-accent text-center">对局结束 · 中国规则数子</p>
                <p className="text-[11px] text-accent mt-1 text-center">点击棋子可标记 / 取消死子</p>

                {score && (
                  <div className="mt-3 flex flex-col gap-1.5 text-xs">
                    <div className="flex justify-between text-ink">
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-[#17150f] border border-[#17150f] inline-block" />黑
                      </span>
                      <span className="font-mono font-semibold">{score.blackArea} 子</span>
                    </div>
                    <div className="flex justify-between text-ink">
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-white border border-[#9a9384] inline-block" />白
                      </span>
                      <span className="font-mono font-semibold">{score.whiteArea} 子</span>
                    </div>
                    <div className="flex justify-between text-ink-soft">
                      <span>单官</span>
                      <span className="font-mono">{score.dame}</span>
                    </div>
                    <div className="flex justify-between text-ink-soft items-center">
                      <span>贴目</span>
                      <input
                        type="number"
                        step="0.5"
                        value={komi}
                        onChange={(e) => onSetKomi?.(Number(e.target.value))}
                        className="w-16 bg-sunk border border-rule rounded px-1.5 py-0.5 text-right font-mono text-ink focus:outline-none focus:border-accent/60"
                      />
                    </div>
                    <div className="mt-1 pt-2 border-t border-rule text-center">
                      <span className={[
                        'text-sm font-bold',
                        score.winner === 'draw' ? 'text-ink'
                          : score.winner === 'black' ? 'text-ink' : 'text-accent',
                      ].join(' ')}>
                        {score.winner === 'draw'
                          ? '和棋'
                          : `${score.winner === 'black' ? '黑胜' : '白胜'} ${score.winBy} 子`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={onResume}
                className="w-full py-3 rounded-xl bg-surface hover:bg-sunk border border-rule text-ink text-sm font-medium transition-all"
              >
                继续对弈
              </button>
            </div>
          ) : (
            <button
              onClick={onPass}
              className="w-full py-3 rounded-xl bg-sunk hover:bg-rule border border-rule text-ink text-sm font-semibold transition-all"
            >
              虚手 Pass
            </button>
          )}
        </div>
      )}

      {/* 撤销 / 重做 / 清空 一排 */}
      <div className="grid grid-cols-3 rounded-2xl overflow-hidden border border-rule">
        <button
          onClick={onUndo} disabled={!canUndo} title="撤销（⌘Z）"
          className="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium bg-surface text-ink hover:bg-sunk transition-all disabled:text-ink-faint/40 disabled:cursor-not-allowed disabled:hover:bg-surface"
        >
          <IconUndo size={16} /><span>撤销</span>
        </button>
        <button
          onClick={onRedo} disabled={!canRedo} title="重做（⌘Y）"
          className="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium bg-surface text-ink hover:bg-sunk transition-all border-x border-rule disabled:text-ink-faint/40 disabled:cursor-not-allowed disabled:hover:bg-surface"
        >
          <IconRedo size={16} /><span>重做</span>
        </button>
        <button
          onClick={onReset} title="清空棋盘"
          className="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium bg-surface text-danger hover:bg-danger/10 transition-all"
        >
          <IconClear size={16} /><span>清空</span>
        </button>
      </div>

      {/* 还原到题目初始局面（加载题目后才出现，清掉试下痕迹） */}
      {canRestore && (
        <button
          onClick={onRestore}
          className="w-full py-2.5 rounded-2xl bg-accent-soft hover:bg-accent-soft/70 border border-accent/35 text-accent text-sm font-medium transition-all flex items-center justify-center gap-1.5"
        >
          <IconRestore size={16} /><span>还原题目初始局面</span>
        </button>
      )}

      {/* 题目：保存 / 加载 / 图片导入，一排 */}
      <div className="grid grid-cols-3 rounded-2xl overflow-hidden border border-rule">
        {[
          { Icon: IconSave,   label: '保存', onClick: onOpenSave,   title: '保存当前棋形为题目' },
          { Icon: IconLoad,   label: '加载', onClick: onOpenLoad,   title: '从服务器加载题目' },
          { Icon: IconCamera, label: '导入', onClick: onOpenImport, title: '上传题目照片识别摆盘' },
        ].map(({ Icon, label, onClick, title }, i) => (
          <button
            key={label}
            onClick={onClick}
            title={title}
            className={[
              'flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium bg-surface text-ink hover:bg-sunk transition-all',
              i === 1 ? 'border-x border-rule' : '',
            ].join(' ')}
          >
            <Icon size={16} /><span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default ControlPanel
