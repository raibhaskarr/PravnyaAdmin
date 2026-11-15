#!/usr/bin/env bash
set -euo pipefail
cd ~/apps/PravnyaAdmin
git fetch origin
git checkout main
git reset --hard origin/main

rm -rf /tmp/pravnyaadmin-deploy-artifacts
mkdir -p /tmp/pravnyaadmin-deploy-artifacts
tar xzf /tmp/pravnyaadmin-deploy.tar.gz -C /tmp/pravnyaadmin-deploy-artifacts
rm -f /tmp/pravnyaadmin-deploy.tar.gz

# Settings from the repo's GitHub "production" environment, sent by the deploy workflow.
if [ -f /tmp/pravnyaadmin.env ]; then
  ~/apps/install-env.sh /tmp/pravnyaadmin.env ~/apps/PravnyaAdmin/backend/.env NODE_ENV PORT DATABASE_URL JWT_SECRET
fi

cd ~/apps/PravnyaAdmin/backend
rm -rf node_modules
npm ci
npx prisma generate
rm -rf dist
mv /tmp/pravnyaadmin-deploy-artifacts/backend/dist dist
npx prisma migrate deploy
pm2 restart pravnyaadmin-backend

sudo cp -r /tmp/pravnyaadmin-deploy-artifacts/frontend/dist/. /var/www/pravnya-admin/
sudo chown -R www-data:www-data /var/www/pravnya-admin

rm -rf /tmp/pravnyaadmin-deploy-artifacts
