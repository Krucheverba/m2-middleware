#!/bin/bash

# Проверка PM2 логов

SERVER="root@89.223.125.212"

echo "🔍 Проверка PM2 логов..."
echo ""

ssh $SERVER << 'ENDSSH'
echo "📋 Последние 50 строк из PM2 out log:"
tail -n 50 /root/.pm2/logs/m2-middleware-out.log

echo ""
echo "📋 Последние 30 строк из PM2 error log:"
tail -n 30 /root/.pm2/logs/m2-middleware-error.log

ENDSSH
