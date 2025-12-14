#!/usr/bin/env node

/**
 * Скрипт для тестирования запуска сервера
 * Проверяет все зависимости и конфигурацию перед запуском
 */

console.log('🔍 Тестирование запуска M2 Middleware...\n');

// Шаг 1: Проверка Node.js версии
console.log('📦 Шаг 1: Проверка Node.js');
console.log(`   Node.js версия: ${process.version}`);
console.log(`   Платформа: ${process.platform}`);
console.log('');

// Шаг 2: Проверка .env файла
console.log('📄 Шаг 2: Проверка .env файла');
try {
  require('dotenv').config();
  console.log('   ✅ .env файл загружен');
  console.log(`   PORT: ${process.env.PORT || 'НЕ УСТАНОВЛЕН'}`);
  console.log(`   YANDEX_CAMPAIGN_ID: ${process.env.YANDEX_CAMPAIGN_ID || 'НЕ УСТАНОВЛЕН'}`);
  console.log(`   MS_TOKEN: ${process.env.MS_TOKEN ? '***установлен***' : 'НЕ УСТАНОВЛЕН'}`);
  console.log(`   YANDEX_TOKEN: ${process.env.YANDEX_TOKEN ? '***установлен***' : 'НЕ УСТАНОВЛЕН'}`);
} catch (error) {
  console.log(`   ❌ Ошибка загрузки .env: ${error.message}`);
}
console.log('');

// Шаг 3: Проверка папки logs
console.log('📁 Шаг 3: Проверка папки logs');
const fs = require('fs');
const path = require('path');
const logsDir = path.join(__dirname, '..', 'logs');

if (!fs.existsSync(logsDir)) {
  console.log('   ⚠️  Папка logs не существует, создаём...');
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log('   ✅ Папка logs создана');
  } catch (error) {
    console.log(`   ❌ Не удалось создать папку logs: ${error.message}`);
  }
} else {
  console.log('   ✅ Папка logs существует');
}
console.log('');

// Шаг 4: Проверка файла маппингов
console.log('📋 Шаг 4: Проверка файла маппингов');
const mappingFile = path.join(__dirname, '..', 'data', 'product-mappings.json');
if (fs.existsSync(mappingFile)) {
  console.log('   ✅ Файл product-mappings.json существует');
  try {
    const mappings = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
    const count = Object.keys(mappings).length;
    console.log(`   📊 Количество маппингов: ${count}`);
  } catch (error) {
    console.log(`   ⚠️  Ошибка чтения файла: ${error.message}`);
  }
} else {
  console.log('   ❌ Файл product-mappings.json НЕ НАЙДЕН');
}
console.log('');

// Шаг 5: Проверка зависимостей
console.log('📦 Шаг 5: Проверка зависимостей');
const dependencies = ['express', 'winston', 'axios', 'node-cron'];
let allDepsOk = true;

for (const dep of dependencies) {
  try {
    require(dep);
    console.log(`   ✅ ${dep}`);
  } catch (error) {
    console.log(`   ❌ ${dep} - НЕ УСТАНОВЛЕН`);
    allDepsOk = false;
  }
}

if (!allDepsOk) {
  console.log('\n   ⚠️  Некоторые зависимости не установлены!');
  console.log('   Запустите: npm install');
}
console.log('');

// Шаг 6: Попытка загрузить config
console.log('⚙️  Шаг 6: Проверка конфигурации');
try {
  const config = require('../src/config');
  console.log('   ✅ Конфигурация загружена успешно');
  console.log(`   PORT: ${config.PORT}`);
  console.log(`   YANDEX_CAMPAIGN_ID: ${config.YANDEX_CAMPAIGN_ID}`);
  console.log(`   LOG_LEVEL: ${config.LOG_LEVEL}`);
} catch (error) {
  console.log(`   ❌ Ошибка загрузки конфигурации: ${error.message}`);
  console.log(`   Stack: ${error.stack}`);
}
console.log('');

// Шаг 7: Попытка загрузить logger
console.log('📝 Шаг 7: Проверка logger');
try {
  const logger = require('../src/logger');
  console.log('   ✅ Logger загружен успешно');
  logger.info('Тестовое сообщение от скрипта проверки');
  console.log('   ✅ Тестовое сообщение записано');
} catch (error) {
  console.log(`   ❌ Ошибка загрузки logger: ${error.message}`);
  console.log(`   Stack: ${error.stack}`);
}
console.log('');

// Шаг 8: Попытка загрузить server (но не запускать)
console.log('🚀 Шаг 8: Проверка модуля server');
try {
  const { startServer } = require('../src/server');
  console.log('   ✅ Модуль server загружен успешно');
  console.log('   ℹ️  Для запуска используйте: node src/server.js');
} catch (error) {
  console.log(`   ❌ Ошибка загрузки server: ${error.message}`);
  console.log(`   Stack: ${error.stack}`);
}
console.log('');

console.log('✅ Проверка завершена!\n');
console.log('📋 Следующие шаги:');
console.log('   1. Если есть ошибки - исправьте их');
console.log('   2. Запустите сервер: node src/server.js');
console.log('   3. Или через PM2: pm2 start src/server.js --name m2-middleware');
