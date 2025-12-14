#!/bin/bash

# Перезапуск с использованием ecosystem.config.js

SERVER="root@89.223.125.212"

echo "🔄 Перезапуск приложения через ecosystem.config.js..."
echo ""

ssh $SERVER << 'ENDSSH'
cd /root/m2-middleware

echo "📋 Остановка и удаление текущего процесса..."
pm2 delete m2-middleware 2>/dev/null || true

echo ""
echo "📋 Запуск через ecosystem.config.js..."
pm2 start ecosystem.config.js

echo ""
echo "📋 Сохранение конфигурации PM2..."
pm2 save

echo ""
echo "⏳ Ждем 5 секунд..."
sleep 5

echo ""
echo "📋 Статус приложения:"
pm2 list

echo ""
echo "📋 Последние 40 строк логов:"
pm2 logs m2-middleware --lines 40 --nostream

ENDSSH

echo ""
echo "✅ Готово!"
