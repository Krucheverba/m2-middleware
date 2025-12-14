#!/bin/bash

SERVER="root@89.223.125.212"
BASE_URL="https://mirmasla.online/m2"

echo "🔍 Диагностика M2 Middleware"
echo "=========================================="
echo ""

# 1. PM2 статус
echo "📊 1. PM2 Статус"
echo "----------------------------"
ssh $SERVER "pm2 list | grep m2-middleware"
echo ""

# 2. Health check
echo "🏥 2. Health Check"
echo "----------------------------"
HEALTH=$(curl -s $BASE_URL/health)
if echo "$HEALTH" | grep -q "ok"; then
  echo "✅ Сервер работает"
  echo "$HEALTH" | jq '.'
else
  echo "❌ Сервер не отвечает"
fi
echo ""

# 3. Маппинги
echo "🗺️  3. Маппинги"
echo "----------------------------"
STATS=$(curl -s $BASE_URL/api/mapping/stats)
TOTAL=$(echo "$STATS" | jq -r '.totalMappings')
LOADED=$(echo "$STATS" | jq -r '.isLoaded')
echo "Всего маппингов: $TOTAL"
echo "Загружены: $LOADED"
echo ""

# 4. Логи Winston
echo "📝 4. Логи Winston (последние 5 строк)"
echo "----------------------------"
ssh $SERVER "tail -5 /root/m2-middleware/logs/combined.log | jq -r '.timestamp + \" [\" + .level + \"]: \" + .message'"
echo ""

# 5. Логи ошибок
echo "❌ 5. Логи ошибок (последние 3)"
echo "----------------------------"
ERROR_COUNT=$(ssh $SERVER "wc -l < /root/m2-middleware/logs/error.log")
if [ "$ERROR_COUNT" -eq 0 ]; then
  echo "✅ Ошибок нет"
else
  echo "⚠️  Найдено ошибок: $ERROR_COUNT"
  ssh $SERVER "tail -3 /root/m2-middleware/logs/error.log | jq -r '.timestamp + \" [\" + .level + \"]: \" + .message'"
fi
echo ""

# 6. Проверка YANDEX_TOKEN
echo "🔑 6. Проверка YANDEX_TOKEN"
echo "----------------------------"
ssh $SERVER "cd /root/m2-middleware && node test-polling.js 2>&1 | grep -A 5 'Получение заказов'"
echo ""

# 7. Nginx логи (последние webhook события)
echo "🌐 7. Nginx логи (последние POST запросы к webhook)"
echo "----------------------------"
ssh $SERVER "grep 'POST /m2/webhook' /var/log/nginx/access.log | tail -3"
echo ""

# 8. Итог
echo "📋 8. Итоговый статус"
echo "----------------------------"
if echo "$HEALTH" | grep -q "ok" && [ "$TOTAL" -gt 0 ] && [ "$LOADED" == "true" ]; then
  echo "✅ Сервер работает корректно"
  echo "✅ Маппинги загружены: $TOTAL"
  echo "✅ Логи пишутся"
  echo ""
  echo "⚠️  Проверьте вывод секции 6 для статуса YANDEX_TOKEN"
  echo "   Если видите '403 Forbidden' - нужно обновить токен"
  echo "   См. инструкцию в FIX_YANDEX_TOKEN.md"
else
  echo "❌ Обнаружены проблемы"
fi
echo ""
echo "Webhook URL: https://mirmasla.online/m2/webhook"
echo "Логи: ssh $SERVER 'tail -f /root/m2-middleware/logs/combined.log'"
