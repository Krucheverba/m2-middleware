#!/usr/bin/env node

/**
 * Скрипт проверки готовности системы к миграции
 * 
 * Проверяет:
 * - Наличие токена МойСклад
 * - Доступность API МойСклад
 * - Наличие необходимых файлов и директорий
 * - Права доступа к файловой системе
 */

require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const config = require('../src/config');

const CHECKS = {
  ENV_FILE: 'Проверка файла .env',
  MS_TOKEN: 'Проверка токена МойСклад',
  MS_API: 'Проверка доступности API МойСклад',
  DATA_DIR: 'Проверка директории data/',
  BACKUP_DIR: 'Проверка директории data/backups/',
  MAPPING_FILE: 'Проверка файла маппинга',
  FILE_PERMISSIONS: 'Проверка прав доступа',
  MIGRATION_SCRIPT: 'Проверка скрипта миграции'
};

const results = {
  passed: [],
  failed: [],
  warnings: []
};

/**
 * Вывести результат проверки
 */
function printCheck(name, status, message = '') {
  const symbols = {
    pass: '✓',
    fail: '✗',
    warn: '⚠'
  };
  
  const colors = {
    pass: '\x1b[32m',
    fail: '\x1b[31m',
    warn: '\x1b[33m',
    reset: '\x1b[0m'
  };
  
  const symbol = symbols[status];
  const color = colors[status];
  const reset = colors.reset;
  
  console.log(`${color}${symbol}${reset} ${name}`);
  if (message) {
    console.log(`  ${message}`);
  }
}

/**
 * Проверка наличия файла .env
 */
async function checkEnvFile() {
  try {
    await fs.access('.env');
    results.passed.push(CHECKS.ENV_FILE);
    printCheck(CHECKS.ENV_FILE, 'pass');
    return true;
  } catch (error) {
    results.failed.push(CHECKS.ENV_FILE);
    printCheck(CHECKS.ENV_FILE, 'fail', 'Файл .env не найден');
    return false;
  }
}

/**
 * Проверка токена МойСклад
 */
async function checkMsToken() {
  const token = config.MS_TOKEN;
  
  if (!token) {
    results.failed.push(CHECKS.MS_TOKEN);
    printCheck(CHECKS.MS_TOKEN, 'fail', 'Токен не установлен в .env');
    return false;
  }
  
  if (token === 'fda4f28da58c5eb73775a6183857a65f642b04c6') {
    results.warnings.push(CHECKS.MS_TOKEN);
    printCheck(CHECKS.MS_TOKEN, 'warn', 'Используется токен из примера - требуется действующий токен');
    return false;
  }
  
  results.passed.push(CHECKS.MS_TOKEN);
  printCheck(CHECKS.MS_TOKEN, 'pass', `Токен установлен: ${token.substring(0, 10)}...`);
  return true;
}

/**
 * Проверка доступности API МойСклад
 */
async function checkMsApi() {
  try {
    const response = await axios.get(`${config.MS_BASE}/entity/product`, {
      headers: {
        'Authorization': `Bearer ${config.MS_TOKEN}`,
        'Accept-Encoding': 'gzip'
      },
      params: {
        limit: 1
      },
      timeout: 10000
    });
    
    results.passed.push(CHECKS.MS_API);
    printCheck(CHECKS.MS_API, 'pass', 'API МойСклад доступен');
    return true;
    
  } catch (error) {
    if (error.response && error.response.status === 401) {
      results.failed.push(CHECKS.MS_API);
      printCheck(CHECKS.MS_API, 'fail', 'Токен недействителен (401 Unauthorized)');
    } else if (error.code === 'ECONNREFUSED') {
      results.failed.push(CHECKS.MS_API);
      printCheck(CHECKS.MS_API, 'fail', 'Не удается подключиться к API МойСклад');
    } else {
      results.failed.push(CHECKS.MS_API);
      printCheck(CHECKS.MS_API, 'fail', `Ошибка: ${error.message}`);
    }
    return false;
  }
}

/**
 * Проверка директории data/
 */
async function checkDataDir() {
  try {
    const stats = await fs.stat('data');
    if (!stats.isDirectory()) {
      results.failed.push(CHECKS.DATA_DIR);
      printCheck(CHECKS.DATA_DIR, 'fail', 'data/ не является директорией');
      return false;
    }
    
    results.passed.push(CHECKS.DATA_DIR);
    printCheck(CHECKS.DATA_DIR, 'pass');
    return true;
    
  } catch (error) {
    results.failed.push(CHECKS.DATA_DIR);
    printCheck(CHECKS.DATA_DIR, 'fail', 'Директория data/ не найдена');
    return false;
  }
}

/**
 * Проверка директории data/backups/
 */
