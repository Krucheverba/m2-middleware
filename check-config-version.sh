#!/bin/bash

# Проверка версии config.js на сервере

SERVER="root@89.223.125.212"

echo "🔍 Проверка версии config.js на сервере..."
echo ""

ssh $SERVER << 'ENDSSH'
cd /root/m2-middleware

echo "📋 Текущая версия Git:"
git log --oneline -1

echo ""
echo "📋 Содержимое src/config.js (первые 30 строк):"
head -n 30 src/config.js

ENDSSH
