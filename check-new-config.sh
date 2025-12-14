#!/bin/bash

# Проверка новой конфигурации

SERVER="root@89.223.125.212"

echo "🔍 Проверка новой конфигурации..."
echo ""

ssh $SERVER << 'ENDSSH'
cd /root/m2-middleware

echo "📋 Содержимое .env:"
cat .env

echo ""
echo "📋 Последние 50 строк из combined.log (свежие):"
tail -n 50 logs/combined.log | grep "YANDEX_CAMPAIGN_ID\|Запуск M2"

ENDSSH
