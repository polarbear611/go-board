// 题目数据访问层（后端 /api 实现）
//
// 本里程碑（M2）已从 localStorage 切换为后端服务：所有函数改为 fetch
// 同源相对路径 /api/*，数据持久化到 MySQL。4 个函数的签名与返回结构
// 与 localStorage 版完全保持一致，调用方无需改动。
//
//   listProblems()              -> [{ problemNo, updatedAt }]（按 updatedAt 倒序，后端已排序）
//   getProblem(problemNo)       -> { blackStones, whiteStones, firstPlayer } | null（404 返回 null）
//   saveProblem(problemNo, d)   -> 保存后的记录 { problemNo, blackStones, whiteStones, firstPlayer, updatedAt }
//   deleteProblem(problemNo)    -> void

const BASE = '/api/problems'

// 统一的请求封装：非 2xx 抛错（getProblem 的 404 单独处理为 null）
async function request(url, options) {
  let res
  try {
    res = await fetch(url, options)
  } catch (e) {
    // 网络错误：交给上层弹窗展示
    throw new Error(`网络请求失败：${e.message}`)
  }
  return res
}

// 解析 JSON 响应。
//
// 没有后端 / 没配 dev 代理时，Vite 的 SPA fallback 会把 /api/* 也回成
// index.html —— HTTP 200 且 content-type 是 text/html，res.ok 拦不住，
// 直接 res.json() 会抛 "Unexpected token '<'"，看着像前端 bug。
// 这里先看 content-type，把它翻译成人能看懂的原因。
async function parseJson(res) {
  const ctype = res.headers.get('content-type') || ''
  if (!ctype.includes('application/json')) {
    throw new Error(
      '接口没有返回 JSON —— 后端没起，或 dev 代理没配。' +
      '本地可用 VITE_API_PROXY=https://go.xlingdata.com npm run dev 连线上题库。'
    )
  }
  return res.json()
}

/**
 * 列出所有题目（仅题号与更新时间），按 updatedAt 倒序
 * @returns {Promise<Array<{ problemNo: string, updatedAt: number }>>}
 */
export async function listProblems() {
  const res = await request(BASE)
  if (!res.ok) throw new Error(`加载题目列表失败（${res.status}）`)
  return parseJson(res)
}

/**
 * 读取单题初始局面
 * @param {string} problemNo
 * @returns {Promise<{ blackStones: string[], whiteStones: string[], firstPlayer: 'black'|'white' } | null>}
 */
export async function getProblem(problemNo) {
  const res = await request(`${BASE}/${encodeURIComponent(String(problemNo))}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`加载题目失败（${res.status}）`)
  const rec = await parseJson(res)
  return {
    blackStones: rec.blackStones ?? [],
    whiteStones: rec.whiteStones ?? [],
    firstPlayer: rec.firstPlayer ?? 'black',
  }
}

/**
 * 保存 / 覆盖题目（按 problemNo upsert）
 * @param {string} problemNo
 * @param {{ blackStones: string[], whiteStones: string[], firstPlayer: 'black'|'white' }} data
 * @returns {Promise<{ problemNo, blackStones, whiteStones, firstPlayer, updatedAt }>} 保存后的记录
 */
export async function saveProblem(problemNo, { blackStones = [], whiteStones = [], firstPlayer = 'black' }) {
  const res = await request(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      problemNo: String(problemNo),
      blackStones,
      whiteStones,
      firstPlayer,
    }),
  })
  if (!res.ok) throw new Error(`保存题目失败（${res.status}）`)
  return res.json()
}

/**
 * 删除题目
 * @param {string} problemNo
 * @returns {Promise<void>}
 */
export async function deleteProblem(problemNo) {
  const res = await request(`${BASE}/${encodeURIComponent(String(problemNo))}`, {
    method: 'DELETE',
  })
  // 后端 DELETE 幂等返回 204；非 2xx 视为失败
  if (!res.ok) throw new Error(`删除题目失败（${res.status}）`)
}
