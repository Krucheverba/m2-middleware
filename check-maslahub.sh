#!/bin/bash

SERVER="root@89.223.125.212"

echo "🔍 Проверка maslahub.ru"
echo "======================="
echo ""

echo "1. Что слушает порт 3001:"
ssh $SERVER "lsof -i :3001 || netstat -tlnp | grep 3001"
echo ""

echo "2. PM2 процессы:"
ssh $SERVER "pm2 list"
echo ""

echo "3. Nginx конфиг для maslahub.ru:"
ssh $SERVER "cat /etc/nginx/sites-enabled/*maslahub* 2>/dev/null || echo 'Конфиг не найден'"
echo ""

echo "4. Проверка SSL сертификата:"
ssh $SERVER "certbot certificates | grep maslahub -A 10"
echo ""

echo "5. Проверка директории m2-middleware:"
ssh $SERVER "ls -la /root/m2-middleware/ | head -20"
echo ""

echo "6. Проверка .env файла:"
ssh $SERVER "grep PORT /root/m2-middleware/.env"
