# Ручная настройка SSL для maslahub.ru

Подключитесь к серверу:
```bash
ssh root@92.53.96.223
```

## Шаг 1: Создание конфигурации Nginx

```bash
cat > /etc/nginx/sites-available/maslahub.ru << 'EOF'
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
EOF
```

## Шаг 2: Активация конфигурации

```bash
ln -sf /etc/nginx/sites-available/maslahub.ru /etc/nginx/sites-enabled/
```

## Шаг 3: Проверка конфигурации

```bash
nginx -t
```

## Шаг 4: Перезагрузка Nginx

```bash
systemctl reload nginx
```

## Шаг 5: Установка Certbot (если не установлен)

```bash
apt update
apt install certbot python3-certbot-nginx -y
```

## Шаг 6: Получение SSL сертификата

```bash
certbot --nginx -d maslahub.ru -d www.maslahub.ru
```

Certbot спросит:
- Email: введите ваш email
- Согласие с условиями: Y
- Redirect HTTP to HTTPS: 2 (да, перенаправлять)

## Шаг 7: Проверка

```bash
curl https://maslahub.ru/m2/health
```

Должен вернуть:
```json
{"status":"ok","timestamp":"...","uptime":...}
```

## Готово!

Теперь в Яндекс.Маркет M2 настройте webhook:
- URL: `https://maslahub.ru/m2/webhook`
- События: Создание заказа, Изменение статуса заказа, Отмена заказа, Создание заявки на отмену заказа
