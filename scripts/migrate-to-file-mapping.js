#!/usr/bin/env node

/**
 * CLI скрипт для миграции маппинга product.id → offerId
 * из кастомных атрибутов МойСклад в файловое хранилище
 * 
 * Использование:
 *   node scripts/migrate-to-file-mapping.js [опции]
 * 
 * Опции:
 *   --backup     Создать резервную копию перед миграцией
 *   --validate   Валидировать маппинги после миграции
 *   --help       Показать справку
 * 
 * Проверяет: Требования 10.1, 10.2, 10.3, 10.4, 10.5
 */

require('dotenv').config();

const config = require('../src/config');
const logger = require('../src/logger');
const MoySkladClient = require('../src/api/moySkladClient');
const ProductMappingStore = require('../src/storage/productMappingStore');
const MigrationService = require('../src/services/migrationService');

/**
 * Парсинг аргументов командной строки
 */
function parseArgs() {
  const args = process.argv.slice(2);
  
  const options = {
    backup: false,
    validate: false,
    help: false
  };

  for (const arg of args) {
    switch (arg) {
      case '--backup':
        options.backup = true;
        break;
      case '--validate':
        options.validate = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        console.error(`Неизвестная опция: ${arg}`);
        console.error('Используйте --help для справки');
        process.exit(1);
    }
  }

  return options;
}

/**
 * Показать справку
 */
function showHelp() {
  console.log(`
Миграция маппинга product.id → offerId из атрибутов МойСклад в файл

Использование:
  node scripts/migrate-to-file-mapping.js [опции]

Опции:
  --backup     Создать резервную копию текущего файла маппинга перед миграцией
  --validate   Валидировать маппинги после завершения миграции
  --help, -h   Показать эту справку

Примеры:
  # Простая миграция
  node scripts/migrate-to-file-mapping.js

  # Миграция с резервной копией
  node scripts/migrate-to-file-mapping.js --backup

  # Миграция с резервной копией и валидацией
  node scripts/migrate-to-file-mapping.js --backup --validate

Описание:
  Скрипт читает все товары из МойСклад с атрибутом 'offerId',
  извлекает маппинг product.id → offerId и сохраняет его в файл
  data/product-mappings.json для использования middleware.

Требования:
  - Переменные окружения должны быть настроены в .env файле
  - MS_TOKEN - токен доступа к API МойСклад
  - Требуется доступ к API МойСклад для чтения товаров
  `);
}

/**
 * Форматировать длительность в читаемый вид
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}м ${remainingSeconds}с`;
  }
  return `${seconds}с`;
}

/**
 * Вывести статистику миграции
 */
function printStats(stats) {
  console.log('\n' + '='.repeat(60));
  console.log('СТАТИСТИКА МИГРАЦИИ');
  console.log('='.repeat(60));
  console.log(`Всего товаров обработано:     ${stats.totalProducts}`);
  console.log(`Маппингов мигрировано:        ${stats.migratedMappings}`);
  console.log(`Товаров пропущено:            ${stats.skippedProducts}`);
  console.log(`Ошибок при обработке:         ${stats.errors.length}`);
  
  const duration = stats.endTime - stats.startTime;
  console.log(`Длительность:                 ${formatDuration(duration)}`);
  console.log('='.repeat(60));

  if (stats.errors.length > 0) {
    console.log('\nОШИБКИ ПРИ ОБРАБОТКЕ:');
    stats.errors.slice(0, 10).forEach((error, index) => {
      console.log(`  ${index + 1}. ${error.productName} (${error.productId})`);
      console.log(`     Ошибка: ${error.error}`);
    });
    
    if (stats.errors.length > 10) {
      console.log(`  ... и еще ${stats.errors.length - 10} ошибок`);
    }
  }

  console.log('');
}

/**
 * Вывести результаты валидации
 */
