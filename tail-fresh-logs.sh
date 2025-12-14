#!/bin/bash

# Показать свежие логи

SERVER="root@89.223.125.212"

echo "🔍 Свежие логи приложения..."
echo ""

ssh $SERVER << 'ENDSSH'
cd /root/m2-middleware

echo "📋 Последние 100 строк из logs/pm2-out.log:"
tail -n 100 logs/pm2-out.log | grep "2025-12-14 12:"

echo ""
echo "📋 Последние 20 строк из logs/pm2-error.log:"
tail -n 20 logs/pm2-error.log

echo ""
echo "📋 Статус PM2:"
pm2 status

ENDSSH
