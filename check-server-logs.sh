#!/bin/bash

# Проверка логов на сервере

SERVER="root@89.223.125.212"

echo "🔍 Проверка логов на сервере..."
echo ""

ssh $SERVER << 'ENDSSH'
cd /root/m2-middleware

echo "📋 Последние 50 строк из pm2-out.log:"
tail -n 50 logs/pm2-out.log

echo ""
echo "📋 Последние 20 строк из pm2-error.log:"
tail -n 20 logs/pm2-error.log

ENDSSH
