#!/usr/bin/env node

/**
 * Скрипт для создания папки logs
 * Запускается перед стартом сервера
 */

const fs = require('fs');
const path = require('path');

console.log('📁 Создание папки logs...');

const logsDir = path.join(__dirname, '..', 'logs');

try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log('✅ Папка logs создана:', logsDir);
  } else {
    console.log('✅ Папка logs уже существует:', logsDir);
  }
  
  // Проверяем права на запись
  fs.accessSync(logsDir, fs.constants.W_OK);
  console.log('✅ Права на запись в папку logs есть');
  
  process.exit(0);
} catch (error) {
  console.error('❌ Ошибка при создании папки logs:', error.message);
  process.exit(1);
}
