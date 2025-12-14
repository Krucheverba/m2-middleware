#!/bin/bash

echo "🔍 Диагностика M2 Middleware на сервере"
echo "========================================"
echo ""

echo "📁 Шаг 1: Проверка файлов"
echo "---"
echo "Проверяем .env файл:"
if [ -f "/root/m2-middleware/.env" ]; then
    echo "✅ Файл .env существует"
    echo "Содержимое (без токенов):"
    grep -v "TOKEN" /root/m2-middleware/.env || echo "⚠️  Не удалось прочитать .env"
else
    echo "❌ Файл .env НЕ НАЙДЕН!"
fi
echo ""

echo "Проверяем product-mappings.json:"
if [ -f "/root/m2-middleware/data/product-mappings.json" ]; then
    echo "✅ Файл маппингов существует"
    echo "Размер: $(ls -lh /root/m2-middleware/data/product-mappings.json | awk '{print $5}')"
    echo "Количество маппингов: $(grep -o '":' /root/m2-middleware/data/product-mappings.json | wc -l)"
else
    echo "❌ Файл маппингов НЕ НАЙДЕН!"
fi
echo ""

echo "📦 Шаг 2: Проверка node_modules"
echo "---"
if [ -d "/root/m2-middleware/node_modules" ]; then
    echo "✅ node_modules существует"
    echo "Размер: $(du -sh /root/m2-middleware/node_modules 2>/dev/null | awk '{print $1}')"
else
    echo "❌ node_modules НЕ НАЙДЕН! Нужно запустить: npm install"
fi
echo ""

echo "🔧 Шаг 3: Проверка PM2"
echo "---"
pm2 list
echo ""

echo "📝 Шаг 4: Последние логи PM2"
echo "---"
echo "OUT логи:"
tail -n 20 /root/.pm2/logs/m2-middleware-out.log 2>/dev/null || echo "⚠️  Логи пустые или не найдены"
echo ""
echo "ERROR логи:"
tail -n 20 /root/.pm2/logs/m2-middleware-error.log 2>/dev/null || echo "⚠️  Логи пустые или не найдены"
echo ""

echo "🚀 Шаг 5: Попытка запуска вручную (для диагностики)"
echo "---"
echo "Запускаем node src/server.js напрямую..."
cd /root/m2-middleware
timeout 5 node src/server.js 2>&1 || echo "⚠️  Процесс завершился или был остановлен"
echo ""

echo "✅ Диагностика завершена!"
echo ""
echo "📋 Следующие шаги:"
echo "1. Если .env не найден - создайте его с правильными параметрами"
echo "2. Если node_modules не найден - запустите: npm install"
echo "3. Если есть ошибки в логах - исправьте их"
echo "4. Проверьте что PORT=3001 в .env файле"
