# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 本仓库另有 `AGENTS.md`（内容与本文件基本一致，供其它 agent 使用）。**改架构 / 命令时两份 + `README.md` 同步更新。**

## 项目定位

给孩子做围棋手筋/死活题练习的网页沙盘：自由摆棋 → 规则试下/正式对弈 → 中国规则数子 → 题目跨设备保存。线上 <https://go.xlingdata.com>。代码注释与文档一律用中文。

## 常用命令

```bash
npm run dev            # Vite 开发服务器
npm run build          # 产物输出 dist/
npm test               # Vitest run（goRules / scoring 单测）
npm run lint           # ESLint

# 跑单个测试文件 / 单条用例
npx vitest run src/utils/scoring.test.js
npx vitest run -t 'U6'            # 用例名前缀 U1..U8 / S1..S3 / C1..C4
npm run test:watch                # watch 模式

# 后端（在 backend/ 下，.venv 已存在；本地一律 sqlite，勿连真库）
DATABASE_URL=sqlite:///./test.db .venv/bin/pytest tests -q
DATABASE_URL=sqlite:///./test.db .venv/bin/pytest tests/test_problems.py::test_b2_upsert_no_dup -q
DATABASE_URL=sqlite:///./dev.db  .venv/bin/uvicorn app.main:app --reload
```

`backend/conftest.py` 会 `setdefault` 一个 sqlite `DATABASE_URL` 兜底，并把 `backend/` 加进 `sys.path`，所以 pytest 必须在 `backend/` 目录下跑。

## 技术栈

React 19 + Vite 8 + Tailwind CSS v4（`@tailwindcss/vite` 插件，**无 tailwind.config 文件**），纯 SVG 棋盘。状态用 `useReducer` 自封装 store，**无第三方状态库 / UI 库 / axios**，依赖只有 react + react-dom。后端 `backend/` 是 FastAPI + SQLAlchemy + PyMySQL 微服务，独立 docker-compose。

## 架构

```
src/
├─ App.jsx                  # 顶层布局、快捷键、终局数子计算、moveNumMap 生成
├─ constants/board.js       # 棋盘常量 + boardToLabels 序列化
├─ api/problems.js          # 题目数据层（fetch 同源 /api，4 个 async 函数）
├─ utils/goRules.js         # applyMove / serializeBoard / boardEquals
├─ utils/scoring.js         # computeScore（中国规则数子）
├─ store/useBoardStore.js   # useReducer 状态机（14 个 action）
└─ components/{Board,ControlPanel,ProblemDialog,ImageImport,Background}/
backend/app/{main,db,models,schemas}.py + tests/test_problems.py
```

数据流是单向的：`useBoardStore` 持有全部对局状态 → `App.jsx` 派生视图数据（play 模式下的 `moveNumMap`、终局的 `computeScore` 结果）→ `Board`/`ControlPanel` 只读渲染并回调 dispatch。组件里不放规则逻辑。

### 关键实现约束

