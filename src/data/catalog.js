// 教材目录：单元 → 小组 → 题号
//
// 数据来自逐页核对书上的页眉（单元名）与页首标题（小组名），
// 生成脚本与原始照片在 eval/。全书每个小组正好 6 题、占一页，
// 所以小组只存 from/to 两个端点，不必逐题罗列。
//
// 收录范围 187–768。第 1–186 题（占据要点一～四等）尚未拍摄，
// 所以目录里没有——不是漏了。
import example from './catalog.example.json'

// 真实教材目录放在 catalog.local.json（已 gitignore）—— 它是某本在售教材的
// 完整目录，属该书内容，不进公开仓库。用 import.meta.glob 而不是静态 import：
// 静态 import 一个不存在的文件会让构建直接失败，而 glob 在文件缺席时返回空对象，
// 于是干净地回落到示例目录，clone 下来即可跑。
const local = import.meta.glob('./catalog.local.json', { eager: true, import: 'default' })
const catalog = local['./catalog.local.json'] ?? example

export default catalog

/** 题号 → 所属单元与小组；不在目录内（如自己起名的题）返回 null */
export function locate(problemNo) {
  const n = Number(problemNo)
  if (!Number.isInteger(n)) return null
  for (const unit of catalog.units) {
    for (const group of unit.groups) {
      if (n >= group.from && n <= group.to) return { unit, group }
    }
  }
  return null
}

/** 小组内的题号列表 */
export function problemsOf(group) {
  const out = []
  for (let n = group.from; n <= group.to; n++) out.push(String(n))
  return out
}

/** 一句话描述题号出处，用于保存对话框的即时提示 */
export function describe(problemNo) {
  const hit = locate(problemNo)
  if (!hit) return null
  return `第${hit.unit.no}单元 ${hit.unit.name} · ${hit.group.name} · ${hit.group.goal}`
}
