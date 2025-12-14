#!/bin/bash
# Скрипт для настройки maslahub.ru на сервере

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SERVER="root@92.53.96.223"

echo -e "${BLUE}=== Настройка домена maslahub.ru ===${NC}"
echo ""
echo "Введите пароль от сервера:"
read -s PASSWORD

echo ""
echo -e "${BLUE}Шаг 1: Копирование скрипта на сервер...${NC}"
sshpass -p "$PASSWORD" scp setup-maslahub.sh $SERVER:/root/

echo -e "${GREEN}✓ Скрипт скопирован${NC}"
echo ""

echo -e "${BLUE}Шаг 2: Запуск настройки на сервере...${NC}"
sshpass -p "$PASSWORD" ssh $SERVER 'bash /root/setup-maslahub.sh'

echo ""
echo -e "${GREEN}=== Готово! ===${NC}"
echo "Webhook URL: https://maslahub.ru/m2/webhook"