- **规则逻辑只写在 `src/utils/`**：`applyMove` 先提对方无气块再查自杀；劫争用**完整位置 superko**——`serializeBoard(newBoard)` 命中 `positionHistory` 即禁手（覆盖单劫与多劫循环）。`goRules.js` / `scoring.js` 有 Vitest 覆盖，**改动必须跑 `npm test`**，需要时补用例。
- **坐标系**：棋盘内部统一 0-indexed `[row][col]` 二维数组；SVG 渲染换算依赖 `constants/board.js` 的 `CELL_SIZE=40 / PADDING=44 / SVG_SIZE=808`（`SVG_SIZE` 是 `PADDING*2 + 18*CELL_SIZE` 推导出来的，别写死）；列标 `COL_LABELS` 是 A–T **跳过 I**，行号 = `BOARD_SIZE - row`。改棋盘尺寸时这几处联动，别在组件里硬编码数字。字母坐标（`"Q16"`）↔ `[row][col]` 的互逆转换是 `constants/board.js` 里 `boardToLabels` / `labelsToBoard` 一对，store 与 App 共用同一份。
- **别在 `index.css` 里写未分层的 `*` 重置**：Tailwind v4 的工具类在 `@layer utilities` 里，而**未分层的 CSS 优先级恒高于分层规则**。项目里曾有一段 `*{margin:0;padding:0}`，把全站的 `p-*` / `m-*` 工具类全部打成 0（计算值恒为 0，且不报错、不警告）。Tailwind 的 preflight 已经做了同样的重置，不要再加回来。
- **配色是暖纸浅色单主题**，令牌在 `index.css` 的 `@theme` 块（`--color-ground/surface/sunk`、`--color-ink*`、`--color-rule`、`--color-accent`）。面板一律用**实色表面 + 实色边框**，不要再引入 `bg-white/5`、`border-white/10` 这类半透明叠加——它们只在深色底上成立，浅底下会整片糊掉。
- **视口是一个冻结的矩形，不是模式**：`src/utils/viewport.js` 的 `quadrantRect` / `fitRect` 算出 `{x,y,w,h}`，App 用 `useState` 存住它，Board 拿去当 viewBox。**绝不能存成 `'fit'` 这种渲染时才读 `stones` 解析的模式名**——`stones` 就是 undo 历史，那样「撤销一手」会顺带改掉取景框。视口也**不进 store**（不进 undo/redo 栈）。
- **数子阶段强制全盘并禁用切换**：`computeScore` 永远扫描完整 19×19，缩在角上看不见的空点照样计入胜负、视野外的死子又点不到，会得到一个自信的错数字。联锁在 `App.jsx` 的 `isScoring` 分支。
- **`clientToIntersection` 用 `getScreenCTM()`**：读实时 DOM，viewBox 原点/缩放/letterbox 全部天然处理，补间期间也不会与画面脱节。`svgToIntersection` 里那两道 `Number.isInteger` 断言是必需的——`NaN` 与任何数比较都为 false，会**通过**范围检查并让 `stones[NaN][NaN]` 抛错白屏。
- **视口矩形恒为正方形**：容器是 `aspect-square`，非方 viewBox 在 `xMidYMid meet` 下的 letterbox 带不会被裁剪，会漏出相邻象限。`viewport.js` 的 `MARGIN === PADDING` 与 `MARGIN > STONE_R` 两条不变量有单测守着，别随手改。
- **题目初始局面与试下棋盘分离**：store 中 `problemSetup`（题目）与 `stones`（当前盘面）是两份状态，「还原题目」（`RESTORE_PROBLEM`）依赖这个分离，**勿合并**。
- **前后端契约**：前端只调同源 `/api/problems`；`updatedAt` 是毫秒时间戳 int；POST 是按 `problemNo` 的 upsert；DELETE 幂等（不存在也 204）。改接口两边同步 + 更新 `backend/README.md`。
- **dev 下 `/api` 默认转发到 `http://localhost:8000`**（`vite.config.js`）。没有后端时 Vite 的 SPA fallback 会把 `/api/problems` 也回成 `index.html`（HTTP **200** + `text/html`），`res.ok` 拦不住，炸在 `res.json()` 上、报 `Unexpected token '<'`——看着像前端 bug，其实是后端没起。想直接用线上题库：`VITE_API_PROXY=https://go.xlingdata.com npm run dev`，⚠️ 此时本地「保存/删除」会真写生产库。
- **后端 DB 连接**：`db.py` 优先读 `DATABASE_URL`，否则用 `MYSQL_*` 拼 MySQL 串。测试/本地永远靠 `DATABASE_URL` 覆盖。

### 题库与教材目录（多册）

> 以下文件是**本机私有、不入库**的教材内容（见 `.gitignore`）：`src/data/catalog*.local.json`、
> `eval/ground-truth.*.json`、`eval/auto-read.json`、`eval/out/`。
> 公开仓库里只有 `src/data/catalog.example.json`（虚构的示例目录，一本真实目录都没有时自动回落）。

**一本书一个文件**：`src/data/catalog<.书 id>.local.json` 被 `import.meta.glob` 一并加载，按 `order` 排序。
加一本书 = 丢一个文件进来，代码不用动。每本书的字段：

| 字段 | 说明 |
|---|---|
| `id` | 书的标识，同时决定 `eval/ground-truth.<id>.json` 的文件名 |
| `prefix` | **题号前缀**，见下。第二本起必须非空且此前没用过 |
| `order` | 在加载弹窗里的排序 |
| `book` / `range` / `units` | 书目信息、收录区间、单元 → 小组（小组只存 `from`/`to`，因为每组正好 6 题占一页） |

