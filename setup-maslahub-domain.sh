#!/bin/bash
# Скрипт настройки домена maslahub.ru с SSL сертификатом

set -e

echo "=== Настройка домена maslahub.ru ==="

# Шаг 1: Создание конфигурации Nginx
echo "Шаг 1: Создание конфигурации Nginx..."
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

# Шаг 2: Активация конфигурации
echo "Шаг 2: Активация конфигурации..."
ln -sf /etc/nginx/sites-available/maslahub.ru /etc/nginx/sites-enabled/
echo "✓ Символическая ссылка создана"

# Шаг 3: Проверка конфигурации Nginx
echo "Шаг 3: Проверка конфигурации Nginx..."
nginx -t

# Шаг 4: Перезагрузка Nginx
echo "Шаг 4: Перезагрузка Nginx..."
systemctl reload nginx
echo "✓ Nginx перезагружен"

# Шаг 5: Установка Certbot (если не установлен)
echo "Шаг 5: Проверка установки Certbot..."
if ! command -v certbot &> /dev/null; then
    echo "Certbot не найден. Устанавливаем..."
    apt update
    apt install certbot python3-certbot-nginx -y
    echo "✓ Certbot установлен"
else
    echo "✓ Certbot уже установлен"
fi

# Шаг 6: Получение SSL сертификата
echo "Шаг 6: Получение SSL сертификата..."
echo "ВАЖНО: Certbot запросит email и согласие с условиями"
certbot --nginx -d maslahub.ru -d www.maslahub.ru --non-interactive --agree-tos --email admin@maslahub.ru || {
    echo "Попытка с интерактивным режимом..."
    certbot --nginx -d maslahub.ru -d www.maslahub.ru
}

echo "✓ SSL сертификат получен"

# Шаг 7: Проверка работы
echo "Шаг 7: Проверка работы..."
sleep 2
curl -k https://maslahub.ru/m2/health || echo "Предупреждение: health check не прошёл"

echo ""
echo "=== Настройка завершена! ==="
echo "Домен: https://maslahub.ru"
echo "Webhook URL для МойСклад: https://maslahub.ru/m2/webhook"
echo ""
echo "Следующий шаг: Обновите webhook URL в настройках МойСклад"