async function checkBackupDir() {
  try {
    await fs.access('data/backups');
    results.passed.push(CHECKS.BACKUP_DIR);
    printCheck(CHECKS.BACKUP_DIR, 'pass');
    return true;
    
  } catch (error) {
    // Попытаться создать директорию
    try {
      await fs.mkdir('data/backups', { recursive: true });
      results.passed.push(CHECKS.BACKUP_DIR);
      printCheck(CHECKS.BACKUP_DIR, 'pass', 'Директория создана');
      return true;
    } catch (createError) {
      results.failed.push(CHECKS.BACKUP_DIR);
      printCheck(CHECKS.BACKUP_DIR, 'fail', 'Не удалось создать директорию');
      return false;
    }
  }
}

/**
 * Проверка файла маппинга
 */
async function checkMappingFile() {
  try {
    const content = await fs.readFile('data/product-mappings.json', 'utf8');
    const data = JSON.parse(content);
    
    const mappingCount = Object.keys(data.mappings || {}).length;
    
    if (mappingCount === 0) {
      results.warnings.push(CHECKS.MAPPING_FILE);
      printCheck(CHECKS.MAPPING_FILE, 'warn', 'Файл существует, но маппинги отсутствуют (требуется миграция)');
    } else {
      results.passed.push(CHECKS.MAPPING_FILE);
      printCheck(CHECKS.MAPPING_FILE, 'pass', `Файл существует, маппингов: ${mappingCount}`);
    }
    return true;
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      results.warnings.push(CHECKS.MAPPING_FILE);
      printCheck(CHECKS.MAPPING_FILE, 'warn', 'Файл не найден (будет создан при миграции)');
    } else {
      results.failed.push(CHECKS.MAPPING_FILE);
      printCheck(CHECKS.MAPPING_FILE, 'fail', `Ошибка чтения файла: ${error.message}`);
    }
    return false;
  }
}

/**
 * Проверка прав доступа
 */
async function checkFilePermissions() {
  try {
    // Проверка записи в data/
    const testFile = 'data/.test-write-permission';
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
    
    results.passed.push(CHECKS.FILE_PERMISSIONS);
    printCheck(CHECKS.FILE_PERMISSIONS, 'pass', 'Права на запись в data/ есть');
    return true;
    
  } catch (error) {
    results.failed.push(CHECKS.FILE_PERMISSIONS);
    printCheck(CHECKS.FILE_PERMISSIONS, 'fail', 'Нет прав на запись в data/');
    return false;
  }
}

/**
 * Проверка скрипта миграции
 */
async function checkMigrationScript() {
  try {
    await fs.access('scripts/migrate-to-file-mapping.js');
    results.passed.push(CHECKS.MIGRATION_SCRIPT);
    printCheck(CHECKS.MIGRATION_SCRIPT, 'pass');
    return true;
    
  } catch (error) {
    results.failed.push(CHECKS.MIGRATION_SCRIPT);
    printCheck(CHECKS.MIGRATION_SCRIPT, 'fail', 'Скрипт миграции не найден');
    return false;
  }
}

/**
 * Вывести итоговый отчет
 */
function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('ИТОГОВЫЙ ОТЧЕТ');
  console.log('='.repeat(60));
  console.log(`Проверок пройдено:        ${results.passed.length}`);
  console.log(`Проверок провалено:       ${results.failed.length}`);
  console.log(`Предупреждений:           ${results.warnings.length}`);
  console.log('='.repeat(60));
  
  if (results.failed.length === 0 && results.warnings.length === 0) {
    console.log('\n✓ Система готова к миграции!');
    console.log('\nЗапустите миграцию командой:');
    console.log('  node scripts/migrate-to-file-mapping.js --backup --validate');
  } else if (results.failed.length === 0) {
    console.log('\n⚠ Система готова к миграции с предупреждениями');
    console.log('\nРекомендуется устранить предупреждения перед миграцией.');
    console.log('Затем запустите миграцию командой:');
    console.log('  node scripts/migrate-to-file-mapping.js --backup --validate');
  } else {
    console.log('\n✗ Система НЕ готова к миграции');
    console.log('\nУстраните ошибки перед запуском миграции.');
    
    if (results.failed.includes(CHECKS.MS_TOKEN) || results.failed.includes(CHECKS.MS_API)) {
      console.log('\nДля получения токена МойСклад:');
      console.log('  1. Войдите в МойСклад');
      console.log('  2. Перейдите в Настройки → Пользователи и права');
      console.log('  3. Создайте токен доступа');
      console.log('  4. Обновите MS_TOKEN в файле .env');
    }
  }
  
  console.log('');
}

/**
 * Главная функция
 */
async function main() {
  console.log('='.repeat(60));
  console.log('ПРОВЕРКА ГОТОВНОСТИ К МИГРАЦИИ');
  console.log('='.repeat(60));
  console.log('');
  
  await checkEnvFile();
  await checkMsToken();
  await checkMsApi();
  await checkDataDir();
  await checkBackupDir();
  await checkMappingFile();
  await checkFilePermissions();
  await checkMigrationScript();
  
  printSummary();
  
  // Код выхода
  if (results.failed.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Запуск
main().catch(error => {
  console.error('\nКритическая ошибка при проверке:', error.message);
  process.exit(1);
});
