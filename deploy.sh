#!/bin/bash
set -e

git pull
npm install
npx prisma generate
pm2 restart coaching-backend --update-env
