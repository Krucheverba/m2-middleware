#!/bin/bash

# Скрипт для загрузки исправленного маппинга на сервер

SERVER="root@89.223.125.212"
PROJECT_DIR="/root/m2-middleware"

echo "📤 Загрузка исправленного маппинга на сервер..."
echo ""

echo "1️⃣ Создание резервной копии на сервере..."
ssh $SERVER "cd $PROJECT_DIR && cp data/product-mappings.json data/product-mappings.backup.\$(date +%s).json"

echo ""
echo "2️⃣ Загрузка нового маппинга..."
scp data/product-mappings.json $SERVER:$PROJECT_DIR/data/

echo ""
echo "3️⃣ Перезапуск сервера..."
ssh $SERVER "cd $PROJECT_DIR && pm2 restart m2-middleware"

echo ""
echo "4️⃣ Проверка статуса..."
sleep 3
ssh $SERVER "pm2 info m2-middleware | grep -A 5 'status'"

echo ""
echo "✅ Готово! Маппинг обновлён на сервере"
echo ""
echo "📊 Проверьте логи через 10 минут (следующая синхронизация):"
echo "   ssh $SERVER 'tail -100 $PROJECT_DIR/logs/combined.log | grep sync'"
