#!/bin/bash
# Настройка домена maslahub.ru

echo "=== Шаг 1: Создание конфигурации Nginx ==="
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

echo ""
echo "=== Шаг 2: Активация конфигурации ==="
ln -sf /etc/nginx/sites-available/maslahub.ru /etc/nginx/sites-enabled/
echo "✓ Ссылка создана"

echo ""
echo "=== Шаг 3: Проверка конфигурации ==="
nginx -t

echo ""
echo "=== Шаг 4: Перезагрузка Nginx ==="
systemctl reload nginx
echo "✓ Nginx перезагружен"

echo ""
echo "=== Шаг 5: Проверка Certbot ==="
if ! command -v certbot &> /dev/null; then
    echo "Устанавливаем Certbot..."
    apt update
    apt install certbot python3-certbot-nginx -y
else
    echo "✓ Certbot установлен"
fi

echo ""
echo "=== Шаг 6: Получение SSL сертификата ==="
echo "Запускаем Certbot..."
certbot --nginx -d maslahub.ru -d www.maslahub.ru

echo ""
echo "=== Шаг 7: Проверка ==="
sleep 2
curl https://maslahub.ru/m2/health

echo ""
echo "=== ГОТОВО! ==="
echo "Webhook URL: https://maslahub.ru/m2/webhook"