**`prefix` 是题库主键的一部分，定了就不能改。** 两册书的题号区间完全重叠：死活册收 187–768，
手筋册的 265–288 正落在里面。后端 POST 是按 `problemNo` 的 upsert——不带前缀存手筋第 265 题，
会**静默覆盖**死活第 265 题：不报错、不冲突，只是那道题的棋形悄悄变了。
死活册是先来的，沿用裸数字（`prefix: ""`）；手筋册用 `"手筋-"`。
`catalog.test.js` 有断言守着「前缀唯一 + 至多一本空前缀」，别绕过。

`catalog.js` 提供 `books` / `bookOf()` / `locate()` / `problemsOf()` / `bareNo()` / `describe()`。
`locate()` **按前缀从长到短匹配**：空前缀那本能匹配任何字符串，必须最后才试，
否则 `手筋-265` 会先被它认成第 265 题。

**目录与题库是两回事，别合并**：目录是书的结构，与后端实际存了哪些题无关。
加载弹窗按目录下钻（书 → 单元 → 小组 → 题号；只有一本书时自动省掉「书」这层），
用后端返回的题号集合决定哪些能点，没入库的题号照样显示但置灰——「这一组还差几道」才一眼可见。
数「有几道在库」**必须按完整题号数**（`countIn` 走 `problemsOf`），按裸数字数会把死活册的 265
算进手筋册的进度里。自己起名的题（如 `有眼杀无眼-248`）不在任何目录内，归入「最近保存」。

### 题库现状（2026-09-12）

线上 **614 道**，分属两册：

| 书 | id | 前缀 | 在库 | 说明 |
|---|---|---|---|---|
| 死活专项训练（从10级到5级） | `shihuo` | （裸数字） | **582**（187–768，5 单元 97 小组） | 已全本录完并逐题核对 |
| 手筋专项训练 | `tesuji` | `手筋-` | **24**（265–288，第 2 单元 4 组） | 在用，陆续上传 |

另有 8 道不在任何目录内：`167` / `170` / `手筋-259` 与 5 道 `有眼杀无眼-*`，归「最近保存」。
`手筋-259` 是灌库时从旧 `259` 改名而来——它就是后来定下 `prefix` 规则的那次撞车。
它属手筋册，但那一页（253–264）还没拍，所以暂不在 `catalog.tesuji.local.json` 里。

**死活册 582 道已全部人工逐题核对完成**（2026-09-09），`eval/ground-truth.shihuo.json` 的
`confidence` 字段现在全是 `verified`。手筋册 24 道同样逐题对照复核过
（`eval/ground-truth.tesuji.json`），这一批 `read_tile.py` 24/24 全中——照片平整、光均匀，
且手筋图左侧三列没那么挤，正好避开了它的主要失败模式。**别把这个成绩当成常态**。

复核有两条路，都用过：死活册那 582 道是在一个带 `db` 的 Artifact 校对台上过的
（左边书页切图、右边识别结果，点交叉点改子，判定由盘面差异算出而非让人再声明一次）；
题量小的批次直接看 `eval/out/cmp/` 的对照图更快，不必起校对台。

死活册几何识别的最终成绩（以人工结果为准，这才是该拿来做预期的数字）：

| | |
|---|---|
| 逐子准确率 | **96.29%**（10727 子错 398） |
| 逐题正确率 | **76.8%**（582 道错 135） |

**错子高度集中**：398 个错子挤在 135 道里（平均每道错 3 子），另外 447 道完全正确。
所以「抽查几道都对」说明不了任何问题——必须逐题过。

最后两处错（359 / 367）都是左下角 **A1 多出一颗白子**，与 `read_tile.py` 已知的
「左侧三列」弱点一致；它们混在 200 道里连着校时被漏过，是后来模型复看切图才捞出来的。
**一个孤零零在角上的多余子不改变棋形直觉，最难靠肉眼发现。**

### eval/ —— 书页照片 → 上架（固定流程）

新一批题目一律走这三步，别再手搓：

