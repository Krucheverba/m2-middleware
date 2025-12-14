#!/bin/bash

# Принудительный перезапуск с новыми переменными окружения

SERVER="root@89.223.125.212"

echo "🔄 Принудительный перезапуск с новыми переменными..."
echo ""

ssh $SERVER << 'ENDSSH'
cd /root/m2-middleware

echo "📋 ШАГ 1: Остановка и удаление из PM2..."
pm2 delete m2-middleware 2>/dev/null || true
pm2 kill

echo ""
echo "📋 ШАГ 2: Запуск PM2 заново..."
pm2 start ecosystem.config.js

echo ""
echo "📋 ШАГ 3: Сохранение..."
pm2 save

echo ""
echo "⏳ Ждем 5 секунд..."
sleep 5

echo ""
echo "📋 ШАГ 4: Проверка логов..."
tail -n 30 logs/combined.log | grep "YANDEX_CAMPAIGN_ID"

echo ""
echo "📋 ШАГ 5: Статус:"
pm2 status

ENDSSH

echo ""
echo "✅ Готово!"
