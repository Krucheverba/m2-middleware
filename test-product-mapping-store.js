const ProductMappingStore = require('./src/storage/productMappingStore');
const fs = require('fs').promises;
const path = require('path');

/**
 * Простой тест для проверки основной функциональности ProductMappingStore
 */
async function runTests() {
  console.log('🧪 Запуск тестов ProductMappingStore...\n');
  
  const testFilePath = './data/test-product-mappings.json';
  let store;
  let passedTests = 0;
  let failedTests = 0;

  try {
    // Очистка тестового файла перед началом
    try {
      await fs.unlink(testFilePath);
      await fs.unlink(`${testFilePath}.lock`);
    } catch (e) {
      // Игнорируем если файлы не существуют
    }

    // Тест 1: Создание экземпляра
    console.log('✓ Тест 1: Создание экземпляра ProductMappingStore');
    store = new ProductMappingStore(testFilePath);
    passedTests++;

    // Тест 2: Загрузка несуществующего файла (должен создать пустой)
    console.log('✓ Тест 2: Загрузка несуществующего файла');
    const count1 = await store.load();
    if (count1 !== 0) {
      throw new Error(`Ожидалось 0 маппингов, получено ${count1}`);
    }
    passedTests++;

    // Тест 3: Проверка что файл создан
    console.log('✓ Тест 3: Проверка создания пустого файла');
    const fileExists = await fs.access(testFilePath).then(() => true).catch(() => false);
    if (!fileExists) {
      throw new Error('Файл не был создан');
    }
    passedTests++;

    // Тест 4: Добавление маппингов
    console.log('✓ Тест 4: Добавление маппингов в память');
    store.addMapping('product-id-1', 'offer-id-1');
    store.addMapping('product-id-2', 'offer-id-2');
    store.addMapping('product-id-3', 'offer-id-3');
    passedTests++;

    // Тест 5: Получение offerId по product.id
    console.log('✓ Тест 5: Получение offerId по product.id');
    const offerId = store.getOfferId('product-id-1');
    if (offerId !== 'offer-id-1') {
      throw new Error(`Ожидалось 'offer-id-1', получено '${offerId}'`);
    }
    passedTests++;

    // Тест 6: Получение product.id по offerId (обратный маппинг)
    console.log('✓ Тест 6: Получение product.id по offerId');
    const productId = store.getProductId('offer-id-2');
    if (productId !== 'product-id-2') {
      throw new Error(`Ожидалось 'product-id-2', получено '${productId}'`);
    }
    passedTests++;

    // Тест 7: Получение null для несуществующего маппинга
    console.log('✓ Тест 7: Получение null для несуществующего маппинга');
    const notFound = store.getOfferId('non-existent-id');
    if (notFound !== null) {
      throw new Error(`Ожидалось null, получено '${notFound}'`);
    }
    passedTests++;

    // Тест 8: Получение всех product.id
    console.log('✓ Тест 8: Получение всех product.id');
    const allProductIds = store.getAllProductIds();
    if (allProductIds.length !== 3) {
      throw new Error(`Ожидалось 3 product.id, получено ${allProductIds.length}`);
    }
    passedTests++;

    // Тест 9: Получение всех offerId
    console.log('✓ Тест 9: Получение всех offerId');
    const allOfferIds = store.getAllOfferIds();
    if (allOfferIds.length !== 3) {
      throw new Error(`Ожидалось 3 offerId, получено ${allOfferIds.length}`);
    }
    passedTests++;

    // Тест 10: Сохранение маппингов в файл
    console.log('✓ Тест 10: Сохранение маппингов в файл');
    await store.save(store.productToOfferMap);
    passedTests++;

    // Тест 11: Загрузка сохраненных маппингов
    console.log('✓ Тест 11: Загрузка сохраненных маппингов');
    const store2 = new ProductMappingStore(testFilePath);
    const count2 = await store2.load();
    if (count2 !== 3) {
      throw new Error(`Ожидалось 3 маппинга, получено ${count2}`);
    }
    passedTests++;

    // Тест 12: Проверка загруженных данных
    console.log('✓ Тест 12: Проверка загруженных данных');
    const loadedOfferId = store2.getOfferId('product-id-1');
    if (loadedOfferId !== 'offer-id-1') {
      throw new Error(`Ожидалось 'offer-id-1', получено '${loadedOfferId}'`);
    }
    passedTests++;

    // Тест 13: Удаление маппинга
    console.log('✓ Тест 13: Удаление маппинга');
    store2.removeMapping('product-id-1');
    const removedOfferId = store2.getOfferId('product-id-1');
    if (removedOfferId !== null) {
      throw new Error(`Ожидалось null после удаления, получено '${removedOfferId}'`);
    }
    passedTests++;

    // Тест 14: Получение статистики
    console.log('✓ Тест 14: Получение статистики');
    const stats = store2.getStats();
    if (stats.totalMappings !== 2) {
      throw new Error(`Ожидалось 2 маппинга в статистике, получено ${stats.totalMappings}`);
    }
    if (!stats.isLoaded) {
      throw new Error('isLoaded должен быть true');
    }
    passedTests++;

    // Тест 15: Валидация структуры - невалидный JSON
    console.log('✓ Тест 15: Обработка невалидного JSON');
    const invalidJsonPath = './data/test-invalid.json';
    await fs.writeFile(invalidJsonPath, '{ invalid json }', 'utf8');
    const store3 = new ProductMappingStore(invalidJsonPath);
    try {
      await store3.load();
      throw new Error('Должна была быть выброшена ошибка для невалидного JSON');
    } catch (error) {
      if (!error.message.includes('Невалидный JSON')) {
        throw error;
      }
    }
    await fs.unlink(invalidJsonPath);
    passedTests++;

    // Тест 16: Двунаправленный маппинг (round-trip)
    console.log('✓ Тест 16: Двунаправленный маппинг (round-trip)');
    const testProductId = 'test-product-123';
    const testOfferId = 'test-offer-456';
    store2.addMapping(testProductId, testOfferId);
    
    const retrievedOfferId = store2.getOfferId(testProductId);
    const retrievedProductId = store2.getProductId(retrievedOfferId);
    
    if (retrievedProductId !== testProductId) {
      throw new Error(`Round-trip failed: ${testProductId} → ${retrievedOfferId} → ${retrievedProductId}`);
    }
    passedTests++;

    console.log('\n✅ Все тесты пройдены успешно!');
    console.log(`Пройдено: ${passedTests}, Провалено: ${failedTests}`);

  } catch (error) {
    failedTests++;
    console.error('\n❌ Тест провален:', error.message);
    console.log(`Пройдено: ${passedTests}, Провалено: ${failedTests}`);
    process.exit(1);
  } finally {
    // Очистка тестовых файлов
    try {
      await fs.unlink(testFilePath);
      await fs.unlink(`${testFilePath}.lock`);
    } catch (e) {
      // Игнорируем ошибки очистки
    }
  }
}

runTests();
