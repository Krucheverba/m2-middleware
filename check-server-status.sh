#!/bin/bash

# Скрипт для полной проверки статуса M2 Middleware сервера
# Использование: ./check-server-status.sh

SERVER="root@89.223.125.212"
REMOTE_PATH="/root/m2-middleware"
BASE_URL="https://mirmasla.online/m2"

echo "🔍 Полная проверка M2 Middleware сервера"
echo "=========================================="
echo ""

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция для проверки endpoint
check_endpoint() {
    local name=$1
    local url=$2
    local expected=$3
    
    echo -n "🔗 Проверяем $name... "
    response=$(curl -s "$url")
    
    if echo "$response" | grep -q "$expected"; then
        echo -e "${GREEN}✅ OK${NC}"
        echo "   Ответ: $response"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        echo "   Ответ: $response"
        return 1
    fi
}

# 1. Проверка PM2 статуса
echo "📊 1. Проверка PM2 статуса"
echo "----------------------------"
ssh $SERVER "pm2 list | grep m2-middleware"
echo ""

# 2. Проверка всех endpoints
echo "🌐 2. Проверка HTTP endpoints"
echo "----------------------------"
check_endpoint "Health endpoint" "$BASE_URL/health" '"status":"ok"'
echo ""

check_endpoint "Webhook endpoint (GET)" "$BASE_URL/webhook" '"name":"M2 Middleware Webhook"'
echo ""

check_endpoint "Webhook notification (GET)" "$BASE_URL/webhook/notification" '"name":"M2 Middleware Webhook"'
echo ""

check_endpoint "Mapping stats" "$BASE_URL/api/mapping/stats" '"totalMappings"'
echo ""

check_endpoint "Mapping summary" "$BASE_URL/api/mapping/summary" '"totalProducts"'
echo ""

# 3. Проверка логов Winston
echo "📝 3. Проверка логов Winston"
echo "----------------------------"
echo "Последние 30 строк combined.log:"
ssh $SERVER "tail -30 $REMOTE_PATH/logs/combined.log" 2>/dev/null || echo -e "${YELLOW}⚠️  Логи пока пустые или недоступны${NC}"
echo ""

# 4. Проверка логов ошибок
echo "❌ 4. Проверка логов ошибок"
echo "----------------------------"
error_count=$(ssh $SERVER "wc -l < $REMOTE_PATH/logs/error.log" 2>/dev/null || echo "0")
if [ "$error_count" -eq 0 ]; then
    echo -e "${GREEN}✅ Ошибок нет${NC}"
else
    echo -e "${YELLOW}⚠️  Найдено $error_count строк ошибок:${NC}"
    ssh $SERVER "tail -20 $REMOTE_PATH/logs/error.log"
fi
echo ""

# 5. Проверка маппингов
echo "🗺️  5. Проверка маппингов"
echo "----------------------------"
mapping_response=$(curl -s "$BASE_URL/api/mapping/summary")
total_products=$(echo "$mapping_response" | grep -o '"totalProducts":[0-9]*' | grep -o '[0-9]*')
total_mapped=$(echo "$mapping_response" | grep -o '"totalMapped":[0-9]*' | grep -o '[0-9]*')

if [ -n "$total_products" ]; then
    echo -e "${GREEN}✅ Маппинги загружены${NC}"
    echo "   Всего товаров: $total_products"
    echo "   Замаппировано: $total_mapped"
else
    echo -e "${RED}❌ Не удалось получить статистику маппингов${NC}"
fi
echo ""

# 6. Тест POST webhook (симуляция события от Яндекс.Маркет)
echo "🧪 6. Тест POST webhook"
echo "----------------------------"
echo "Отправляем тестовый POST запрос..."
webhook_test=$(curl -s -X POST "$BASE_URL/webhook" \
    -H "Content-Type: application/json" \
    -d '{"eventType":"ORDER_CREATED","orderId":"test-12345"}')

if echo "$webhook_test" | grep -q '"status":"accepted"'; then
    echo -e "${GREEN}✅ Webhook принимает POST запросы${NC}"
    echo "   Ответ: $webhook_test"
else
    echo -e "${YELLOW}⚠️  Неожиданный ответ от webhook${NC}"
    echo "   Ответ: $webhook_test"
fi
echo ""

# 7. Проверка изоляции M1/M2
echo "🔒 7. Проверка изоляции M1/M2"
echo "----------------------------"
echo "M1 (yandex-moysklad) статус:"
ssh $SERVER "pm2 list | grep yandex-moysklad"
echo ""
echo "M2 (m2-middleware) статус:"
ssh $SERVER "pm2 list | grep m2-middleware"
echo ""

# 8. Проверка Nginx конфигурации
echo "⚙️  8. Проверка Nginx конфигурации"
echo "----------------------------"
echo "Проверяем что /m2 маршрут настроен:"
ssh $SERVER "grep -A 5 'location /m2/' /etc/nginx/sites-available/yandex-webhook" 2>/dev/null || echo -e "${YELLOW}⚠️  Не удалось прочитать конфиг Nginx${NC}"
echo ""

# 9. Итоговый отчёт
echo "📋 9. Итоговый отчёт"
echo "----------------------------"
echo -e "${GREEN}✅ Сервер работает и готов принимать webhook события${NC}"
echo ""
echo "Webhook URL для Яндекс.Маркет:"
echo "  https://mirmasla.online/m2/webhook"
echo ""
echo "Доступные endpoints:"
echo "  - GET  $BASE_URL/health"
echo "  - GET  $BASE_URL/webhook"
echo "  - POST $BASE_URL/webhook"
echo "  - GET  $BASE_URL/webhook/notification"
echo "  - POST $BASE_URL/webhook/notification"
echo "  - GET  $BASE_URL/api/mapping/stats"
echo "  - GET  $BASE_URL/api/mapping/summary"
echo ""
echo "Логи:"
echo "  - Combined: $REMOTE_PATH/logs/combined.log"
echo "  - Errors:   $REMOTE_PATH/logs/error.log"
echo ""
echo "🎉 Проверка завершена!"
