// 落子 / 提子音效。音源见 public/sounds/README.md（大模型生成，无第三方版权）。
//
// **一个事件放一个文件**：capture1 / capture-many 里已经把落子声混进去了，
// 别再叠一次 stone —— 这与之前用 Sabaki 素材时「运行时拼 落子 + N×提子」
// 的做法不同，那套逻辑已经删掉。
//
// 用 AudioBuffer 而不是 <audio> 元素：<audio> 每次 play() 有几十毫秒不定延迟，
// 而落子反馈的延迟一旦过 50ms 就能感觉到发闷（原始 wav 的 76ms 前导静音就是
// 因为这个被切掉的）。解码成 AudioBuffer 后由 AudioBufferSourceNode 播放，
// 调度是采样级的。
//
// **触发时机不在这里，也绝不能写进 reducer**：reducer 必须是纯函数，
// 且 StrictMode 下开发态会重复调用同一个 action，副作用会响两次。
// 实际由 App.jsx 的 useEffect 按状态增量判断（见那里的注释）。

const KEY = 'go-board:muted'
const FILES = {
  stone:   '/sounds/stone.mp3',          // 落子
  one:     '/sounds/capture1.mp3',       // 落子 + 提 1 子
  many:    '/sounds/capture-many.mp3',   // 落子 + 提多子
}

let ctx = null
let muted = readMuted()
let bank = null             // { stone, one, many } -> AudioBuffer
let loading = null

function readMuted() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false            // 隐私模式下 localStorage 会直接抛错
  }
}

export function isMuted() {
  return muted
}

export function setMuted(v) {
  muted = !!v
  try {
    localStorage.setItem(KEY, muted ? '1' : '0')
  } catch { /* 存不下就算了，本次会话内仍然生效 */ }
  if (!muted) load()        // 解除静音时顺手预热，第一手不会因为还在下载而丢音
}

// 浏览器要求 AudioContext 在用户手势之后才能出声，否则停在 suspended 态。
// 本项目所有音效都跟在点击/按键之后，但页面切到后台再回来也会 suspended，
// 所以每次都补一次 resume()。
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null    // 老浏览器：静音降级，不报错
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

/**
 * 预载三个样本（共 48KB）。返回同一个 promise，重复调用不会重复下载。
 * 任何一个取不到就整体降级为静音 —— 缺音效不该让棋盘报错。
 */
function load() {
  if (bank || loading) return loading
  const c = audio()
  if (!c) return null
  const keys = Object.keys(FILES)
  loading = Promise.all(keys.map(async (k) => {
    const res = await fetch(FILES[k])
    if (!res.ok) throw new Error(`${FILES[k]} ${res.status}`)
    return c.decodeAudioData(await res.arrayBuffer())
  }))
    .then((bufs) => { bank = Object.fromEntries(keys.map((k, i) => [k, bufs[i]])) })
    .catch((e) => { console.warn('音效加载失败，已静音：', e.message) })
  return loading
}

/** 页面加载后就开始下，别等到第一手才现取 */
export function preloadSounds() {
  if (!muted) load()
}

/**
 * 走一手棋的声音。
 * @param {number} captured 这一手提掉的子数（0 = 没提子）
 */
export function playMove(captured = 0) {
  if (muted) return
  const c = audio()
  if (!c || !bank) { load(); return }     // 还没载好就这一手无声，不排队补放
  const buf = captured === 0 ? bank.stone : captured === 1 ? bank.one : bank.many
  const src = c.createBufferSource()
  src.buffer = buf
  src.connect(c.destination)
  src.start()
}
