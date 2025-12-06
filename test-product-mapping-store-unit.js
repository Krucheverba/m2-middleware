/**
 * Unit тесты для ProductMappingStore
 * Проверяет: Требования 1.1, 1.2, 1.3, 1.4
 */

// Установить переменные окружения перед загрузкой модулей
process.env.LOG_LEVEL = 'error'; // Минимизировать вывод логов

const ProductMappingStore = require('./src/storage/productMappingStore');
const fs = require('fs').promises;
const path = require('path');

// Цвета для вывода
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

/**
 * Вспомогательная функция для запуска теста
 */
async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`${GREEN}✓${RESET} ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${RED}Ошибка: ${error.message}${RESET}`);
    testsFailed++;
  }
}

/**
 * Вспомогательная функция для очистки тестовых файлов
 */
async function cleanup(filePath) {
  try {
    await fs.unlink(filePath);
    await fs.unlink(`${filePath}.lock`);
  } catch (e) {
    // Игнорируем ошибки
  }
}

/**
 * Основная функция тестирования
 */
async function runAllTests() {
  console.log('\n🧪 Unit тесты для ProductMappingStore\n');

  const testFilePath = './data/test-unit-product-mappings.json';

  // Очистка перед началом
  await cleanup(testFilePath);

  // Тест 1: Загрузка валидного файла
  await runTest('Тест 1: Загрузка валидного файла', async () => {
    // Создать валидный файл
    const validData = {
      version: '1.0',
      lastUpdated: '2024-12-04T10:00:00Z',
      mappings: {
        'product-1': 'offer-1',
        'product-2': 'offer-2',
        'product-3': 'offer-3'
      }
    };
    await fs.writeFile(testFilePath, JSON.stringify(validData, null, 2), 'utf8');

    const store = new ProductMappingStore(testFilePath);
    const count = await store.load();

    if (count !== 3) {
      throw new Error(`Ожидалось 3 маппинга, получено ${count}`);
    }

    // Проверить что маппинги доступны
    const offerId = store.getOfferId('product-1');
    if (offerId !== 'offer-1') {
      throw new Error(`Ожидалось 'offer-1', получено '${offerId}'`);
    }

    await cleanup(testFilePath);
  });

  // Тест 2: Обработка невалидного JSON
  await runTest('Тест 2: Обработка невалидного JSON', async () => {
    // Создать файл с невалидным JSON
    await fs.writeFile(testFilePath, '{ invalid json }', 'utf8');

    const store = new ProductMappingStore(testFilePath);
    
    try {
      await store.load();
      throw new Error('Должна была быть выброшена ошибка для невалидного JSON');
    } catch (error) {
      if (!error.message.includes('Невалидный JSON')) {
        throw new Error(`Неожиданная ошибка: ${error.message}`);
      }
    }

    await cleanup(testFilePath);
  });

  // Тест 3: Обработка отсутствующего файла
  await runTest('Тест 3: Обработка отсутствующего файла', async () => {
    // Убедиться что файл не существует
    await cleanup(testFilePath);

    const store = new ProductMappingStore(testFilePath);
    const count = await store.load();

    if (count !== 0) {
      throw new Error(`Ожидалось 0 маппингов для несуществующего файла, получено ${count}`);
    }

    // Проверить что файл был создан
    const fileExists = await fs.access(testFilePath).then(() => true).catch(() => false);
    if (!fileExists) {
      throw new Error('Файл не был создан автоматически');
    }

    // Проверить структуру созданного файла
    const content = await fs.readFile(testFilePath, 'utf8');
    const data = JSON.parse(content);
    
    if (!data.version || !data.mappings) {
      throw new Error('Созданный файл имеет неверную структуру');
    }

    await cleanup(testFilePath);
  });

  // Тест 4: Сохранение маппинга
  await runTest('Тест 4: Сохранение маппинга', async () => {
    await cleanup(testFilePath);

    const store = new ProductMappingStore(testFilePath);
    await store.load();

    // Добавить маппинги
    store.addMapping('save-product-1', 'save-offer-1');
    store.addMapping('save-product-2', 'save-offer-2');

    // Сохранить в файл
    await store.save(store.productToOfferMap);

    // Проверить что файл существует
    const fileExists = await fs.access(testFilePath).then(() => true).catch(() => false);
    if (!fileExists) {
      throw new Error('Файл не был создан после сохранения');
    }

    // Проверить содержимое файла
    const content = await fs.readFile(testFilePath, 'utf8');
    const data = JSON.parse(content);

    if (Object.keys(data.mappings).length !== 2) {
      throw new Error(`Ожидалось 2 маппинга в файле, получено ${Object.keys(data.mappings).length}`);
    }

    if (data.mappings['save-product-1'] !== 'save-offer-1') {
      throw new Error('Маппинг не сохранен корректно');
    }

    await cleanup(testFilePath);
  });

  // Тест 5: Получение offerId по product.id
  await runTest('Тест 5: Получение offerId по product.id', async () => {
    await cleanup(testFilePath);

    const store = new ProductMappingStore(testFilePath);
    await store.load();

    store.addMapping('test-product-id', 'test-offer-id');

    const offerId = store.getOfferId('test-product-id');
    if (offerId !== 'test-offer-id') {
      throw new Error(`Ожидалось 'test-offer-id', получено '${offerId}'`);
    }

    // Проверить несуществующий маппинг
    const notFound = store.getOfferId('non-existent');
    if (notFound !== null) {
      throw new Error(`Ожидалось null для несуществующего маппинга, получено '${notFound}'`);
    }

    await cleanup(testFilePath);
  });

  // Тест 6: Получение product.id по offerId
  await runTest('Тест 6: Получение product.id по offerId', async () => {
    await cleanup(testFilePath);

    const store = new ProductMappingStore(testFilePath);
    await store.load();

    store.addMapping('reverse-product', 'reverse-offer');

    const productId = store.getProductId('reverse-offer');
    if (productId !== 'reverse-product') {
      throw new Error(`Ожидалось 'reverse-product', получено '${productId}'`);
    }

    // Проверить несуществующий маппинг
    const notFound = store.getProductId('non-existent-offer');
    if (notFound !== null) {
      throw new Error(`Ожидалось null для несуществующего маппинга, получено '${notFound}'`);
    }

    await cleanup(testFilePath);
  });

  // Тест 7: Добавление/удаление маппинга
  await runTest('Тест 7: Добавление/удаление маппинга', async () => {
    await cleanup(testFilePath);

    const store = new ProductMappingStore(testFilePath);
    await store.load();

    // Добавить маппинг
    store.addMapping('add-remove-product', 'add-remove-offer');
    
    let offerId = store.getOfferId('add-remove-product');
    if (offerId !== 'add-remove-offer') {
      throw new Error('Маппинг не был добавлен');
    }

    // Удалить маппинг
    store.removeMapping('add-remove-product');
    
    offerId = store.getOfferId('add-remove-product');
    if (offerId !== null) {
      throw new Error('Маппинг не был удален');
    }

    // Проверить что обратный маппинг также удален
    const productId = store.getProductId('add-remove-offer');
    if (productId !== null) {
      throw new Error('Обратный маппинг не был удален');
    }

    await cleanup(testFilePath);
  });

  // Тест 8: Валидация структуры - отсутствует version
  await runTest('Тест 8: Валидация - отсутствует version', async () => {
    const invalidData = {
      mappings: { 'product-1': 'offer-1' }
    };
    await fs.writeFile(testFilePath, JSON.stringify(invalidData), 'utf8');

    const store = new ProductMappingStore(testFilePath);
    
    try {
      await store.load();
      throw new Error('Должна была быть выброшена ошибка');
    } catch (error) {
      if (!error.message.includes('version')) {
        throw new Error(`Неожиданная ошибка: ${error.message}`);
      }
    }

    await cleanup(testFilePath);
  });

  // Тест 9: Валидация структуры - отсутствует mappings
  await runTest('Тест 9: Валидация - отсутствует mappings', async () => {
    const invalidData = {
      version: '1.0'
    };
    await fs.writeFile(testFilePath, JSON.stringify(invalidData), 'utf8');

    const store = new ProductMappingStore(testFilePath);
    
    try {
      await store.load();
      throw new Error('Должна была быть выброшена ошибка');
    } catch (error) {
      if (!error.message.includes('mappings')) {
        throw new Error(`Неожиданная ошибка: ${error.message}`);
      }
    }

    await cleanup(testFilePath);
  });

  // Тест 10: Обработка невалидных маппингов (пропуск с логированием)
  await runTest('Тест 10: Обработка невалидных маппингов', async () => {
    const dataWithInvalid = {
      version: '1.0',
      mappings: {
        'valid-1': 'offer-1',
        '': 'invalid-empty-key',
        'valid-2': '',
        'valid-3': 'offer-3'
      }
    };
    await fs.writeFile(testFilePath, JSON.stringify(dataWithInvalid), 'utf8');

    const store = new ProductMappingStore(testFilePath);
    const count = await store.load();

    // Должно быть загружено только 2 валидных маппинга (valid-1 и valid-3)
    if (count !== 2) {
      throw new Error(`Ожидалось 2 валидных маппинга, получено ${count}`);
    }

    // Проверить что валидные маппинги доступны
    const offer1 = store.getOfferId('valid-1');
    const offer3 = store.getOfferId('valid-3');

    if (offer1 !== 'offer-1' || offer3 !== 'offer-3') {
      throw new Error('Валидные маппинги недоступны');
    }

    // Проверить что невалидные маппинги не загружены
    const invalidOffer = store.getOfferId('valid-2');
    if (invalidOffer !== null) {
      throw new Error('Невалидный маппинг был загружен');
    }

    await cleanup(testFilePath);
  });

  // Тест 11: Получение всех product.id
  await runTest('Тест 11: Получение всех product.id', async () => {
    await cleanup(testFilePath);

    const store = new ProductMappingStore(testFilePath);
    await store.load();

    store.addMapping('p1', 'o1');
    store.addMapping('p2', 'o2');
    store.addMapping('p3', 'o3');

    const productIds = store.getAllProductIds();

    if (productIds.length !== 3) {
      throw new Error(`Ожидалось 3 product.id, получено ${productIds.length}`);
    }

    if (!productIds.includes('p1') || !productIds.includes('p2') || !productIds.includes('p3')) {
      throw new Error('Не все product.id присутствуют в списке');
    }

    await cleanup(testFilePath);
  });

  // Тест 12: Получение всех offerId
  await runTest('Тест 12: Получение всех offerId', async () => {
    await cleanup(testFilePath);

    const store = new ProductMappingStore(testFilePath);
    await store.load();

    store.addMapping('p1', 'o1');
    store.addMapping('p2', 'o2');
    store.addMapping('p3', 'o3');

    const offerIds = store.getAllOfferIds();

    if (offerIds.length !== 3) {
      throw new Error(`Ожидалось 3 offerId, получено ${offerIds.length}`);
    }

    if (!offerIds.includes('o1') || !offerIds.includes('o2') || !offerIds.includes('o3')) {
      throw new Error('Не все offerId присутствуют в списке');
    }

    await cleanup(testFilePath);
  });

  // Тест 13: Получение статистики
  await runTest('Тест 13: Получение статистики', async () => {
    await cleanup(testFilePath);

    const store = new ProductMappingStore(testFilePath);
    await store.load();

    store.addMapping('stat-p1', 'stat-o1');
    store.addMapping('stat-p2', 'stat-o2');

    const stats = store.getStats();

    if (stats.totalMappings !== 2) {
      throw new Error(`Ожидалось 2 маппинга в статистике, получено ${stats.totalMappings}`);
    }

    if (!stats.isLoaded) {
      throw new Error('isLoaded должен быть true');
    }

    if (!stats.lastLoaded) {
      throw new Error('lastLoaded должен быть установлен');
    }

    if (stats.filePath !== path.resolve(testFilePath)) {
      throw new Error('filePath в статистике неверный');
    }

    await cleanup(testFilePath);
  });

  // Тест 14: Round-trip (двунаправленный маппинг)
  await runTest('Тест 14: Round-trip (двунаправленный маппинг)', async () => {
    await cleanup(testFilePath);

    const store = new ProductMappingStore(testFilePath);
    await store.load();

    const originalProductId = 'round-trip-product';
    const originalOfferId = 'round-trip-offer';

    store.addMapping(originalProductId, originalOfferId);

    // product.id → offerId → product.id
    const offerId = store.getOfferId(originalProductId);
    const productId = store.getProductId(offerId);

    if (productId !== originalProductId) {
      throw new Error(`Round-trip failed: ${originalProductId} → ${offerId} → ${productId}`);
    }

    await cleanup(testFilePath);
  });

  // Тест 15: Сохранение и загрузка (персистентность)
  await runTest('Тест 15: Сохранение и загрузка (персистентность)', async () => {
    await cleanup(testFilePath);

    // Создать и сохранить маппинги
    const store1 = new ProductMappingStore(testFilePath);
    await store1.load();
    store1.addMapping('persist-p1', 'persist-o1');
    store1.addMapping('persist-p2', 'persist-o2');
    await store1.save(store1.productToOfferMap);

    // Загрузить в новый экземпляр
    const store2 = new ProductMappingStore(testFilePath);
    const count = await store2.load();

    if (count !== 2) {
      throw new Error(`Ожидалось 2 маппинга после загрузки, получено ${count}`);
    }

    const offerId1 = store2.getOfferId('persist-p1');
    const offerId2 = store2.getOfferId('persist-p2');

    if (offerId1 !== 'persist-o1' || offerId2 !== 'persist-o2') {
      throw new Error('Маппинги не были корректно сохранены и загружены');
    }

    await cleanup(testFilePath);
  });

  // Финальная очистка
  await cleanup(testFilePath);

  // Вывод результатов
  console.log('\n' + '='.repeat(50));
  if (testsFailed === 0) {
    console.log(`${GREEN}✅ Все тесты пройдены успешно!${RESET}`);
  } else {
    console.log(`${RED}❌ Некоторые тесты провалены${RESET}`);
  }
  console.log(`Пройдено: ${testsPassed}, Провалено: ${testsFailed}`);
  console.log('='.repeat(50) + '\n');

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Запуск тестов
runAllTests().catch(error => {
  console.error(`${RED}Критическая ошибка:${RESET}`, error);
  process.exit(1);
});
