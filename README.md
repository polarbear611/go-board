# GoSandbox 围棋练习沙盘

给孩子做围棋**手筋 / 死活题**练习的网页沙盘：自由摆棋 → 规则试下 / 正式对弈 →
中国规则数子 → 题目跨设备保存。纯 SVG 棋盘，前端零 UI 库、零状态库，依赖只有 react + react-dom。

典型用法：照着棋书摆好题目棋形 → 在数字棋盘上反复试下 → 验证正确后再把答案写到书上。

线上示例：<https://go.xlingdata.com>

> **关于题库**：本仓库**不含任何教材内容**。目录结构见 `src/data/catalog.example.json`，
> 把你自己的目录按同样格式放在 `src/data/catalog.local.json`（已 gitignore）即自动生效；
> 缺席时回落到示例目录，clone 下来直接能跑。题目棋形存在你自己的后端里（见 `backend/`）。
>
> **多本书**：一本书一个文件，`src/data/catalog.<书 id>.local.json` 会被一并加载。
> 第二本起必须在 JSON 里设一个非空 `prefix`（如 `"手筋-"`）——题号是题库主键，
> 两本书的第 265 题不带前缀会互相静默覆盖。`prefix` 定了就不能再改。

---

## 功能说明

### 1. 自由摆棋
- 黑子 / 白子 / 擦除三种画笔，单击交叉点落子或清除。
- 不校验围棋规则，可任意摆放，用来快速复刻书上的初始棋形。
- 键盘快捷键：`B` 黑子、`W` 白子、`E` 擦除。

### 2. 规则试下 / 正式对弈
- 严格按围棋规则落子：黑白交替、自动提子、禁着点（自杀）拦截。
- **完整位置 superko**：落子后局面与对局历史任一同形即禁手，覆盖单劫与多劫循环 / 同形再现。
- 非法落子时棋盘抖动并提示「打劫 / 禁入点」。
- **步序标号**：试下时每颗棋子上显示落子顺序（1、2、3…），黑子白字、白子黑字，数字过大时自动缩小字号。撤销 / 提子时标号随棋子一起消失。
- 提子计数：分别统计「白提黑」「黑提白」的子数。
- **虚手 / 终局**：可虚手（pass），连续两次虚手进入终局态；可「继续对弈」返回。

### 3. 终局数子（中国规则）
- 终局后**点击棋块标记 / 取消死子**（整块切换，半透明红叉显示）。
- 自动数子：每方得分 = 活子 + 仅被己方包围的空点；双方都接触的空点为单官，不计。
- 棋盘叠加显示地域归属（黑地 / 白地 / 单官）。
- 贴目可配置（默认 7.5），实时给出「黑胜 / 白胜 N 子」或「和棋」。

### 4. 题目保存 / 加载
- 自由摆棋摆好题形后「💾 保存题目」（输入题号）；「📂 加载题目」从列表载入。
- 试下不污染题目初始局面，可一键「↺ 还原题目初始局面」。
- 数据持久化到服务器 MySQL（经同源 `/api` 后端），跨设备共享。

### 5. 视野缩放

- 棋书上的题目永远在角上，全盘视图下棋形只占四分之一、棋子很小。面板「视野」区可切换 **左上 / 右上 / 左下 / 右下** 四个象限，或一键 **适应棋形** 按当前棋子自动取景。
- 象限跨 10 路，在中心线（天元）重叠一路，跨中线的棋形不会被切断。
- 坐标标注钉在视野边缘，缩放后照样看得见列标行号。
- 缩放纯粹是换 SVG viewBox，落子、提子、劫争判定完全不受影响；撤销 / 重做也不会改变当前视野。
- **终局数子时强制回到全盘并锁定切换**：数子要看整个盘面，缩在角上会把视野外的空点和死子算错。

### 6. 撤销 / 重做 / 清空
- 完整的 undo / redo 栈，快捷键 `⌘Z` 撤销、`⌘Y`（或 `⌘⇧Z`）重做。
- 一键清空棋盘。

### 7. 图片导入识别（实验性）
- 上传题目照片，调用 MiniMax 视觉模型识别棋形并自动摆盘。
- 采用**两轮对话**策略：第一轮定位棋盘左下角、建立 x/y 坐标系并确认黑白特征；第二轮逐格扫描输出 JSON。
- 含黑白冲突去重（同一点同时被判为黑白时保黑去白）。
- ⚠️ 受限于模型视觉能力，黑白子识别准确率不稳定，导入后通常需要手动微调。当作辅助而非可靠功能。

---

## 技术方案

| 维度 | 选型 |
| --- | --- |
| 框架 | React 19 |
| 构建 | Vite 8 |
| 样式 | Tailwind CSS v4（`@tailwindcss/vite` 插件，无 config 文件） |
| 状态 | `useReducer` 自封装 `useBoardStore`（无第三方状态库） |
| 渲染 | 纯 SVG 棋盘，`radialGradient` 实现立体棋子 |
| 后端 | FastAPI + SQLAlchemy + PyMySQL 微服务（题目持久化到 MySQL） |
| 测试 | 前端 Vitest（goRules / scoring）、后端 pytest |
| 视觉识别 | MiniMax-Text-01 多模态 API（两轮对话） |
| 部署 | 静态 SPA（Nginx + Docker）+ 独立后端容器（同源 `/api` 反代） |

