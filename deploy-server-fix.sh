#!/bin/bash

# Скрипт для обновления server.js на сервере
# Использование: ./deploy-server-fix.sh

SERVER="root@89.223.125.212"
REMOTE_PATH="/root/m2-middleware"

echo "🚀 Начинаем обновление server.js на сервере..."

# 1. Проверяем что файл существует локально
if [ ! -f "src/server.js" ]; then
    echo "❌ Ошибка: файл src/server.js не найден локально"
    exit 1
fi

echo "✅ Локальный файл найден"

# 2. Копируем файл на сервер
echo "📤 Копируем server.js на сервер..."
scp src/server.js $SERVER:$REMOTE_PATH/src/server.js

if [ $? -ne 0 ]; then
    echo "❌ Ошибка при копировании файла"
    exit 1
fi

echo "✅ Файл скопирован"

# 3. Проверяем что файл обновился
echo "🔍 Проверяем что файл обновился..."
ssh $SERVER "grep -q '/m2/health' $REMOTE_PATH/src/server.js"

if [ $? -eq 0 ]; then
    echo "✅ Файл успешно обновлён на сервере"
else
    echo "❌ Файл не обновился, проверьте вручную"
    exit 1
fi

# 4. Перезапускаем PM2
echo "🔄 Перезапускаем PM2..."
ssh $SERVER "cd $REMOTE_PATH && pm2 restart m2-middleware"

if [ $? -ne 0 ]; then
    echo "❌ Ошибка при перезапуске PM2"
    exit 1
fi

echo "✅ PM2 перезапущен"

# 5. Ждём 2 секунды для запуска
echo "⏳ Ждём запуска сервера..."
sleep 2

# 6. Проверяем health endpoint
echo "🏥 Проверяем health endpoint..."
HEALTH_RESPONSE=$(curl -s https://mirmasla.online/m2/health)

if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
    echo "✅ Сервер работает!"
    echo "📊 Ответ: $HEALTH_RESPONSE"
else
    echo "❌ Сервер не отвечает правильно"
    echo "📊 Ответ: $HEALTH_RESPONSE"
    exit 1
fi

# 7. Проверяем webhook endpoint
echo "🔗 Проверяем webhook endpoint..."
WEBHOOK_RESPONSE=$(curl -s https://mirmasla.online/m2/webhook)

if echo "$WEBHOOK_RESPONSE" | grep -q '"name":"M2 Middleware Webhook"'; then
    echo "✅ Webhook работает!"
    echo "📊 Ответ: $WEBHOOK_RESPONSE"
else
    echo "⚠️  Webhook не отвечает правильно"
    echo "📊 Ответ: $WEBHOOK_RESPONSE"
fi

echo ""
echo "🎉 Обновление завершено успешно!"
echo ""
echo "Доступные endpoints:"
echo "  - https://mirmasla.online/m2/health"
echo "  - https://mirmasla.online/m2/webhook"
echo "  - https://mirmasla.online/m2/api/mapping/stats"
echo "  - https://mirmasla.online/m2/api/mapping/summary"
