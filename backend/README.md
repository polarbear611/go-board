# go-board-api（题目保存/加载后端）

FastAPI + SQLAlchemy + PyMySQL 微服务，为前端提供 `/api/problems` CRUD，数据落库到 MySQL `go_board`。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 冒烟 `{status:'ok'}` |
| GET | `/api/problems` | 题目简表 `[{problemNo, updatedAt}]`，按 updatedAt 倒序 |
| GET | `/api/problems/{problem_no}` | 单题详情；不存在 404 |
| POST | `/api/problems` | upsert（按 problemNo），body `ProblemIn` |
| DELETE | `/api/problems/{problem_no}` | 204，幂等（不存在也 204） |

`updatedAt` 为毫秒时间戳 int，前端用 `new Date(ts)`。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `MYSQL_HOST` | `mysql` | DB 主机（容器网络别名） |
| `MYSQL_PORT` | `3306` | 端口 |
| `MYSQL_USER` | `root` | 用户 |
| `MYSQL_PASSWORD` | （无） | 密码，走 `.env`，勿入库 |
| `MYSQL_DATABASE` | `go_board` | 库名 |
| `DATABASE_URL` | （无） | 显式覆盖连接串（测试用 sqlite） |

## 本地开发 / 测试

```bash
python3 -m venv .venv
.venv/bin/pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt pytest httpx
DATABASE_URL=sqlite:///./test.db .venv/bin/pytest tests -q
```

## 部署（人工执行）

1. 建库（在 <mysql 容器> 上）：

   ```sql
   CREATE DATABASE IF NOT EXISTS go_board DEFAULT CHARACTER SET utf8mb4;
   ```

2. 在 `backend/` 下创建 `.env`（参考 `.env.example`，填真实密码）。

3. 起服务：

   ```bash
   docker compose up -d --build
   ```

   容器名 `go-board-api`，监听 8000（compose 映射 8002:8000 仅供调试），挂外部网络 `<docker 网络>`。

4. 在 nginx `go-board.conf` 的 server 块内增加反代（前端同源调 `/api`）：

   ```nginx
   location /api {
       proxy_pass http://go-board-api:8000/api;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

   reload nginx 后，`curl https://<域名>/api/health` 应返回 `{"status":"ok"}`。