```bash
# 1) 照片 → 切图 → 识别 → 待校对 payload（不碰数据库）
python3 eval/ingest.py --book tesuji --first 289 页1.jpg 页2.jpg ...
python3 eval/ingest.py --book tesuji --first 289 --clipshare 4   # 或直接从共享板拉最新 4 张

# 2) 人工逐题复核 eval/out/cmp/c<题号>.png（左照片、右解析），改错的直接改 payload
#    这一步不能跳。理由见下面的准确率。

# 3) 上架：默认干跑，--write 才真写
python3 eval/publish.py eval/out/tesuji-289.json
python3 eval/publish.py eval/out/tesuji-289.json --write
```

`--first` 是**这批第一页第一题**的题号，每页固定 6 题往后推。前缀不用写，
`ingest.py` 从 `src/data/catalog.<book>.local.json` 读——**别在脚本里硬编码前缀**，
抄一份就有抄错的机会，而错的后果是静默覆盖另一本书的题。

**中间那步「补目录」容易忘**：`ingest.py` 生成的 `eval/out/<book>-<first>.md` 里列着，
把这几页页眉上的单元名、页首的小组名按 6 题一组追加进目录文件。目录不补，
题目在加载弹窗里只会出现在「最近保存」，按书翻不到。

`publish.py` 有三道闸，都是为了挡住「静默写坏另一道题」：
**① 干跑是默认**；**② 题号已存在就中止**（新一批应该是纯新增，撞号=前缀写错或 `--first` 算错，
要覆盖得显式 `--force`）；**③ 写完逐条回读比对**，不一致就非零退出——HTTP 200 只说明请求到了。
通过后自动把这批追加进 `eval/ground-truth.<book>.json`，`confidence` 记 `verified`。

底层两个脚本仍可单独用：

```bash
python3 eval/slice_page.py <书页照片> <起始题号> [输出目录]   # 一页切成 6 张单题图
python3 eval/read_tile.py eval/tiles/q283.png              # 读出棋形，输出 JSON
python3 eval/compare.py <切图> '<read_tile 的 JSON>' <出图>  # 单题返工时重画对照图
```

`read_tile.py` 是**确定性图像处理，不调模型**：背景扣除 → 定网格 → 判子。
全书 582 道人工校完后的最终成绩：逐子 **96.29%**、逐题 **76.8%**。
这批照片书页拱起明显，**左侧三列**是主要失败模式（漏白子，也会在 A1 凭空多出白子）。

**它自报的可疑点不是可靠的分诊信号**——全量数据上：有可疑点的 70 道里 33% 有错，
零可疑点的 512 道里 22% 有错，区分度很弱。中途曾用 185 道的子集估出「68% vs 4%」
并据此缩小复核范围，**那个数字没有在全量上重现**（子集选择偏差）。
结论：想要正确的题库只能逐题人工过，别指望自动分诊。


几条踩过的坑写在了脚本注释里，改之前先读：网格线要按**全局共享的倾斜角**定位
（逐条自由拟合会在外推时相邻两条挤到一起）；被棋子盖住的线要按间距还原序号补回；
白子必须**正着认**（查整圈轮廓），只靠「内圈干净」会把网格外的空白纸面整片认成白子。

`eval/ground-truth.<book>.json` 是每本书人工确认的基准（`publish.py` 追加），
`eval/auto-read.json` 是死活册 283–768 的自动识别结果（含 `weak` 标记，未经人工核对）。
切图 `eval/tiles/`、流水线产物 `eval/out/` 与原始照片 `题目照片/` 都已 gitignore。

## 环境变量与密钥

- `VITE_MINIMAX_API_KEY` / `VITE_MINIMAX_API_HOST` 在 `.env.local`（已 gitignore）。**前端直连 MiniMax，key 会打进打包产物**——本项目定位个人家庭工具，勿引入公开生产场景。
- 后端 MySQL 密码走 `backend/.env`（参考 `.env.example`），绝不入库。

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

- 提交信息风格参照 git log：`feat(M4): 中文描述`。
- `测试棋形-*.jpg`、`围棋网页应用背景图生成.png`、`backend/**/*.db`、`.env.local` 均已 gitignore，不要提交。
- 图片识别（`ImageImport`）为**实验性**功能：MiniMax `MiniMax-Text-01` 两轮对话（第一轮定坐标系与黑白特征，第二轮逐格扫描出 JSON），准确率不稳定属已知现状，勿当可靠功能依赖。