function printValidation(validation) {
  console.log('\n' + '='.repeat(60));
  console.log('РЕЗУЛЬТАТЫ ВАЛИДАЦИИ');
  console.log('='.repeat(60));
  console.log(`Статус:                       ${validation.isValid ? '✓ ВАЛИДНО' : '✗ НЕВАЛИДНО'}`);
  console.log(`Всего маппингов:              ${validation.totalMappings}`);
  console.log(`Валидных маппингов:           ${validation.validMappings}`);
  console.log(`Невалидных маппингов:         ${validation.invalidMappings.length}`);
  console.log(`Дубликатов offerId:           ${validation.duplicateOfferIds.length}`);
  console.log(`Пустых значений:              ${validation.emptyValues.length}`);
  console.log('='.repeat(60));

  if (validation.invalidMappings.length > 0) {
    console.log('\nНЕВАЛИДНЫЕ МАППИНГИ:');
    validation.invalidMappings.slice(0, 5).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.productId} → ${item.offerId}`);
      console.log(`     Причина: ${item.reason}`);
    });
    
    if (validation.invalidMappings.length > 5) {
      console.log(`  ... и еще ${validation.invalidMappings.length - 5} невалидных маппингов`);
    }
  }

  if (validation.duplicateOfferIds.length > 0) {
    console.log('\nДУБЛИКАТЫ OFFERID:');
    validation.duplicateOfferIds.slice(0, 5).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.offerId} (используется ${item.count} раз)`);
    });
    
    if (validation.duplicateOfferIds.length > 5) {
      console.log(`  ... и еще ${validation.duplicateOfferIds.length - 5} дубликатов`);
    }
  }

  console.log('');
}

/**
 * Главная функция миграции
 */
async function main() {
  const options = parseArgs();

  // Показать справку если запрошено
  if (options.help) {
    showHelp();
    process.exit(0);
  }

  console.log('='.repeat(60));
  console.log('МИГРАЦИЯ МАППИНГА PRODUCT.ID → OFFERID');
  console.log('='.repeat(60));
  console.log(`Время начала: ${new Date().toLocaleString('ru-RU')}`);
  console.log(`Опции: backup=${options.backup}, validate=${options.validate}`);
  console.log('='.repeat(60));
  console.log('');

  try {
    // Инициализация компонентов
    console.log('Инициализация компонентов...');
    
    const moySkladClient = new MoySkladClient(config.MS_TOKEN, config.MS_BASE);
    const productMappingStore = new ProductMappingStore();
    const migrationService = new MigrationService(moySkladClient, productMappingStore);

    console.log('✓ Компоненты инициализированы');
    console.log('');

    // Создание резервной копии если запрошено
    if (options.backup) {
      console.log('Создание резервной копии...');
      
      const backupPath = await migrationService.backupCurrentMappings();
      
      if (backupPath) {
        console.log(`✓ Резервная копия создана: ${backupPath}`);
      } else {
        console.log('ℹ Файл маппинга не существует, резервная копия не требуется');
      }
      console.log('');
    }

    // Выполнение миграции
    console.log('Запуск миграции...');
    console.log('Это может занять некоторое время в зависимости от количества товаров...');
    console.log('');

    const stats = await migrationService.migrateFromAttributes();

    // Вывод статистики
    printStats(stats);

    // Валидация если запрошено
    if (options.validate) {
      console.log('Запуск валидации маппингов...');
      console.log('');

      const validation = await migrationService.validateMappings();
      
      printValidation(validation);

      if (!validation.isValid) {
        console.error('⚠ ВНИМАНИЕ: Валидация обнаружила проблемы в маппингах!');
        console.error('Пожалуйста, проверьте файл data/product-mappings.json');
        console.log('');
        process.exit(1);
      }

      console.log('✓ Валидация успешна');
      console.log('');
    }

    // Итоговое сообщение
    console.log('='.repeat(60));
    console.log('✓ МИГРАЦИЯ ЗАВЕРШЕНА УСПЕШНО');
    console.log('='.repeat(60));
    console.log(`Файл маппинга: data/product-mappings.json`);
    console.log(`Мигрировано маппингов: ${stats.migratedMappings}`);
    console.log('');
    console.log('Следующие шаги:');
    console.log('  1. Проверьте файл data/product-mappings.json');
    console.log('  2. Перезапустите middleware для использования нового маппинга');
    console.log('  3. Мониторьте логи на наличие ошибок маппинга');
    console.log('='.repeat(60));
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('✗ КРИТИЧЕСКАЯ ОШИБКА ПРИ МИГРАЦИИ');
    console.error('='.repeat(60));
    console.error(`Ошибка: ${error.message}`);
    console.error('');
    console.error('Детали ошибки:');
    console.error(error.stack);
    console.error('='.repeat(60));
    console.error('');
    console.error('Возможные причины:');
    console.error('  - Неверные учетные данные API МойСклад');
    console.error('  - Проблемы с сетевым подключением');
    console.error('  - Недостаточно прав доступа к файловой системе');
    console.error('  - Ошибка в структуре данных МойСклад');
    console.error('');
    console.error('Проверьте логи для получения дополнительной информации.');
    console.error('');

    process.exit(1);
  }
}

// Запуск скрипта
main();
