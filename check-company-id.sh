#!/bin/bash

# Проверка MS_COMPANY_ID на сервере

SERVER="root@89.223.125.212"

echo "🔍 Проверка MS_COMPANY_ID на сервере..."
echo ""

ssh $SERVER << 'ENDSSH'
cd /root/m2-middleware

echo "📋 Конфигурация МойСклад в .env:"
grep "MS_" .env

echo ""
echo "📋 Статус приложения:"
pm2 list | grep m2-middleware

echo ""
echo "📋 Последние 30 строк логов:"
pm2 logs m2-middleware --lines 30 --nostream

ENDSSH
