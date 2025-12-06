# 🚀 Развертывание M2 Middleware на сервере

## Быстрый старт

### 1. Клонирование репозитория

```bash
# Подключитесь к серверу
ssh user@your-server.com

# Создайте папку и клонируйте проект
mkdir ~/m2-middleware
cd ~/m2-middleware
git clone https://github.com/your-username/m2-middleware.git .
```

### 2. Установка зависимостей

```bash
npm install
```

### 3. Настройка .env файла

```bash
# Скопируйте пример
cp .env.example .env

# Отредактируйте файл
nano .env
```

**КРИТИЧНО! Укажите данные M2 (НЕ M1!):**

```env
PORT=3001
YANDEX_CAMPAIGN_ID=ваш_campaign_id_M2
YANDEX_TOKEN=ваш_токен_M2
MS_TOKEN=ваш_токен_moysklad
MS_BASE=https://api.moysklad.ru/api/remap/1.2
STOCK_SYNC_INTERVAL_MINUTES=10
ORDER_POLL_INTERVAL_MINUTES=5
LOG_LEVEL=info
```

### 4. Загрузка файла маппинга

```bash
# Скопируйте файл с вашего компьютера
# На вашем компьютере выполните:
scp data/product-mappings.json user@your-server.com:~/m2-middleware/data/
```

### 5. Запуск через PM2

```bash
# Установите PM2 (если нет)
sudo npm install -g pm2

# Запустите приложение
pm2 start src/server.js --name m2-middleware

# Настройте автозапуск
pm2 save
pm2 startup
```

### 6. Настройка Nginx

Добавьте в конфиг Nginx (`/etc/nginx/sites-available/your-domain.com`):

```nginx
# M2 - Webhook от МойСклад (DBS)
location /webhook/moysklad {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Перезагрузите Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 7. Настройка webhook в МойСклад

1. Зайдите в МойСклад → Настройки → Вебхуки
2. Создайте webhook:
   - URL: `https://your-domain.com/webhook/moysklad`
   - События: Изменение товара
   - Метод: POST

### 8. Проверка

```bash
# Проверьте статус
pm2 list

# Проверьте логи
pm2 logs m2-middleware
```

---

## 🔧 Полезные команды

```bash
# Посмотреть логи
pm2 logs m2-middleware

# Перезапустить
pm2 restart m2-middleware

# Остановить
pm2 stop m2-middleware

# Обновить код с GitHub
cd ~/m2-middleware
git pull
pm2 restart m2-middleware
```

---

## 🚨 Важно!

- ✅ Используйте Campaign ID и токен M2 (НЕ M1!)
- ✅ Порт должен быть 3001 (НЕ 3000, это M1!)
- ✅ Файл `data/product-mappings.json` должен содержать ТОЛЬКО товары M2
- ✅ НЕ загружайте `.env` файл в Git!

---

## 📞 Поддержка

Если что-то пошло не так - проверьте логи:

```bash
pm2 logs m2-middleware --lines 100
```