### 目录结构
```
src/
├─ App.jsx                      # 顶层布局、快捷键、终局数子计算
├─ constants/board.js           # 棋盘常量 + boardToLabels 序列化
├─ api/problems.js              # 题目数据层（fetch 同源 /api）
├─ data/
│  ├─ catalog.js                # 教材目录：书 → 单元 → 小组 → 题号（多册，按前缀区分）
│  ├─ catalog.example.json      # 示例目录（真实目录 catalog*.local.json 已 gitignore）
│  └─ catalog.test.js           # 目录层单测：前缀唯一、题号不重叠、locate 不串本
├─ utils/
│  ├─ goRules.js                # 围棋规则：找块、数气、提子、superko
│  ├─ scoring.js                # 中国规则数子（地域 / 死子 / 胜负）
│  ├─ viewport.js               # 视野矩形：象限 / 适应棋形 / 坐标换算
│  └─ *.test.js                 # Vitest 单测
├─ store/useBoardStore.js       # useReducer 状态机（落子/对弈/终局/题目）
└─ components/
   ├─ Board/                    # SVG 棋盘、棋子、地域叠加
   ├─ ControlPanel/             # 模式切换、对弈面板、数子面板
   ├─ ProblemDialog/            # 题目保存 / 加载弹窗
   ├─ ImageImport/              # 图片上传 + MiniMax 两轮识别
   └─ Background/               # 背景装饰（当前为空）

backend/                        # FastAPI 后端（独立 docker-compose）
├─ app/{main,db,models,schemas}.py
└─ tests/test_problems.py       # pytest CRUD
```

### 关键实现点
- **坐标系**：SVG 用户单位中 `CELL_SIZE=40`、`PADDING=44`、`SVG_SIZE=808`；棋盘内部用 0-indexed `[row][col]` 二维数组，列标注 A–T 跳过 I。
- **围棋规则**（`goRules.js`）：`applyMove` 落子后先提走对方无气块，再检查己方是否自杀；劫争用完整位置 superko —— `serializeBoard(newBoard)` 命中对局历史局面集合 `positionHistory` 即禁手。
- **数子**（`scoring.js`）：死子先从盘面移除归对方地，空区域洪水填充按接触色判归属（仅一色为地、双色为单官），得分 = 活子 + 己方独占空点。
- **步序标号**：`store` 中 `playMoves: [{row,col}]` 按序记录试下落子，`App.jsx` 仅在 play 模式下据此生成 `moveNumMap`（`'row-col' → 步号`）传给 `Board → Stone`。被提子的位置因棋盘上已无子，自然不渲染标号。
- **题目存储**：`api/problems.js` 4 个 async 函数（list/get/save/delete）走同源 `/api/problems`；`store` 中 `problemSetup` 分离题目初始局面与试下棋盘，支持「还原题目」。

---

## 本地开发

```bash
npm install
npm run dev      # 启动开发服务器
npm run build    # 产物输出到 dist/
npm run preview  # 预览构建产物
npm test         # Vitest 单测（goRules / scoring）
```

后端（题目保存/加载，可选；不起后端时该功能不可用）：
```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
DATABASE_URL=sqlite:///./dev.db .venv/bin/uvicorn app.main:app --reload   # 本地用 sqlite
.venv/bin/pytest tests -q                                                 # 后端测试
```

### 环境变量（`.env.local`，已 gitignore）
```
VITE_MINIMAX_API_KEY=<你的 MiniMax API Key>
VITE_MINIMAX_API_HOST=https://api.minimaxi.com
```
> ⚠️ 前端直连 API，密钥会出现在打包后的 JS 中。仅作为个人家庭工具使用，请勿用于公开生产场景。

---

## 部署

**前端**（纯静态，日常更新只需这一步）：
```bash
bash deploy/deploy-frontend.sh     # = npm run build + rsync dist/
```

**后端**（仅 M2 首次或后端有改动时）：
```bash
bash deploy/deploy-backend.sh
```
该脚本会：在 <旧 mysql 容器名> 建 `go_board` 库 → 部署 `go-board-api` 容器（挂 `<docker 网络>` 网络）→ 给 `go-board.conf` 加 `/api` 反代（`nginx -t` 校验后 reload）→ `curl /api/health` 冒烟。MySQL 密码从服务器现有 `.env` 读取，**不写入仓库**。

> ⚠️ 2026-09-06 实测：`deploy-backend.sh` 里的服务器路径与容器名（`<宿主机 .env>`、
> `<错误的 nginx 配置路径>`、`<旧前端容器名>`、`<旧 mysql 容器名>`）**均已失效**，直接跑会失败；
> 线上后端本身正常，现成部署在服务器 `<服务器上的后端目录>`。详见脚本顶部注释。
>
> 前端站点根是 `<站点根>`（nginx 容器 `<nginx 容器>`）。
> 曾误写成 `<另一棵无人服务的目录树>`——那棵树无人服务，rsync 会安静地新建目录并报成功，
> 线上却不更新。`deploy-frontend.sh` 已修正，并加了「线上 index.html 是否引用本次构建产物」的自检。详见 `backend/README.md`。

---

## License

[MIT](LICENSE) © huangqin

音效素材由大模型生成，无第三方版权，出处与处理过程见 `public/sounds/README.md`。
本仓库不包含任何在售教材的目录或题目内容。
