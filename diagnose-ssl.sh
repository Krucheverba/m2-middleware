#!/bin/bash
# Диагностика SSL для maslahub.ru

SERVER="root@92.53.96.223"

echo "Введите пароль от сервера:"
read -s PASSWORD
echo ""

echo "=== Диагностика SSL для maslahub.ru ==="
echo ""

echo "1. Проверка DNS..."
dig +short maslahub.ru

echo ""
echo "2. Проверка конфигурации Nginx..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER 'ls -la /etc/nginx/sites-available/ | grep maslahub'

echo ""
echo "3. Проверка активных сайтов..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER 'ls -la /etc/nginx/sites-enabled/ | grep maslahub'

echo ""
echo "4. Проверка SSL сертификатов..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER 'ls -la /etc/letsencrypt/live/ | grep maslahub'

echo ""
echo "5. Проверка статуса Nginx..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER 'systemctl status nginx | head -5'

echo ""
echo "6. Проверка портов..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER 'netstat -tlnp | grep :80'
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER 'netstat -tlnp | grep :443'

echo ""
echo "7. Проверка логов Nginx..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER 'tail -20 /var/log/nginx/error.log'

echo ""
echo "=== Диагностика завершена ==="
