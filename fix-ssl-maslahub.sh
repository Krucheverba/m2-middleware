#!/bin/bash
# Исправление SSL для maslahub.ru с sudo

SERVER="root@92.53.96.223"

echo "Введите пароль от сервера:"
read -s PASSWORD
echo ""

echo "=== Настройка SSL для maslahub.ru ==="
echo ""

echo "Шаг 1: Создание конфигурации Nginx..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER << 'ENDSSH'
sudo bash -c 'cat > /etc/nginx/sites-available/maslahub.ru << "EOF"
server {
    listen 80;
    listen [::]:80;
    server_name maslahub.ru www.maslahub.ru;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF'
echo "✓ Конфигурация создана"
ENDSSH

echo ""
echo "Шаг 2: Активация конфигурации..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER << 'ENDSSH'
sudo ln -sf /etc/nginx/sites-available/maslahub.ru /etc/nginx/sites-enabled/
echo "✓ Ссылка создана"
ENDSSH

echo ""
echo "Шаг 3: Проверка конфигурации..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER 'sudo nginx -t'

echo ""
echo "Шаг 4: Перезагрузка Nginx..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER << 'ENDSSH'
sudo systemctl reload nginx
echo "✓ Nginx перезагружен"
ENDSSH

echo ""
echo "Шаг 5: Установка Certbot..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER << 'ENDSSH'
if ! command -v certbot &> /dev/null; then
    echo "Устанавливаем Certbot..."
    sudo apt update
    sudo apt install certbot python3-certbot-nginx -y
    echo "✓ Certbot установлен"
else
    echo "✓ Certbot уже установлен"
fi
ENDSSH

echo ""
echo "Шаг 6: Получение SSL сертификата..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER << 'ENDSSH'
sudo certbot --nginx -d maslahub.ru -d www.maslahub.ru --non-interactive --agree-tos --email admin@maslahub.ru --redirect
echo "✓ SSL сертификат получен"
ENDSSH

echo ""
echo "Шаг 7: Проверка..."
sleep 3
curl -s https://maslahub.ru/m2/health

echo ""
echo "=== ГОТОВО! ==="
echo "Webhook URL: https://maslahub.ru/m2/webhook"
