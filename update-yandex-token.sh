#!/bin/bash

if [ -z "$1" ]; then
  echo "❌ Ошибка: Укажи токен"
  echo "Использование: bash update-yandex-token.sh ВАШ_ТОКЕН"
  exit 1
fi

TOKEN=$1
SERVER="root@89.223.125.212"

echo "🔑 Обновление Yandex токена"
echo "============================"
echo ""

echo "1. Обновляем .env на сервере..."
ssh $SERVER "sed -i 's/^YANDEX_TOKEN=.*/YANDEX_TOKEN=$TOKEN/' /root/m2-middleware/.env"

echo "2. Проверяем что токен добавлен..."
ssh $SERVER "grep YANDEX_TOKEN /root/m2-middleware/.env"

echo ""
echo "3. Перезапускаем сервер..."
ssh $SERVER "pm2 restart m2-middleware"

echo ""
echo "4. Ждем 5 секунд..."
sleep 5

echo ""
echo "5. Проверяем логи..."
ssh $SERVER "pm2 logs m2-middleware --lines 20 --nostream"

echo ""
echo "✅ Готово! Токен обновлен и сервер перезапущен"
echo ""
echo "Проверь через 10-15 минут что синхронизация работает:"
echo "  ssh root@89.223.125.212 'tail -50 /root/m2-middleware/logs/combined.log | grep stock'"
