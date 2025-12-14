#!/bin/bash

SERVER="root@89.223.125.212"

echo "📦 Проверка синхронизации остатков МойСклад → M2"
echo "================================================="
echo ""

echo "1. Проверка .env конфигурации:"
ssh $SERVER "cd /root/m2-middleware && grep -E '(YANDEX_CAMPAIGN_ID|MS_TOKEN|SYNC_INTERVAL)' .env"
echo ""

echo "2. Проверка cron задач:"
ssh $SERVER "pm2 logs m2-middleware --lines 100 --nostream | grep -i 'sync\|stock\|cron' | tail -20"
echo ""

echo "3. Последние логи синхронизации остатков:"
ssh $SERVER "tail -50 /root/m2-middleware/logs/combined.log | grep -i stock"
echo ""

echo "4. Статистика маппинга:"
curl -s https://maslahub.ru/m2/api/mapping/stats | head -c 500
echo ""
echo ""

echo "5. Проверка webhook от МойСклад:"
ssh $SERVER "cat /etc/nginx/sites-enabled/maslahub | grep -A 10 'location.*webhook'"
