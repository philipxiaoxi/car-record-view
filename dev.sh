#!/bin/bash
set -e

cleanup() {
  echo ""
  echo "正在关闭服务..."
  kill $SERVER_PID $WEB_PID 2>/dev/null
  wait $SERVER_PID $WEB_PID 2>/dev/null
  echo "已关闭。"
  exit 0
}

trap cleanup SIGINT SIGTERM

cd "$(dirname "$0")"

echo "正在启动服务..."

(cd server && npm run dev) &
SERVER_PID=$!

(cd web && npm run dev) &
WEB_PID=$!

echo ""
echo "前后端已启动："
echo "  Server: http://localhost:7001"
echo "  Web:    http://localhost:3000"
echo ""
echo "按 Ctrl+C 关闭所有服务"

wait
