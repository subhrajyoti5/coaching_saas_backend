#!/bin/bash
git pull
npm install
npx prisma generate
npx prisma migrate deploy
pm2 restart coaching-backend
