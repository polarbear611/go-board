import { useRef, useState } from 'react'

const API_KEY = import.meta.env.VITE_MINIMAX_API_KEY
const API_HOST = import.meta.env.VITE_MINIMAX_API_HOST || 'https://api.minimaxi.com'
const API_URL  = `${API_HOST}/v1/chat/completions`

async function callMiniMax(messages, maxTokens = 1000) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'MiniMax-Text-01',
      messages,
      max_tokens: maxTokens,
    }),
  })
  if (!res.ok) throw new Error(`API 错误 ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

/**
 * 两轮对话识别围棋死活题棋形
 * 第一轮：找棋盘左下角 + 建立坐标系 + 区分颜色
 * 第二轮：基于第一轮分析，逐行逐列扫描输出 JSON
 */
async function recognizeBoard(base64, onStep) {
  const imageMsg = {
    type: 'image_url',
    image_url: { url: `data:image/jpeg;base64,${base64}` },
  }
  const SYSTEM = {
    role: 'system',
    content: '你是专业的围棋图像分析助手，擅长识别棋盘结构和棋子颜色。',
  }

  // ── 第一轮：定位棋盘左下角，建立坐标参考 ────────────────────────
  onStep('正在定位棋盘角落…')

  const prompt1 = `这是一道围棋死活题图片，棋盘是局部图，通常是棋盘的某个角。

请完成以下三步分析：

【第一步：找棋盘左下角 A1 点】
- 棋盘由横竖线组成方格，边界线比内部线更粗/更明显
- 左下角 = 左边界线与下边界线的交叉点，围棋坐标为 A1
- 请描述 A1 点在图片中的大致位置（如"图片左侧约1/6处，底部约1/8处"）

【第二步：从 A1 出发数格子】
- 向右数列：A、B、C、D、E、F、G、H、J（跳过I）、K...
- 向上数行：1、2、3、4、5、6、7、8、9...
- 图中可见多少列、多少行？最右列是哪列？最上行是第几行？

【第三步：确认能否区分黑白子】
- 黑子特征：圆形，内部完全是深色/黑色实心填充，看不到内部纹理
- 白子特征：圆形，内部是白色/浅色填充，外圈有一条明显的深色描边（空心圆的视觉效果）
- 请确认你在图中能看到这两种棋子，并说明各自的视觉特征

补充：这张图很可能是围棋书籍/电子书里的**印刷题目图**——画面正、线条直、黑白对比清晰（不是手机翻拍的歪斜照片）。请充分利用这一点精确判读。

请详细回答以上三步。`

  const analysis = await callMiniMax([
    SYSTEM,
    { role: 'user', content: [imageMsg, { type: 'text', text: prompt1 }] },
  ], 900)

  // ── 第二轮：基于分析结果，用 x/y 坐标逐格扫描 ──────────────────
  onStep('正在逐格扫描棋子…')

  const prompt2 = `请看同一张围棋死活题图片。

你在上一步确认了棋盘的左下角位置和棋盘范围。

现在请逐格识别棋子，坐标规则如下：
- x 轴：从棋盘最左列开始，向右依次为 1、2、3、4...
- y 轴：从棋盘最下行开始，向上依次为 1、2、3、4...
- 棋盘左下角 = (x:1, y:1)

扫描顺序：先扫第1行（y=1，从左到右 x=1,2,3...），再扫第2行（y=2），以此类推向上

判断规则（务必逐子核对颜色）：
- 交叉点上是「整体深黑、实心填充」的圆 → 黑子，记录 {x, y}
- 交叉点上是「内部白/浅色、外圈一圈深色描边」的圆 → 白子，记录 {x, y}
- 交叉点只有横竖线穿过、没有圆 → 空，跳过不记录

颜色自检（关键，之前的错误几乎都出在黑白混淆）：
- 对每一颗你认定的棋子，再问一次自己：它的**圆心**是黑的还是白的？圆心黑=黑子，圆心白=白子。
- 不要靠位置猜颜色，要逐颗看像素明暗。

注意：
- 绝大多数交叉点是空的
- 同一个坐标绝对不能同时出现在黑棋和白棋列表里

上一步你的分析：
${analysis}

只输出 JSON，不要其他文字：
{"black_stones":[{"x":1,"y":1},{"x":3,"y":2}],"white_stones":[{"x":2,"y":1}]}`

  const jsonText = await callMiniMax([
    SYSTEM,
    { role: 'user', content: [imageMsg, { type: 'text', text: prompt1 }] },
    { role: 'assistant', content: analysis },
    { role: 'user', content: [imageMsg, { type: 'text', text: prompt2 }] },
  ], 1400)

  const match = jsonText.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`无法解析识别结果：${jsonText.slice(0, 200)}`)
  const raw = JSON.parse(match[0])

  // x/y 整数坐标 → 棋盘字母坐标（A1 格式）
  const COL_LETTERS = 'ABCDEFGHJKLMNOPQRST'
  function xyToLabel({ x, y }) {
    if (x < 1 || x > 19 || y < 1 || y > 19) return null
    return COL_LETTERS[x - 1] + y
  }

  // 去重：同一点不能既是黑子又是白子（保黑去白）
  const blackSet = new Set()
  const blackLabels = (raw.black_stones ?? []).map(xyToLabel).filter(Boolean)
  blackLabels.forEach((l) => blackSet.add(l))
  const whiteLabels = (raw.white_stones ?? []).map(xyToLabel).filter(Boolean).filter((l) => !blackSet.has(l))

  return { black_stones: blackLabels, white_stones: whiteLabels }
}

// 压缩图片（电子书截图清晰，适当提高上限与画质以保留细节）
function compressToBase64(file, maxPx = 1400, quality = 0.92) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1])
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

// ── UI 组件 ──────────────────────────────────────────────────────────
function ImageImport({ onImport, onClose }) {
  const inputRef = useRef(null)
  const [preview, setPreview]   = useState(null)
  const [file, setFile]         = useState(null)
  const [status, setStatus]     = useState('idle')   // idle | loading | done | error
  const [loadStep, setLoadStep] = useState('')        // 当前识别阶段文案
  const [error, setError]       = useState('')
  const [result, setResult]     = useState(null)

  function handleFile(f) {
    if (!f) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      setError('仅支持 JPG / PNG / WebP 格式')
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setStatus('idle')
    setResult(null)
    setError('')
  }

  function handleDrop(e) {
    e.preventDefault()
    handleFile(e.dataTransfer.files[0])
  }

  async function handleRecognize() {
    if (!file) return
    setStatus('loading')
    setError('')
    try {
      const base64 = await compressToBase64(file)
      const res = await recognizeBoard(base64, setLoadStep)
      setResult(res)
      setStatus('done')
    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }

  function handleFirstPlayer(first) {
    onImport({
      blackStones: result.black_stones ?? [],
      whiteStones: result.white_stones ?? [],
      firstPlayer: first,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 backdrop-blur-sm p-4">
      <div className="bg-surface border border-rule rounded-2xl p-6 w-full max-w-md shadow-2xl">

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-ink font-semibold text-lg font-display">导入练习题图片</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none">✕</button>
        </div>

        {!preview ? (
          <div
            className="border-2 border-dashed border-rule rounded-xl p-8 text-center cursor-pointer hover:border-accent/60 hover:bg-accent-soft/50 transition-all"
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <div className="text-4xl mb-3">🖼️</div>
            <p className="text-ink text-sm">点击或拖拽图片到此处</p>
            <p className="text-ink-faint text-xs mt-1">支持 JPG / PNG / WebP</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {/* 图片预览 */}
            <div className="relative rounded-xl overflow-hidden bg-sunk">
              <img src={preview} alt="预览" className="w-full max-h-56 object-contain" />
              <button
                onClick={() => { setPreview(null); setFile(null); setResult(null); setStatus('idle') }}
                className="absolute top-2 right-2 bg-ink/70 text-white rounded-full w-6 h-6 text-sm leading-6 text-center hover:bg-ink/85"
              >
                ✕
              </button>
            </div>

            {/* 识别进度 */}
            {status === 'loading' && (
              <div className="flex items-center gap-3 bg-surface rounded-xl p-3">
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <p className="text-ink text-sm">{loadStep || '准备中…'}</p>
              </div>
            )}

            {/* 识别结果 */}
            {status === 'done' && result && (
              <div className="bg-surface rounded-xl p-3 text-sm text-ink space-y-1">
                <p>⚫ 黑子：<span className="text-ink font-medium font-mono">{result.black_stones?.length ?? 0}</span> 枚</p>
                <p>⚪ 白子：<span className="text-ink font-medium font-mono">{result.white_stones?.length ?? 0}</span> 枚</p>
                <p className="text-[11px] text-ink-faint pt-1">导入后可用擦除 / 落子工具手动微调</p>
              </div>
            )}

            {/* 错误 */}
            {status === 'error' && (
              <p className="text-danger text-sm bg-danger/10 rounded-xl p-3">{error}</p>
            )}

            {/* 操作按钮 */}
            {status !== 'done' && (
              <button
                onClick={handleRecognize}
                disabled={status === 'loading'}
                className="w-full py-3 rounded-xl bg-accent hover:bg-accent/85 disabled:bg-sunk disabled:text-ink-faint text-white font-semibold transition-all"
              >
                {status === 'loading' ? '识别中（两步分析）…' : '开始识别'}
              </button>
            )}

            {/* 选择先手方 */}
            {status === 'done' && (
              <div className="space-y-2">
                <p className="text-ink-soft text-sm text-center">棋形已识别，请选择先手方</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleFirstPlayer('black')}
                    className="py-3 rounded-xl bg-sunk hover:bg-rule border border-rule text-ink font-semibold transition-all"
                  >
                    ⚫ 黑先
                  </button>
                  <button
                    onClick={() => handleFirstPlayer('white')}
                    className="py-3 rounded-xl bg-white hover:bg-sunk border border-rule text-ink font-semibold transition-all"
                  >
                    ⚪ 白先
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ImageImport
