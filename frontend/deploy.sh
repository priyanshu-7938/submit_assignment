#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "📦 Pulling latest code..."
git pull

echo "📦 Installing root dependencies..."
npm i

echo "🔨 Building root..."
npm run build

echo "📦 Installing backend dependencies..."
cd ./backend
npm i

echo "🔨 Compiling TypeScript..."
npx tsc

cd ..   # back to project root
if pm2 describe <service-name> > /dev/null 2>&1; then
  pm2 reload <service-name>
else
  pm2 start ./backend/dist/server.js --name <service-name>
fi

echo "✅ Deploy script finished."
