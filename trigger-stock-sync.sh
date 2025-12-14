#!/bin/bash

# Ручной запуск синхронизации остатков

SERVER="root@89.223.125.212"

echo "🔄 Запуск синхронизации остатков вручную..."
echo ""

ssh $SERVER << 'ENDSSH'
cd /root/m2-middleware

echo "📋 Запуск синхронизации..."
node -e "
require('dotenv').config();
const StockService = require('./src/services/stockService');
const stockService = new StockService();

(async () => {
  try {
    console.log('Начинаем синхронизацию остатков...');
    await stockService.syncStocks();
    console.log('Синхронизация завершена!');
    process.exit(0);
  } catch (error) {
    console.error('Ошибка:', error.message);
    process.exit(1);
  }
})();
"

echo ""
echo "📋 Последние 30 строк логов:"
tail -n 30 logs/combined.log

ENDSSH

echo ""
echo "✅ Готово!"
