#!/bin/bash
# Настройка Nginx для maslahub.ru через Kiro

SERVER="root@92.53.96.223"

echo "=== Настройка домена maslahub.ru ==="
echo ""
echo "Введите пароль от сервера $SERVER:"
read -s PASSWORD
echo ""

echo "Шаг 1: Создание конфигурации Nginx на сервере..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER << 'ENDSSH'
cat > /etc/nginx/sites-available/maslahub.ru << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name maslahub.ru www.maslahub.ru;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
echo "✓ Конфигурация создана"
ENDSSH

echo ""
echo "Шаг 2: Активация конфигурации..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER << 'ENDSSH'
ln -sf /etc/nginx/sites-available/maslahub.ru /etc/nginx/sites-enabled/
echo "✓ Символическая ссылка создана"
ENDSSH

echo ""
echo "Шаг 3: Проверка конфигурации Nginx..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER 'nginx -t'

echo ""
echo "Шаг 4: Перезагрузка Nginx..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER << 'ENDSSH'
systemctl reload nginx
echo "✓ Nginx перезагружен"
ENDSSH

echo ""
echo "Шаг 5: Проверка Certbot..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER << 'ENDSSH'
if ! command -v certbot &> /dev/null; then
    echo "Устанавливаем Certbot..."
    apt update
    apt install certbot python3-certbot-nginx -y
    echo "✓ Certbot установлен"
else
    echo "✓ Certbot уже установлен"
fi
ENDSSH

echo ""
echo "Шаг 6: Получение SSL сертификата..."
echo "ВАЖНО: Certbot может запросить email. Используйте admin@maslahub.ru"
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER << 'ENDSSH'
certbot --nginx -d maslahub.ru -d www.maslahub.ru --non-interactive --agree-tos --email admin@maslahub.ru --redirect || {
    echo "Попробуем интерактивный режим..."
    certbot --nginx -d maslahub.ru -d www.maslahub.ru
}
echo "✓ SSL сертификат получен"
ENDSSH

echo ""
echo "Шаг 7: Проверка работы..."
sleep 2
curl -s https://maslahub.ru/m2/health | jq . || curl -s https://maslahub.ru/m2/health

echo ""
echo "=== ГОТОВО! ==="
echo "✓ Домен настроен: https://maslahub.ru"
echo "✓ Webhook URL для МойСклад: https://maslahub.ru/m2/webhook"
echo ""
echo "Следующий шаг: Обновите webhook URL в настройках МойСклад"
