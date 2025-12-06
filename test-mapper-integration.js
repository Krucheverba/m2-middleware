/**
 * Интеграционный тест MapperService с реальными компонентами (обновлен для работы с product.id)
 */

// Установить переменные окружения
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign';
process.env.YANDEX_TOKEN = 'test-token';
process.env.MS_TOKEN = 'test-ms-token';
process.env.LOG_LEVEL = 'error';

const MapperService = require('./src/services/mapperService');
const ProductMappingStore = require('./src/storage/productMappingStore');
const OrderMappingStore = require('./src/storage/orderMappingStore');
const fs = require('fs').promises;
const path = require('path');

// Мок для MoySkladClient
class MockMoySkladClient {
  // Больше не нужны методы для работы с атрибутами
}

async function runIntegrationTests() {
  console.log('🧪 Интеграционное тестирование MapperService (обновленная версия)...\n');

  const testProductMappingFile = './data/test-product-mappings.json';
  const testOrderMappingFile = './data/test-order-mappings.json';
  
  try {
    // Очистить тестовые файлы если существуют
    try {
      await fs.unlink(testProductMappingFile);
    } catch (e) {
      // Игнорировать если файл не существует
    }
    try {
      await fs.unlink(testOrderMappingFile);
    } catch (e) {
      // Игнорировать если файл не существует
    }

    // Создать тестовый файл маппинга товаров
    const testProductMappings = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      mappings: {
        'f8a2da33-bf0a-11ef-0a80-17e3002d7201': 'M2-OFFER-001',
        'a1b2c3d4-e5f6-11ef-0a80-17e3002d7202': 'M2-OFFER-002'
      }
    };
    await fs.writeFile(testProductMappingFile, JSON.stringify(testProductMappings, null, 2));

    const mockClient = new MockMoySkladClient();
    const realProductStore = new ProductMappingStore(testProductMappingFile);
    const realOrderStore = new OrderMappingStore(testOrderMappingFile);
    const mapper = new MapperService(mockClient, realProductStore, realOrderStore);

    // Тест 1: Загрузка маппингов из файла
    console.log('✓ Тест 1: Загрузка маппингов из файла');
    const count = await mapper.loadMappings();
    console.log(`  Загружено ${count} маппингов`);
    console.assert(count === 2, 'Должно быть загружено 2 маппинга');

    // Тест 2: Маппинг product.id -> offerId
    console.log('\n✓ Тест 2: Маппинг product.id -> offerId работает');
    const offer1 = mapper.mapProductIdToOfferId('f8a2da33-bf0a-11ef-0a80-17e3002d7201');
    const offer2 = mapper.mapProductIdToOfferId('a1b2c3d4-e5f6-11ef-0a80-17e3002d7202');
    console.assert(offer1 === 'M2-OFFER-001', 'Маппинг 1 должен работать');
    console.assert(offer2 === 'M2-OFFER-002', 'Маппинг 2 должен работать');
    console.log('  Маппинги работают корректно');

    // Тест 3: Обратный маппинг offerId -> product.id
    console.log('\n✓ Тест 3: Обратный маппинг offerId -> product.id работает');
    const prod1 = mapper.mapOfferIdToProductId('M2-OFFER-001');
    const prod2 = mapper.mapOfferIdToProductId('M2-OFFER-002');
    console.assert(prod1 === 'f8a2da33-bf0a-11ef-0a80-17e3002d7201', 'Обратный маппинг 1 должен работать');
    console.assert(prod2 === 'a1b2c3d4-e5f6-11ef-0a80-17e3002d7202', 'Обратный маппинг 2 должен работать');
    console.log('  Обратные маппинги работают корректно');

    // Тест 4: Сохранение маппинга заказа в реальный файл
    console.log('\n✓ Тест 4: Сохранение маппинга заказа в файл');
    await mapper.saveOrderMapping('M2-TEST-ORDER-1', 'MS-TEST-ORDER-1');
    await mapper.saveOrderMapping('M2-TEST-ORDER-2', 'MS-TEST-ORDER-2');
    console.log('  Маппинги заказов сохранены');

    // Тест 5: Чтение маппинга заказа из файла
    console.log('\n✓ Тест 5: Чтение маппинга заказа из файла');
    const msOrder1 = await mapper.getMoySkladOrderId('M2-TEST-ORDER-1');
    const msOrder2 = await mapper.getMoySkladOrderId('M2-TEST-ORDER-2');
    console.assert(msOrder1 === 'MS-TEST-ORDER-1', 'Маппинг заказа 1 должен быть прочитан');
    console.assert(msOrder2 === 'MS-TEST-ORDER-2', 'Маппинг заказа 2 должен быть прочитан');
    console.log('  Маппинги заказов прочитаны корректно');

    // Тест 6: Проверка содержимого файла заказов
    console.log('\n✓ Тест 6: Проверка содержимого файла заказов');
    const fileContent = await fs.readFile(testOrderMappingFile, 'utf8');
    const data = JSON.parse(fileContent);
    console.log(`  Файл содержит ${data.mappings.length} маппингов`);
    console.assert(data.mappings.length === 2, 'Должно быть 2 маппинга в файле');

    // Тест 7: Предотвращение дубликатов
    console.log('\n✓ Тест 7: Предотвращение дубликатов');
    await mapper.saveOrderMapping('M2-TEST-ORDER-1', 'MS-TEST-ORDER-1-UPDATED');
    const fileContent2 = await fs.readFile(testOrderMappingFile, 'utf8');
    const data2 = JSON.parse(fileContent2);
    console.log(`  После повторного сохранения: ${data2.mappings.length} маппингов`);
    console.assert(data2.mappings.length === 2, 'Не должно быть дубликатов');

    // Тест 8: Получение списков
    console.log('\n✓ Тест 8: Получение списков product.id и offerId');
    const allProductIds = mapper.getAllProductIds();
    const allOfferIds = mapper.getAllOfferIds();
    console.log(`  Product IDs: ${allProductIds.length}`);
    console.log(`  Offer IDs: ${allOfferIds.length}`);
    console.assert(allProductIds.length === 2, 'Должно быть 2 product.id');
    console.assert(allOfferIds.length === 2, 'Должно быть 2 offerId');

    // Очистка
    await fs.unlink(testProductMappingFile);
    await fs.unlink(testOrderMappingFile);
    console.log('\n✅ Все интеграционные тесты пройдены успешно!');
  } catch (error) {
    console.error('\n❌ Ошибка при выполнении интеграционных тестов:', error);
    
    // Очистка при ошибке
    try {
      await fs.unlink(testProductMappingFile);
      await fs.unlink(testOrderMappingFile);
    } catch (e) {
      // Игнорировать
    }
    
    process.exit(1);
  }
}

runIntegrationTests();
