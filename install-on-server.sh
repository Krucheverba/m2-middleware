#!/bin/bash

# 🚀 Скрипт установки M2 Middleware на сервер
# Использование: bash install-on-server.sh

set -e  # Остановить при ошибке

echo "🚀 Начинаем установку M2 Middleware..."
echo ""

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ШАГ 1: Проверка Node.js
echo "📋 ШАГ 1: Проверка Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✅ Node.js установлен: $NODE_VERSION${NC}"
else
    echo -e "${YELLOW}⚠️  Node.js не найден. Устанавливаем...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo -e "${GREEN}✅ Node.js установлен${NC}"
fi
echo ""

# ШАГ 2: Проверка PM2
echo "📋 ШАГ 2: Проверка PM2..."
if command -v pm2 &> /dev/null; then
    PM2_VERSION=$(pm2 --version)
    echo -e "${GREEN}✅ PM2 установлен: $PM2_VERSION${NC}"
else
    echo -e "${YELLOW}⚠️  PM2 не найден. Устанавливаем...${NC}"
    npm install -g pm2
    echo -e "${GREEN}✅ PM2 установлен${NC}"
fi
echo ""

# ШАГ 3: Создание папки
echo "📋 ШАГ 3: Создание папки для M2..."
mkdir -p /root/m2-middleware
cd /root/m2-middleware
echo -e "${GREEN}✅ Папка создана: /root/m2-middleware${NC}"
echo ""

# ШАГ 4: Клонирование проекта
echo "📋 ШАГ 4: Клонирование проекта с GitHub..."
if [ -d ".git" ]; then
    echo -e "${YELLOW}⚠️  Проект уже клонирован. Обновляем...${NC}"
    git pull
else
    git clone https://github.com/Krucheverba/m2-middleware.git .
fi
echo -e "${GREEN}✅ Проект загружен${NC}"
echo ""

# ШАГ 5: Установка зависимостей
echo "📋 ШАГ 5: Установка зависимостей..."
npm install
echo -e "${GREEN}✅ Зависимости установлены${NC}"
echo ""

# ШАГ 6: Создание .env файла
echo "📋 ШАГ 6: Настройка .env файла..."
if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Файл .env уже существует. Пропускаем...${NC}"
else
    cp .env.example .env
    echo -e "${YELLOW}⚠️  ВАЖНО! Отредактируйте файл .env:${NC}"
    echo -e "${YELLOW}   nano .env${NC}"
    echo ""
    echo -e "${YELLOW}   Укажите:${NC}"
    echo -e "${YELLOW}   - PORT=3001${NC}"
    echo -e "${YELLOW}   - YANDEX_CAMPAIGN_ID=ваш_campaign_id_M2${NC}"
    echo -e "${YELLOW}   - YANDEX_TOKEN=ваш_токен_M2${NC}"
    echo -e "${YELLOW}   - MS_TOKEN=ваш_токен_moysklad${NC}"
fi
echo ""

# ШАГ 7: Проверка файла маппинга
echo "📋 ШАГ 7: Проверка файла маппинга..."
if [ -f "data/product-mappings.json" ]; then
    MAPPING_COUNT=$(grep -o "\".*\":" data/product-mappings.json | wc -l)
    echo -e "${GREEN}✅ Файл маппинга найден: $MAPPING_COUNT товаров${NC}"
else
    echo -e "${RED}❌ Файл маппинга НЕ найден!${NC}"
    echo -e "${YELLOW}   Скопируйте файл с вашего компьютера:${NC}"
    echo -e "${YELLOW}   scp data/product-mappings.json root@89.223.125.212:/root/m2-middleware/data/${NC}"
fi
echo ""

# ШАГ 8: Проверка порта
echo "📋 ШАГ 8: Проверка порта 3001..."
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${RED}❌ Порт 3001 занят!${NC}"
    echo -e "${YELLOW}   Процессы на порту 3001:${NC}"
    lsof -i :3001
else
    echo -e "${GREEN}✅ Порт 3001 свободен${NC}"
fi
echo ""

# Финальные инструкции
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 Установка завершена!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Следующие шаги:"
echo ""
echo "1. Отредактируйте .env файл:"
echo "   nano .env"
echo ""
echo "2. Скопируйте файл маппинга (если ещё не скопирован):"
echo "   scp data/product-mappings.json root@89.223.125.212:/root/m2-middleware/data/"
echo ""
echo "3. Запустите сервер:"
echo "   pm2 start src/server.js --name m2-middleware"
echo ""
echo "4. Проверьте логи:"
echo "   pm2 logs m2-middleware"
echo ""
echo "5. Настройте автозапуск:"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
