# Команды для настройки домена maslahub.ru

## Подключение к серверу
```bash
ssh root@92.53.96.223
```

## Команда 1: Создание конфигурации Nginx
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
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
```

## Команда 2: Активация конфигурации
```bash
ln -sf /etc/nginx/sites-available/maslahub.ru /etc/nginx/sites-enabled/
```

## Команда 3: Проверка конфигурации
```bash
nginx -t
```

## Команда 4: Перезагрузка Nginx
```bash
systemctl reload nginx
```

## Команда 5: Установка Certbot (если не установлен)
```bash
apt update && apt install certbot python3-certbot-nginx -y
```

## Команда 6: Получение SSL сертификата
```bash
certbot --nginx -d maslahub.ru -d www.maslahub.ru
```

Certbot спросит:
- Email (введите ваш email)
- Согласие с условиями (нажмите Y)

## Команда 7: Проверка работы
```bash
curl https://maslahub.ru/m2/health
```

Должен вернуть:
```json
{"status":"ok","timestamp":"...","uptime":...}
```

## Готово!

Теперь обновите webhook URL в МойСклад:
- Старый: `https://старый-домен.com/m2/webhook`
- Новый: `https://maslahub.ru/m2/webhook`
