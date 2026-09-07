# AGENTS.md — go-board（GoSandbox 围棋练习沙盘）

给孩子做围棋手筋/死活题练习的网页工具：自由摆棋 → 规则试下/正式对弈 → 中国规则数子 → 题目跨设备保存。线上 <https://go.xlingdata.com>。改架构同步更新 README.md（中文）。

## 技术栈与目录

- **前端**：React 19 + Vite 8 + Tailwind CSS v4（`@tailwindcss/vite` 插件，**无 tailwind.config**），纯 SVG 棋盘，状态用 `useReducer` 自封装 store，无第三方状态库/UI 库。
- **后端**：`backend/` FastAPI + SQLAlchemy + PyMySQL 微服务（题目 CRUD），独立 docker-compose，对齐服务器 <另一个内部项目> 范式。
- **文档**：`README.md`（主）、`docs/V0.2-PLAN.md`、`docs/V0.2-TEST-PLAN.md`、`backend/README.md`。

```
src/
├─ App.jsx                  # 顶层布局、快捷键、终局数子计算
├─ constants/board.js       # 棋盘常量 + boardToLabels 序列化
├─ api/problems.js          # 题目数据层（fetch 同源 /api，无 axios）
├─ utils/goRules.js         # 围棋规则：找块/数气/提子/完整位置 superko
├─ utils/scoring.js         # 中国规则数子（地域/死子/胜负）
├─ utils/viewport.js       # 视口矩形：象限 / 适应棋形 / 坐标换算
├─ store/useBoardStore.js   # useReducer 状态机（摆棋/对弈/终局/题目）
└─ components/{Board,ControlPanel,ProblemDialog,ImageImport}/
backend/app/{main,db,models,schemas}.py + tests/test_problems.py
```

## 常用命令

```bash
npm run dev          # 开发服务器
npm run build        # 产物输出 dist/
npm test             # Vitest run（goRules / scoring 单测）
npm run lint         # ESLint
# 后端（backend/ 下，.venv 已存在）
DATABASE_URL=sqlite:///./test.db .venv/bin/pytest tests -q
DATABASE_URL=sqlite:///./dev.db .venv/bin/uvicorn app.main:app --reload
```

## 架构边界与关键实现

