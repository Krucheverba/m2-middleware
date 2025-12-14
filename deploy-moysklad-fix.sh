#!/bin/bash

# Скрипт для загрузки исправленного moySkladClient.js на сервер

SERVER="root@89.223.125.212"
PROJECT_DIR="/root/m2-middleware"

echo "📤 Загрузка исправленного moySkladClient.js на сервер..."
echo ""

echo "1️⃣ Создание резервной копии на сервере..."
ssh $SERVER "cd $PROJECT_DIR && cp src/api/moySkladClient.js src/api/moySkladClient.backup.\$(date +%s).js"

echo ""
echo "2️⃣ Загрузка исправленного файла..."
scp src/api/moySkladClient.js $SERVER:$PROJECT_DIR/src/api/

echo ""
echo "3️⃣ Перезапуск сервера..."
ssh $SERVER "cd $PROJECT_DIR && pm2 restart m2-middleware"

echo ""
echo "4️⃣ Проверка статуса..."
sleep 3
ssh $SERVER "pm2 info m2-middleware | grep -A 5 'status'"

echo ""
echo "✅ Готово! Исправление загружено на сервер"
echo ""
echo "📊 Проверьте логи через 10 минут (следующая синхронизация):"
echo "   bash check-sync-status.sh"
