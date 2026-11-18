#!/usr/bin/env bash
# Manual deploy on the live machine. Pushing to main is the normal path
# (.github/workflows/deploy.yml does the same build).
# Credentials stay in no-escape-back/.env on this machine. Never commit them.
set -euo pipefail

cd ~/dev/noescape

echo "📦 Pulling latest from GitHub..."
git pull origin main

db_url=$(grep -E '^DATABASE_URL=' no-escape-back/.env || true)
case "$db_url" in
  *127.0.0.1*|*localhost*|*file:*)
    echo "Refusing to deploy: no-escape-back/.env points at a local database."
    exit 1
    ;;
  "")
    echo "Refusing to deploy: DATABASE_URL is missing from no-escape-back/.env."
    exit 1
    ;;
esac

echo ""
echo "🔧 Backend — installing deps..."
cd no-escape-back
npm ci

echo "🗄️ Running Prisma push..."
npx prisma generate
npx prisma db push

echo "🌱 Seeding catalog (skills, rewards, quests)..."
npx prisma db seed

echo "🏗️ Building backend..."
npm run build

echo ""
echo "🎨 Frontend — installing deps..."
cd ../NoEscape-UI
npm ci

echo "🏗️ Building frontend (production)..."
npx ng build --configuration production

echo ""
echo "🔄 Restarting PM2 process..."
pm2 restart noescape

echo ""
echo "✅ Deploy complete!"
echo " API: http://localhost:8084/api"
echo " UI: http://localhost:8084/"
echo ""
echo " (Tailscale → add route)"