- **规则逻辑只写在 `src/utils/`**：`goRules.js` 的 `applyMove`（先提对方无气块再查自杀，劫争用完整位置 superko —— `serializeBoard` 命中 `positionHistory` 即禁手）和 `scoring.js` 的 `computeScore`。这两个文件有 Vitest 覆盖，**改动必须跑 `npm test`**，需要时补用例。
- **坐标系**：棋盘内部统一 0-indexed `[row][col]` 二维数组；SVG 渲染层换算依赖 `constants/board.js` 的 `CELL_SIZE=40 / PADDING=44 / SVG_SIZE=808`；列标 A–T **跳过 I**。改棋盘尺寸时这几处常量联动，别在组件里硬编码数字。
- **别在 `index.css` 里写未分层的 `*` 重置**：Tailwind v4 的工具类在 `@layer utilities` 里，而**未分层的 CSS 优先级恒高于分层规则**。项目里曾有一段 `*{margin:0;padding:0}`，把全站的 `p-*` / `m-*` 工具类全部打成 0（计算值恒为 0，且不报错、不警告）。Tailwind 的 preflight 已经做了同样的重置，不要再加回来。
- **配色是暖纸浅色单主题**，令牌在 `index.css` 的 `@theme` 块（`--color-ground/surface/sunk`、`--color-ink*`、`--color-rule`、`--color-accent`）。面板一律用**实色表面 + 实色边框**，不要再引入 `bg-white/5`、`border-white/10` 这类半透明叠加——它们只在深色底上成立，浅底下会整片糊掉。
- **视口是一个冻结的矩形，不是模式**：`src/utils/viewport.js` 的 `quadrantRect` / `fitRect` 算出 `{x,y,w,h}`，App 用 `useState` 存住它，Board 拿去当 viewBox。**绝不能存成 `'fit'` 这种渲染时才读 `stones` 解析的模式名**——`stones` 就是 undo 历史，那样「撤销一手」会顺带改掉取景框。视口也**不进 store**（不进 undo/redo 栈）。
- **数子阶段强制全盘并禁用切换**：`computeScore` 永远扫描完整 19×19，缩在角上看不见的空点照样计入胜负、视野外的死子又点不到，会得到一个自信的错数字。联锁在 `App.jsx` 的 `isScoring` 分支。
- **`clientToIntersection` 用 `getScreenCTM()`**：读实时 DOM，viewBox 原点/缩放/letterbox 全部天然处理，补间期间也不会与画面脱节。`svgToIntersection` 里那两道 `Number.isInteger` 断言是必需的——`NaN` 与任何数比较都为 false，会**通过**范围检查并让 `stones[NaN][NaN]` 抛错白屏。
- **视口矩形恒为正方形**：容器是 `aspect-square`，非方 viewBox 在 `xMidYMid meet` 下的 letterbox 带不会被裁剪，会漏出相邻象限。`viewport.js` 的 `MARGIN === PADDING` 与 `MARGIN > STONE_R` 两条不变量有单测守着，别随手改。
- **题目初始局面与试下棋盘分离**：store 中 `problemSetup`（题目）与对局状态分开，「还原题目」依赖这个分离，勿合并。
- **前后端契约**：前端只调同源 `/api/problems`；`updatedAt` 为毫秒时间戳 int；POST 是按 problemNo 的 upsert；DELETE 幂等（不存在也 204）。改接口两边同步 + 更新 backend/README.md。

### 题库与教材目录

> 以下文件是**本机私有、不入库**的教材内容（见 `.gitignore`）：`src/data/catalog.local.json`、`eval/ground-truth.json`、`eval/auto-read.json`。
> 公开仓库里只有 `src/data/catalog.example.json`（虚构的示例目录，缺席真实目录时自动回落）。

`src/data/catalog.local.json` 是教材《死活专项训练（从10级到5级）》的目录：**5 单元 / 97 小组 / 582 题（187–768）**，
由逐页核对书上的页眉（单元名）与页首标题（小组名）得出。全书每个小组正好 6 题、占一页，
所以小组只存 `from`/`to` 两个端点，不逐题罗列；`catalog.js` 提供 `locate()` / `problemsOf()` / `describe()`。

**目录与题库是两回事，别合并**：目录是书的结构，与后端实际存了哪些题无关。
加载弹窗按目录下钻（单元 → 小组 → 题号），用后端返回的题号集合决定哪些能点，
没入库的题号照样显示但置灰——「这一组还差几道」才一眼可见。自己起名的题（如 `有眼杀无眼-248`）
不在目录内，归入「最近保存」。

### 题库现状（2026-09-06 已上线）

线上 590 道：本册 **187–768 共 582 道**（5 单元 97 小组），外加上学期遗留的
`167` / `170` / `手筋-259` 与 5 道 `有眼杀无眼-*`。`手筋-259` 是灌库时从旧 `259`
改名而来——新旧两册在这个号上撞车，后端 POST 是按 `problemNo` upsert，不改名会覆盖。

582 道的**可信度分三档**（记在 `eval/ground-truth.json` 的 `confidence` 字段）：

| 档位 | 题数 | 依据 |
|---|---|---|
| `verified` | 255 | 人工逐题核对 |
| `cross-checked` | 92 | 模型肉眼读法与几何识别两种独立方法结果一致 |
| `auto-clean` | 235 | 仅几何识别、且程序自报零可疑点 |

