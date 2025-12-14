#!/bin/bash

SERVER="root@89.223.125.212"

echo "🔒 Настройка SSL для maslahub.ru"
echo "================================="
echo ""

echo "1. Получаем SSL сертификат от Let's Encrypt..."
ssh $SERVER "certbot --nginx -d maslahub.ru -d www.maslahub.ru --non-interactive --agree-tos --email admin@maslahub.ru"

echo ""
echo "2. Проверяем сертификат..."
ssh $SERVER "certbot certificates | grep maslahub -A 10"

echo ""
echo "3. Перезагружаем nginx..."
ssh $SERVER "systemctl reload nginx"

echo ""
echo "4. Проверяем HTTPS..."
sleep 2
curl -I https://maslahub.ru/m2/health

echo ""
echo "✅ SSL настроен!"
