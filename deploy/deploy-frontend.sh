#!/usr/bin/env bash
# 前端部署：构建并同步 dist/ 到目标服务器的 nginx 站点根。
# 后端无关，纯静态更新随时可跑。
# 用法（项目根目录本机执行）：bash deploy/deploy-frontend.sh
set -euo pipefail

# 目标从 deploy/deploy.env 读（见 deploy.env.example）。
# 公开仓库里不硬编码服务器地址。
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/deploy.env" ] && . "$HERE/deploy.env"
SRV="${GOBOARD_DEPLOY_HOST:?未设置 GOBOARD_DEPLOY_HOST，请复制 deploy/deploy.env.example 为 deploy.env 并填写}"
WEBDIR="${GOBOARD_WEB_DIR:?未设置 GOBOARD_WEB_DIR}"
SITE="${GOBOARD_SITE_URL:?未设置 GOBOARD_SITE_URL}"
# 站点根：nginx 容器 <nginx 容器> 的 go-board.conf 里写的是 root <容器内站点根>，
# 而 该路径挂载自宿主机 <宿主机 web 根>。
# 曾经写成 <另一棵无人服务的目录树> —— 那是另一棵无人服务的目录树，
# rsync 会安静地新建它并同步成功，线上却纹丝不动（脚本还照样打印 ✅）。
# 改这个路径前先在服务器上核对：
#   docker inspect <nginx 容器> --format '{{range .Mounts}}{{.Source}} => {{.Destination}}{{println}}{{end}}'
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> 构建前端"
cd "$ROOT"
npm run build

echo "==> 同步 dist/ 到 $WEBDIR"
rsync -avz --delete "$ROOT/dist/" "$SRV:$WEBDIR/"

echo "==> 自检：线上 index.html 是否指向本次构建的产物"
JS=$(basename "$(ls "$ROOT"/dist/assets/*.js | head -1)")
if curl -fsS -m 20 "$SITE/" | grep -q "$JS"; then
  # 花括号不能省：$SITE 后面紧跟全角括号时，bash 会把多字节字符一起
  # 读进变量名，于是在 set -u 下报 "SITE（: unbound variable" —— 而且只在
  # 自检**通过**的那条分支上炸，部署其实已经成功了，看着像部署失败。
  echo "✅ 前端已更新：${SITE}（${JS}）"
else
  echo "❌ 线上 index.html 未引用 ${JS} —— 同步目录可能不是 nginx 的站点根，请核对 WEBDIR" >&2
  exit 1
fi
