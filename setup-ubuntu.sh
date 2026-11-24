#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== COMP3810SEF 校園失物認領處：環境檢查 ==="

if ! command -v node >/dev/null 2>&1; then
  echo "錯誤：找不到 node。請先安裝 Node.js 20 或以上。"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "錯誤：找不到 npm。請先安裝 Node.js 20 或以上。"
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"

if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "錯誤：目前 Node.js 是 $(node -v)，需要 20 或以上。"
  exit 1
fi

if ! command -v mongod >/dev/null 2>&1; then
  echo "錯誤：找不到 mongod。請先安裝並啟動 MongoDB，步驟見 README。"
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env

  SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))')"
  sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=${SECRET}|" .env
  rm -f .env.bak

  echo "已建立 .env，並產生新的 SESSION_SECRET。"
  echo "請按需要修改 .env 內的 MongoDB URI 和 seed 密碼。"
fi

echo "安裝 npm 依賴..."
npm install

echo "建立 / 更新測試帳號..."
npm run seed

echo "檢查 MongoDB 與環境..."
npm run check

echo
echo "完成。執行 npm start 啟動伺服器：http://127.0.0.1:3000/"
