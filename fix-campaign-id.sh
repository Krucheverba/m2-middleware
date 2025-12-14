#!/bin/bash

echo "🔧 Исправление Campaign ID на сервере..."

SERVER="root@89.223.125.212"
APP_DIR="/root/m2-middleware"

echo "1️⃣ Проверка текущего .env на сервере..."
ssh $SERVER "cd $APP_DIR && grep YANDEX_CAMPAIGN_ID .env"

echo ""
echo "2️⃣ Полная остановка PM2..."
ssh $SERVER "cd $APP_DIR && pm2 delete all"
sleep 2

echo ""
echo "3️⃣ Убиваем все процессы PM2..."
ssh $SERVER "cd $APP_DIR && pm2 kill"
sleep 2

echo ""
echo "4️⃣ Очистка кеша PM2..."
ssh $SERVER "rm -rf ~/.pm2"
sleep 1

echo ""
echo "5️⃣ Запуск приложения заново..."
ssh $SERVER "cd $APP_DIR && pm2 start ecosystem.config.js"
sleep 3

echo ""
echo "6️⃣ Проверка логов (первые 50 строк)..."
ssh $SERVER "cd $APP_DIR && pm2 logs m2-middleware --lines 50 --nostream"

echo ""
echo "✅ Готово! Проверьте логи выше на наличие правильного YANDEX_CAMPAIGN_ID=144131919"
