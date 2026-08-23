#!/usr/bin/env bash
# NoEscape deploy script — tõmbab GitHubist uusima versiooni, buildib, deployb.
# Jooksuta: ./deploy.sh  (või ütle Hermesele "deploy noescape")
set -euo pipefail

cd ~/dev/noescape

echo "📦 Pulling latest from GitHub..."
git pull origin main

echo ""
echo "🔧 Backend — installing deps..."
cd no-escape-back
npm ci 2>/dev/null || npm install

echo "🗄️  Running Prisma migrations..."
npx prisma migrate deploy
npx prisma generate

echo "🌱 Seeding catalog (skills, rewards, quests)..."
npx prisma db seed

echo "🏗️  Building backend..."
npm run build

echo ""
echo "🎨 Frontend — installing deps..."
cd ../NoEscape-UI
npm ci 2>/dev/null || npm install

echo "🏗️  Building frontend (production)..."
npx ng build --configuration production

echo ""
echo "🔄 Restarting PM2 process..."
pm2 restart noescape

echo ""
echo "✅ Deploy complete!"
echo "   API:  http://localhost:8084/api"
echo "   UI:   http://localhost:8084/"
echo ""
echo "   (Tailscale: https://blackstack-core-vnic.tail87349a.ts.net:443 → add route)"
