import { useEffect, useMemo, useRef, useState } from 'react'
import { listProblems, getProblem, saveProblem } from '../../api/problems'
import catalog, { locate, problemsOf, describe } from '../../data/catalog'

// 时间戳 → 友好显示（如 06-21 14:30）
function fmtTime(ts) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const OVERLAY = 'fixed inset-0 z-50 flex items-center justify-center bg-ink/30 backdrop-blur-sm p-4'
const PANEL = 'bg-surface border border-rule rounded-2xl p-6 w-full shadow-2xl'

// ── 保存题目弹窗 ──────────────────────────────────────────────────────
export function SaveProblemDialog({ getBoardData, onClose }) {
  const inputRef = useRef(null)
  const [problemNo, setProblemNo] = useState('')
  const [status, setStatus] = useState('idle')   // idle | saving | done | error
  const [error, setError] = useState('')

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSave() {
    const no = problemNo.trim()
    if (!no) return
    setStatus('saving')
    setError('')
    try {
      // getBoardData 返回 { blackStones, whiteStones, firstPlayer }
      await saveProblem(no, getBoardData())
      setStatus('done')
      setTimeout(onClose, 700)
    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }

  const disabled = !problemNo.trim() || status === 'saving' || status === 'done'
  // 输入的是教材题号时，当场回显它在书里的位置，省得存错地方
  const where = describe(problemNo.trim())

  return (
    <div className={OVERLAY}>
      <div className={`${PANEL} max-w-md`}>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-ink font-semibold text-lg font-display">保存题目</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none">✕</button>
        </div>

        {status === 'done' ? (
          <div className="bg-success/10 text-success rounded-xl p-4 text-center text-sm">
            ✓ 题目「{problemNo.trim()}」已保存
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-ink-soft text-sm mb-2">请输入题号</p>
              <input
                ref={inputRef}
                type="text"
                value={problemNo}
                onChange={(e) => setProblemNo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !disabled) handleSave() }}
                placeholder="如 300，或自己起名"
                className="w-full px-4 py-3 rounded-xl bg-sunk border border-rule text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/60 transition-all"
              />
              <p className="text-xs mt-2 h-4 text-ink-faint">
                {where || (problemNo.trim() && '不在教材目录内，将归入「其他」')}
              </p>
            </div>

            {status === 'error' && (
              <p className="text-danger text-sm bg-danger/10 rounded-xl p-3">{error}</p>
            )}

            <button
              onClick={handleSave}
              disabled={disabled}
              className="w-full py-3 rounded-xl bg-accent hover:bg-accent/85 disabled:bg-sunk disabled:text-ink-faint text-white font-semibold transition-all"
            >
              {status === 'saving' ? '保存中…' : '确认保存'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 加载题目弹窗 ──────────────────────────────────────────────────────
//
// 题库有 582 道，平铺一列滚不动，也看不出题目之间的关系。
// 改成按教材结构下钻：单元 → 小组 → 题号。每个小组正好 6 题，
// 一屏就是一页书，和孩子手边的纸质书对得上。
//
// 目录是书的结构、与题库里实际有哪些题无关，所以两者分开：
// 目录决定层级，`have` 决定哪些能点。没入库的题号照样显示但置灰，
// 这样「这一组还差几道」一眼可见。
export function LoadProblemDialog({ onLoad, onClose }) {
  const [list, setList] = useState(null)         // null = 加载中
  const [error, setError] = useState('')         // 列表读取失败：挡住整个视图
  const [pickError, setPickError] = useState('') // 单题打开失败：列表仍可用
  const [reloadKey, setReloadKey] = useState(0)
  const [tab, setTab] = useState('catalog')      // catalog | recent
  const [unitNo, setUnitNo] = useState(null)
  const [groupKey, setGroupKey] = useState(null) // group.from
  const [jump, setJump] = useState('')

  useEffect(() => {
    let alive = true
    listProblems()
      .then((items) => { if (alive) setList(items) })
      // 失败时**不要** setList([])：那会渲染出「还没有保存的题目」，
      // 等于断言题库是空的 —— 但取不到列表时我们并不知道它是不是空的，
      // 这个假空态会让人以为数据丢了。
      .catch((e) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [reloadKey])

  const have = useMemo(() => new Set((list || []).map((x) => String(x.problemNo))), [list])
  // 不在教材目录里的（自己起名的、旧题号），单独归拢，别丢了
  const extras = useMemo(
    () => (list || []).filter((x) => !locate(x.problemNo)),
    [list],
  )
  const countIn = (from, to) => {
    let n = 0
    for (let i = from; i <= to; i++) if (have.has(String(i))) n++
    return n
  }

  const unit = catalog.units.find((u) => u.no === unitNo) || null
  const group = unit?.groups.find((g) => g.from === groupKey) || null

  async function handlePick(problemNo) {
    setPickError('')
    try {
      const data = await getProblem(problemNo)
      if (!data) { setPickError(`「${problemNo}」不存在或已被删除`); return }
      onLoad({
        blackStones: data.blackStones,
        whiteStones: data.whiteStones,
        firstPlayer: data.firstPlayer,
      })
    } catch (e) {
      setPickError(e.message)
    }
  }

  function handleJump(e) {
    e.preventDefault()
    const n = jump.trim()
    const hit = locate(n)
    if (!hit) { setPickError(`第 ${n} 题不在教材目录内`); return }
    setUnitNo(hit.unit.no)
    setGroupKey(hit.group.from)
    setPickError('')
  }

  const crumb = (
    <div className="flex items-center gap-1.5 text-xs text-ink-faint mb-3 flex-wrap">
      <button onClick={() => { setUnitNo(null); setGroupKey(null) }}
              className="hover:text-ink transition-colors">目录</button>
      {unit && <>
        <span>/</span>
        <button onClick={() => setGroupKey(null)} className="hover:text-ink transition-colors">
          第{unit.no}单元 {unit.name}
        </button>
      </>}
      {group && <><span>/</span><span className="text-ink">{group.name}</span></>}
    </div>
  )

  return (
    <div className={OVERLAY}>
      <div className={`${PANEL} max-w-xl`}>

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-ink font-semibold text-lg font-display">加载题目</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none">✕</button>
        </div>

        {error ? (
          /* 取不到列表时只报错，不渲染空态 —— 别让人以为题目丢了 */
          <div className="bg-danger/10 rounded-xl p-4">
            <p className="text-danger text-sm font-medium mb-1">读不到题库</p>
            <p className="text-ink-soft text-xs leading-relaxed">{error}</p>
            <button
              onClick={() => { setError(''); setList(null); setReloadKey((k) => k + 1) }}
              className="mt-3 px-3 py-1.5 rounded-lg bg-surface border border-rule text-ink text-xs font-medium hover:bg-sunk transition-all"
            >
              重试
            </button>
          </div>
        ) : list === null ? (
          <div className="flex items-center gap-3 bg-surface rounded-xl p-4">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <p className="text-ink text-sm">读取题库中…</p>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-2 rounded-xl overflow-hidden border border-rule mb-3">
              {[['catalog', `按教材目录（${have.size} 题在库）`], ['recent', `最近保存（${list.length}）`]].map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                        className={`py-2 text-xs font-medium transition-all ${
                          tab === k ? 'bg-accent text-white' : 'bg-sunk text-ink-soft hover:text-ink'}`}>
                  {label}
                </button>
              ))}
            </div>

            {pickError && (
              <p className="text-danger text-xs bg-danger/10 rounded-xl p-3 mb-3">{pickError}</p>
            )}

            {tab === 'recent' ? (
              list.length === 0 ? (
                <div className="bg-sunk rounded-xl p-8 text-center">
                  <p className="text-ink text-sm">题库里还没有题目</p>
                  <p className="text-ink-faint text-xs mt-1">在自由摆棋模式摆好棋形后点「保存题目」</p>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
                  {list.map(({ problemNo, updatedAt }) => {
                    const hit = locate(problemNo)
                    return (
                      <button key={problemNo} onClick={() => handlePick(problemNo)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-sunk border border-rule text-left hover:border-accent/60 hover:bg-accent-soft/50 transition-all">
                        <span className="min-w-0">
                          <span className="text-ink font-medium">{problemNo}</span>
                          {hit && <span className="text-ink-faint text-xs ml-2">{hit.group.name}</span>}
                        </span>
                        <span className="text-xs text-ink-faint font-mono flex-shrink-0 ml-3">{fmtTime(updatedAt)}</span>
                      </button>
                    )
                  })}
                </div>
              )
            ) : (
              <div>
                {crumb}

                {!unit && (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    <form onSubmit={handleJump} className="flex gap-2 mb-1">
                      <input value={jump} onChange={(e) => setJump(e.target.value)}
                        inputMode="numeric" placeholder="直接跳到题号，如 300"
                        className="flex-1 px-3 py-2 rounded-lg bg-sunk border border-rule text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent/60" />
                      <button type="submit"
                        className="px-4 rounded-lg bg-sunk border border-rule text-ink-soft text-sm hover:text-ink transition-all">跳转</button>
                    </form>
                    {catalog.units.map((u) => {
                      const from = u.groups[0].from, to = u.groups[u.groups.length - 1].to
                      const n = countIn(from, to)
                      return (
                        <button key={u.no} onClick={() => setUnitNo(u.no)}
                          className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-sunk border border-rule text-left hover:border-accent/60 hover:bg-accent-soft/50 transition-all">
                          <span>
                            <span className="text-ink font-medium">第{u.no}单元 {u.name}</span>
                            <span className="block text-ink-faint text-xs mt-0.5 font-mono">{from}–{to} · {u.groups.length} 组</span>
                          </span>
                          <span className={`text-xs font-mono flex-shrink-0 ml-3 ${n ? 'text-accent' : 'text-ink-faint'}`}>
                            {n}/{to - from + 1}
                          </span>
                        </button>
                      )
                    })}
                    {extras.length > 0 && (
                      <button onClick={() => setTab('recent')}
                        className="w-full px-4 py-3 rounded-xl bg-sunk border border-rule text-left hover:border-accent/60 transition-all">
                        <span className="text-ink font-medium">其他题目</span>
                        <span className="block text-ink-faint text-xs mt-0.5">
                          {extras.length} 道不在教材目录内（{extras.slice(0, 3).map((x) => x.problemNo).join('、')}
                          {extras.length > 3 ? ' 等' : ''}）
                        </span>
                      </button>
                    )}
                  </div>
                )}

                {unit && !group && (
                  <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-1">
                    {unit.groups.map((g) => {
                      const n = countIn(g.from, g.to)
                      return (
                        <button key={g.from} onClick={() => setGroupKey(g.from)}
                          className="px-3 py-2.5 rounded-xl bg-sunk border border-rule text-left hover:border-accent/60 hover:bg-accent-soft/50 transition-all">
                          <span className="text-ink text-sm font-medium block truncate">{g.name}</span>
                          <span className="text-ink-faint text-[11px] font-mono">
                            {g.from}–{g.to} · <span className={n ? 'text-accent' : ''}>{n}/6</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {group && (
                  <div>
                    <p className="text-xs text-ink-soft mb-3">
                      黑先 · {group.goal}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {problemsOf(group).map((no) => {
                        const ok = have.has(no)
                        return (
                          <button key={no} disabled={!ok} onClick={() => handlePick(no)}
                            title={ok ? `打开第 ${no} 题` : '题库里还没有这道题'}
                            className={`py-4 rounded-xl border text-center font-mono text-lg transition-all ${
                              ok ? 'bg-sunk border-rule text-ink hover:border-accent/60 hover:bg-accent-soft/50'
                                 : 'bg-surface border-rule/60 text-ink-faint cursor-not-allowed'}`}>
                            {no}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
