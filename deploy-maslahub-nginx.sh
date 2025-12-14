#!/bin/bash

SERVER="root@89.223.125.212"

echo "🚀 Деплой nginx конфига для maslahub.ru"
echo "========================================"
echo ""

# 1. Копируем конфиг на сервер
echo "1. Копируем nginx конфиг..."
scp nginx-maslahub.conf $SERVER:/etc/nginx/sites-available/maslahub

# 2. Создаем симлинк
echo "2. Активируем конфиг..."
ssh $SERVER "ln -sf /etc/nginx/sites-available/maslahub /etc/nginx/sites-enabled/maslahub"

# 3. Проверяем конфиг
echo "3. Проверяем nginx конфиг..."
ssh $SERVER "nginx -t"

# 4. Перезагружаем nginx
echo "4. Перезагружаем nginx..."
ssh $SERVER "systemctl reload nginx"

echo ""
echo "✅ Готово! Проверяем..."
sleep 2
curl -k https://maslahub.ru/health

echo ""
echo "🎉 Деплой завершен!"