**`auto-clean` 不等于无错**：在 185 道人工基准上，这一档的错题率实测 4%（3/74，共错 3 子）。
按比例估计这 235 道里还有约 9 道各错 1 子。孩子做题时撞见错的直接在应用里改了重存即可。

### eval/ —— 书页照片 → 棋形

```bash
python3 eval/slice_page.py <书页照片> <起始题号> [输出目录]   # 一页切成 6 张单题图
python3 eval/read_tile.py eval/tiles/q283.png              # 读出棋形，输出 JSON
```

`read_tile.py` 是**确定性图像处理，不调模型**：背景扣除 → 定网格 → 判子。
在人工核对过的题上逐子准确率 **93.4%**（185 道 3521 子）——这批照片书页拱起明显，
左侧三列的漏白子是主要失败模式。它自报的可疑点是可靠的复核信号：有可疑点的 99 道里
68% 确实有错，零可疑点的 74 道里只有 3 道有错、共错 3 子。


几条踩过的坑写在了脚本注释里，改之前先读：网格线要按**全局共享的倾斜角**定位
（逐条自由拟合会在外推时相邻两条挤到一起）；被棋子盖住的线要按间距还原序号补回；
白子必须**正着认**（查整圈轮廓），只靠「内圈干净」会把网格外的空白纸面整片认成白子。

`eval/ground-truth.json` 是人工确认的基准，`eval/auto-read.json` 是 283–768 的自动识别结果
（含 `weak` 标记，未经人工核对）。切图 `eval/tiles/` 与原始照片 `题目照片/` 都已 gitignore。

## 环境变量与密钥

- `VITE_MINIMAX_API_KEY` / `VITE_MINIMAX_API_HOST` 在 `.env.local`（已 gitignore）。**前端直连 MiniMax，key 会打进打包产物**——本项目定位个人家庭工具，勿引入公开生产场景。
- 后端 MySQL 密码走 `backend/.env`（参考 `.env.example`），绝不入库；本地/测试一律用 `DATABASE_URL=sqlite:///...` 覆盖，不碰真库。

## 部署（生产动作，先亮明目标再执行）

- 前端日常更新：`bash deploy/deploy-frontend.sh`（= `npm run build` + `rsync --delete` 到 prod）。
  **rsync 带 `--delete`，构建失败勿跑**（脚本有 `set -euo pipefail`，构建失败会中止）。
- **站点根是 `<站点根>`**，不是 另一棵目录树。
  nginx 跑在容器 `<nginx 容器>` 里，配置 `<nginx 配置>`
  写的是 `root <容器内站点根>`，而 `<容器内 web 根>` 挂载自 `<宿主机 web 根>`。
  脚本里曾写成 `<另一棵无人服务的目录树>`——那棵树无人服务，**rsync 会安静地新建目录、
  报告同步成功、脚本照样打印 ✅，线上纹丝不动**。所以脚本末尾加了自检：
  拉一次线上 `index.html`，确认它引用的正是本次构建出的 JS 文件名，对不上就 `exit 1`。
- 后端：`bash deploy/deploy-backend.sh` **目前不可用**——里面的 `.env` 路径、nginx 配置路径、
  容器名（`<旧前端容器名>` / `<旧 mysql 容器名>`）在服务器上都已不存在，脚本顶部记了实测结果。
  线上后端本身是好的，现成部署在服务器 `<服务器上的后端目录>`。
- 服务器属 twin 生产环境：动手前亮明目标服务器与动作，nginx 改动 `nginx -t` 校验后 reload。
## 其他约定

- 代码注释与文档用中文；提交信息风格参照 git log（`feat(M4): ...` 中文描述）。
- `测试棋形-*.jpg`、`围棋网页应用背景图生成.png`、`backend/**/*.db`、`.env.local` 均已 gitignore，不要提交。
- 图片识别（ImageImport）为实验性功能：MiniMax 两轮对话（先定坐标系再逐格扫描），准确率不稳定属已知现状，勿当可靠功能依赖。
