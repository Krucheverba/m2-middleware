#!/bin/bash

# Проверка .env на сервере

SERVER="root@89.223.125.212"

echo "🔍 Проверка .env файла на сервере..."
echo ""

ssh $SERVER << 'ENDSSH'
cd /root/m2-middleware

echo "📋 Содержимое .env файла:"
cat .env

ENDSSH
