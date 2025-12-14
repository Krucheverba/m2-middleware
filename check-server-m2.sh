#!/bin/bash

# Скрипт проверки сервера M2

SERVER="root@89.223.125.212"

echo "🔍 Проверка сервера M2..."
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "1. PM2 ПРОЦЕССЫ"
echo "═══════════════════════════════════════════════════════════"
ssh $SERVER "pm2 list"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "2. ПОИСК ДИРЕКТОРИЙ С ПРОЕКТАМИ"
echo "═══════════════════════════════════════════════════════════"
ssh $SERVER "find /root -name '.env' -type f 2>/dev/null | grep -v node_modules | head -10"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "3. ПРОВЕРКА ТОКЕНОВ В .env ФАЙЛАХ"
echo "═══════════════════════════════════════════════════════════"
for env_file in $(ssh $SERVER "find /root -name '.env' -type f 2>/dev/null | grep -v node_modules | head -10"); do
    echo "📄 $env_file:"
    ssh $SERVER "grep -E 'YANDEX_CAMPAIGN_ID|YANDEX_TOKEN|PORT' $env_file 2>/dev/null | sed 's/YANDEX_TOKEN=.*/YANDEX_TOKEN=***скрыт***/'"
    echo ""
done

echo "═══════════════════════════════════════════════════════════"
echo "4. ПРОВЕРКА NGINX"
echo "═══════════════════════════════════════════════════════════"
ssh $SERVER "nginx -t 2>&1 | head -5"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "5. ПРОВЕРКА ПОРТОВ"
echo "═══════════════════════════════════════════════════════════"
ssh $SERVER "netstat -tlnp | grep -E ':(3000|3001|3002)' || echo 'Порты 3000-3002 не заняты'"
echo ""

echo "✅ Проверка завершена!"
echo ""
echo "Теперь вы можете:"
echo "1. Определить правильную директорию M2"
echo "2. Определить имя PM2 процесса M2"
echo "3. Запустить deploy-token-update.sh"
echo ""
