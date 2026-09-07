import { IconLock } from './Icons'

// 视口切换：四角方位盘 + 全盘 / 适应棋形。
//
// 用 2×2 方位盘而不是把六个按钮挤成一排：面板宽 lg:w-64（256px），
// 六个并排每个不到 40px，点不准也读不清。四角按钮的位置直接对应棋盘四角，
// 空间隐喻自解释，触摸目标也够大。
function ViewportPad({ value, onChange, disabled = false, disabledHint }) {
  const cell = (key, label) => {
    const active = value === key
    return (
      <button
        key={key}
        onClick={() => onChange(key)}
        disabled={disabled}
        className={[
          'py-2.5 text-sm font-medium transition-all rounded-xl',
          active
            ? 'bg-accent text-white'
            : 'bg-sunk text-ink-soft hover:text-ink hover:bg-rule',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-sunk',
        ].join(' ')}
      >
        {label}
      </button>
    )
  }

  // 锁定时（数子阶段）收成一行提示。摆一格六个点不动的按钮既是噪音，
  // 又要占掉约 150px —— 而数子面板本身很高，胜负结论会被挤出屏幕。
  if (disabled) {
    return (
      <div className="bg-sunk border border-rule rounded-2xl px-3 py-2.5 flex items-start gap-2">
        <span className="text-ink-faint mt-0.5"><IconLock size={15} /></span>
        <div>
          <p className="text-xs font-medium text-ink">视野已锁定 · 全盘</p>
          {disabledHint && (
            <p className="text-[11px] text-ink-faint leading-snug mt-0.5">{disabledHint}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-rule rounded-2xl p-2.5 flex flex-col gap-1.5">
      <p className="text-[10px] text-ink-faint font-medium tracking-widest uppercase">视野</p>

      {/* 四角方位盘，位置对应棋盘四角 */}
      <div className="grid grid-cols-2 gap-1.5">
        {cell('TL', '左上')}
        {cell('TR', '右上')}
        {cell('BL', '左下')}
        {cell('BR', '右下')}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {cell('full', '全盘')}
        {cell('fit', '适应棋形')}
      </div>
    </div>
  )
}

export default ViewportPad
