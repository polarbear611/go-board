#!/usr/bin/env bash
# M2 后端一键部署：在生产服务器创建 go_board 库、部署 go-board-api 容器、
# 给 go.xlingdata.com 的 nginx 加 /api 反代，并重建前端。
#
# 设计原则：MySQL 密码从服务器已有的 <宿主机 .env> 读取，绝不写进本仓库。
# 用法（在项目根目录本机执行）：bash deploy/deploy-backend.sh
# ⚠️ 2026-09-06 核实：本脚本里的服务器路径与容器名**全部已失效**，直接跑会失败。
#   实测（ssh "$SRV"）：
#     <错误的 .env 路径>                 不存在  → 改用 <宿主机 .env>
#     <错误的 nginx 配置路径>  不存在  → 实际在 <nginx 配置>
#     容器 <旧前端容器名>                         不存在  → nginx 容器叫 <nginx 容器>
#     MySQL 容器 <旧 mysql 容器名>                      不存在  → 叫 <mysql 容器>
#   线上后端目前是好的（go-board-api 容器在跑、/api 反代正常），说明当初是用别的方式部署的，
#   服务器上的现成部署在 <服务器上的后端目录>（含 docker-compose.yml 与自己的 .env）。
#   下面的常量尚未逐条验证过，改之前请先在服务器上核对：
#     docker ps --format '{{.Names}}'
#     docker inspect <nginx 容器> --format '{{range .Mounts}}{{.Source}} => {{.Destination}}{{println}}{{end}}'
#   前端脚本 deploy-frontend.sh 已按实测修正，并加了部署后自检——
#   之前它把文件同步到一棵无人服务的目录树，rsync 成功、脚本打印 ✅，线上却纹丝不动。
set -euo pipefail

SRV="${GOBOARD_DEPLOY_HOST:?见 deploy/deploy.env.example}"
TWIN="<错误的目录树>"
APIDIR="<服务器上的后端目录>"
LOCAL_BACKEND="$(cd "$(dirname "$0")/.." && pwd)/backend"

echo "==> 1/6 创建 go_board 数据库（密码取自服务器 <宿主机 .env>）"
ssh "$SRV" 'set -e
  PW=$(grep -E "^MYSQL_PASSWORD=" '"$TWIN"'/.env | cut -d= -f2-)
  docker exec <旧 mysql 容器名> mysql -uroot -p"$PW" \
    -e "CREATE DATABASE IF NOT EXISTS go_board DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  echo "   go_board 已就绪"'

echo "==> 2/6 同步后端代码到 $APIDIR"
rsync -avz --delete \
  --exclude '.venv' --exclude '__pycache__' --exclude '*.db' --exclude '.env' \
  "$LOCAL_BACKEND/" "$SRV:$APIDIR/"

echo "==> 3/6 在服务器生成 backend/.env（密码取自 <宿主机 .env>，不入库）"
ssh "$SRV" 'set -e
  PW=$(grep -E "^MYSQL_PASSWORD=" '"$TWIN"'/.env | cut -d= -f2-)
  cat > '"$APIDIR"'/.env <<EOF
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=$PW
MYSQL_DATABASE=go_board
EOF
  echo "   .env 已写入"'

echo "==> 4/6 构建并启动 go-board-api 容器"
ssh "$SRV" "cd $APIDIR && docker compose up -d --build && sleep 3 && docker compose ps"

echo "==> 5/6 给 go-board.conf 加 /api 反代（若尚未存在），校验后 reload"
ssh "$SRV" 'set -e
  CONF='"$TWIN"'/nginx/go-board.conf
  if grep -q "location /api" "$CONF"; then
    echo "   /api 反代已存在，跳过"
  else
    cp "$CONF" "$CONF.bak.$(date +%Y%m%d-%H%M%S)"
    # 在最后一个 } 之前插入 /api location 块
    python3 - "$CONF" <<"PY"
import sys
p = sys.argv[1]
s = open(p).read()
block = """
    location /api {
        proxy_pass http://go-board-api:8000/api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
"""
idx = s.rstrip().rfind("}")
s = s[:idx] + block + s[idx:]
open(p, "w").write(s)
print("   已插入 /api 反代块")
PY
  fi
  docker exec <旧前端容器名> nginx -t
  docker exec <旧前端容器名> nginx -s reload
  echo "   nginx 已 reload"'

echo "==> 6/6 后端冒烟测试"
ssh "$SRV" 'curl -sk "$SITE"/api/health && echo "" || echo "   health 探测失败"'

echo ""
echo "✅ 后端部署完成。前端请另跑：bash deploy/deploy-frontend.sh"
