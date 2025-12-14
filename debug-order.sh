#!/bin/bash

# Скрипт для диагностики обработки заказа M2
# Использование: ./debug-order.sh ORDER_ID

ORDER_ID=${1:-"51764436992"}
SERVER="root@89.223.125.212"
REMOTE_PATH="/root/m2-middleware"

echo "🔍 Диагностика заказа M2: $ORDER_ID"
echo "========================================"
echo ""

# 1. Проверяем логи Winston за последние 5 минут
echo "📝 1. Логи Winston (последние 100 строк)"
echo "----------------------------"
ssh $SERVER "tail -100 $REMOTE_PATH/logs/combined.log | jq -r 'select(.timestamp != null) | \"\(.timestamp) [\(.level)]: \(.message)\"' 2>/dev/null || tail -100 $REMOTE_PATH/logs/combined.log"
echo ""

# 2. Проверяем логи ошибок
echo "❌ 2. Логи ошибок"
echo "----------------------------"
ssh $SERVER "tail -50 $REMOTE_PATH/logs/error.log | jq -r 'select(.timestamp != null) | \"\(.timestamp) [\(.level)]: \(.message)\"' 2>/dev/null || tail -50 $REMOTE_PATH/logs/error.log"
echo ""

# 3. Проверяем Nginx access log для webhook
echo "🌐 3. Nginx access log (webhook запросы)"
echo "----------------------------"
ssh $SERVER "tail -100 /var/log/nginx/access.log | grep '/m2/webhook'"
echo ""

# 4. Проверяем маппинг заказов
echo "🗺️  4. Маппинг заказов"
echo "----------------------------"
ssh $SERVER "cat $REMOTE_PATH/data/order-mappings.json 2>/dev/null | jq '.\"$ORDER_ID\"' || echo 'Файл маппингов заказов не найден или заказ не замаппирован'"
echo ""

# 5. Проверяем статус PM2
echo "📊 5. PM2 статус"
echo "----------------------------"
ssh $SERVER "pm2 list | grep m2-middleware"
echo ""

# 6. Проверяем что webhook настроен в Яндекс.Маркет
echo "🔗 6. Тест webhook endpoint"
echo "----------------------------"
echo "Отправляем тестовый POST с ORDER_CREATED..."
response=$(curl -s -X POST "https://mirmasla.online/m2/webhook" \
    -H "Content-Type: application/json" \
    -d "{\"eventType\":\"ORDER_CREATED\",\"orderId\":\"$ORDER_ID\"}")
echo "Ответ: $response"
echo ""

# 7. Проверяем логи после тестового webhook
echo "📝 7. Логи после тестового webhook (последние 20 строк)"
echo "----------------------------"
sleep 2
ssh $SERVER "tail -20 $REMOTE_PATH/logs/combined.log | jq -r 'select(.timestamp != null) | \"\(.timestamp) [\(.level)]: \(.message)\"' 2>/dev/null || tail -20 $REMOTE_PATH/logs/combined.log"
echo ""

# 8. Проверяем переменные окружения
echo "⚙️  8. Переменные окружения M2"
echo "----------------------------"
ssh $SERVER "cat $REMOTE_PATH/.env | grep -E '(YANDEX_CAMPAIGN_ID|YANDEX_TOKEN|MS_TOKEN)' | sed 's/=.*/=***HIDDEN***/'"
echo ""

echo "🎯 Итоги диагностики"
echo "----------------------------"
echo "Заказ ID: $ORDER_ID"
echo ""
echo "Возможные причины если заказ не создался:"
echo "1. Webhook не настроен в Яндекс.Маркет для Campaign ID 198473170"
echo "2. Яндекс.Маркет не отправил событие ORDER_CREATED"
echo "3. Ошибка при получении данных заказа из API"
echo "4. Ошибка при маппинге offerId → product.id"
echo "5. Ошибка при создании заказа в МойСклад"
echo ""
echo "Проверьте логи выше для деталей!"
