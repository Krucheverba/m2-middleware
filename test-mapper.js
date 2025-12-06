/**
 * Простой тест для проверки MapperService (обновлен для работы с product.id)
 */

// Установить переменные окружения перед загрузкой модулей
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign';
process.env.YANDEX_TOKEN = 'test-token';
process.env.MS_TOKEN = 'test-ms-token';
process.env.LOG_LEVEL = 'error'; // Минимизировать вывод логов

const MapperService = require('./src/services/mapperService');

// Мок для MoySkladClient
class MockMoySkladClient {
  // Больше не нужны методы для работы с атрибутами
}

// Мок для ProductMappingStore
class MockProductMappingStore {
  constructor() {
    this.productToOfferMap = new Map();
    this.offerToProductMap = new Map();
    this.isLoaded = false;
    this.lastLoaded = null;
    this.filePath = './data/product-mappings.json';
  }

  async load() {
    // Имитация загрузки маппингов из файла
    this.productToOfferMap.clear();
    this.offerToProductMap.clear();
    
    // Тестовые данные
    this.productToOfferMap.set('f8a2da33-bf0a-11ef-0a80-17e3002d7201', 'OFFER001');
    this.productToOfferMap.set('a1b2c3d4-e5f6-11ef-0a80-17e3002d7202', 'OFFER002');
    
    this.offerToProductMap.set('OFFER001', 'f8a2da33-bf0a-11ef-0a80-17e3002d7201');
    this.offerToProductMap.set('OFFER002', 'a1b2c3d4-e5f6-11ef-0a80-17e3002d7202');
    
    this.isLoaded = true;
    this.lastLoaded = new Date();
    
    return this.productToOfferMap.size;
  }

  getOfferId(productId) {
    if (!this.isLoaded) {
      throw new Error('Маппинги не загружены');
    }
    return this.productToOfferMap.get(productId) || null;
  }

  getProductId(offerId) {
    if (!this.isLoaded) {
      throw new Error('Маппинги не загружены');
    }
    return this.offerToProductMap.get(offerId) || null;
  }

  getAllProductIds() {
    if (!this.isLoaded) {
      throw new Error('Маппинги не загружены');
    }
    return Array.from(this.productToOfferMap.keys());
  }

  getAllOfferIds() {
    if (!this.isLoaded) {
      throw new Error('Маппинги не загружены');
    }
    return Array.from(this.offerToProductMap.keys());
  }

  getStats() {
    return {
      totalMappings: this.productToOfferMap.size,
      lastLoaded: this.lastLoaded,
      isLoaded: this.isLoaded,
      filePath: this.filePath
    };
  }
}

// Мок для OrderMappingStore
class MockOrderMappingStore {
  constructor() {
    this.mappings = new Map();
  }

  async save(m2OrderId, moySkladOrderId) {
    this.mappings.set(m2OrderId, moySkladOrderId);
  }

  async get(m2OrderId) {
    return this.mappings.get(m2OrderId) || null;
  }
}

async function runTests() {
  console.log('🧪 Тестирование MapperService (обновленная версия с product.id)...\n');

  const mockClient = new MockMoySkladClient();
  const mockProductStore = new MockProductMappingStore();
  const mockOrderStore = new MockOrderMappingStore();
  const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);

  try {
    // Тест 1: Загрузка маппингов из файла
    console.log('✓ Тест 1: Загрузка маппингов из файла');
    const count = await mapper.loadMappings();
    console.log(`  Загружено маппингов: ${count}`);
    console.assert(count === 2, 'Должно быть загружено 2 маппинга');

    // Тест 2: Маппинг product.id -> offerId
    console.log('\n✓ Тест 2: Маппинг product.id -> offerId');
    const offerId1 = mapper.mapProductIdToOfferId('f8a2da33-bf0a-11ef-0a80-17e3002d7201');
    console.log(`  f8a2da33-bf0a-11ef-0a80-17e3002d7201 -> ${offerId1}`);
    console.assert(offerId1 === 'OFFER001', 'Должен вернуть OFFER001');

    const offerId2 = mapper.mapProductIdToOfferId('a1b2c3d4-e5f6-11ef-0a80-17e3002d7202');
    console.log(`  a1b2c3d4-e5f6-11ef-0a80-17e3002d7202 -> ${offerId2}`);
    console.assert(offerId2 === 'OFFER002', 'Должен вернуть OFFER002');

    // Тест 3: Маппинг несуществующего product.id
    console.log('\n✓ Тест 3: Маппинг несуществующего product.id');
    const offerId3 = mapper.mapProductIdToOfferId('non-existent-product-id');
    console.log(`  non-existent-product-id -> ${offerId3}`);
    console.assert(offerId3 === null, 'Должен вернуть null для несуществующего product.id');

    // Тест 4: Обратный маппинг offerId -> product.id
    console.log('\n✓ Тест 4: Обратный маппинг offerId -> product.id');
    const productId1 = mapper.mapOfferIdToProductId('OFFER001');
    console.log(`  OFFER001 -> ${productId1}`);
    console.assert(productId1 === 'f8a2da33-bf0a-11ef-0a80-17e3002d7201', 'Должен вернуть правильный product.id');

    const productId2 = mapper.mapOfferIdToProductId('OFFER002');
    console.log(`  OFFER002 -> ${productId2}`);
    console.assert(productId2 === 'a1b2c3d4-e5f6-11ef-0a80-17e3002d7202', 'Должен вернуть правильный product.id');

    // Тест 5: Обратный маппинг несуществующего offerId
    console.log('\n✓ Тест 5: Обратный маппинг несуществующего offerId');
    const productId3 = mapper.mapOfferIdToProductId('OFFER999');
    console.log(`  OFFER999 -> ${productId3}`);
    console.assert(productId3 === null, 'Должен вернуть null для несуществующего offerId');

    // Тест 6: Получение всех product.id
    console.log('\n✓ Тест 6: Получение всех product.id');
    const allProductIds = mapper.getAllProductIds();
    console.log(`  Получено product.id: ${allProductIds.length}`);
    console.log(`  Product IDs: ${allProductIds.join(', ')}`);
    console.assert(allProductIds.length === 2, 'Должно быть 2 product.id');
    console.assert(allProductIds.includes('f8a2da33-bf0a-11ef-0a80-17e3002d7201'), 'Должен содержать первый product.id');
    console.assert(allProductIds.includes('a1b2c3d4-e5f6-11ef-0a80-17e3002d7202'), 'Должен содержать второй product.id');

    // Тест 7: Получение всех offerId
    console.log('\n✓ Тест 7: Получение всех offerId');
    const allOfferIds = mapper.getAllOfferIds();
    console.log(`  Получено offerId: ${allOfferIds.length}`);
    console.log(`  OfferIds: ${allOfferIds.join(', ')}`);
    console.assert(allOfferIds.length === 2, 'Должно быть 2 offerId');
    console.assert(allOfferIds.includes('OFFER001'), 'Должен содержать OFFER001');
    console.assert(allOfferIds.includes('OFFER002'), 'Должен содержать OFFER002');

    // Тест 8: Сохранение маппинга заказа
    console.log('\n✓ Тест 8: Сохранение маппинга заказа');
    await mapper.saveOrderMapping('M2-ORDER-123', 'MS-ORDER-456');
    console.log('  Маппинг заказа сохранен');

    // Тест 9: Получение маппинга заказа
    console.log('\n✓ Тест 9: Получение маппинга заказа');
    const msOrderId = await mapper.getMoySkladOrderId('M2-ORDER-123');
    console.log(`  M2-ORDER-123 -> ${msOrderId}`);
    console.assert(msOrderId === 'MS-ORDER-456', 'Должен вернуть MS-ORDER-456');

    // Тест 10: Получение несуществующего маппинга заказа
    console.log('\n✓ Тест 10: Получение несуществующего маппинга заказа');
    const msOrderId2 = await mapper.getMoySkladOrderId('M2-ORDER-999');
    console.log(`  M2-ORDER-999 -> ${msOrderId2}`);
    console.assert(msOrderId2 === null, 'Должен вернуть null для несуществующего маппинга');

    // Тест 11: Статистика
    console.log('\n✓ Тест 11: Статистика маппингов');
    const stats = mapper.getStats();
    console.log(`  Всего маппингов: ${stats.totalMappings}`);
    console.log(`  Загружено: ${stats.lastLoaded}`);
    console.log(`  Файл: ${stats.filePath}`);
    console.assert(stats.totalMappings === 2, 'Должно быть 2 маппинга');
    console.assert(stats.isLoaded === true, 'Маппинги должны быть загружены');

    console.log('\n✅ Все тесты пройдены успешно!');
  } catch (error) {
    console.error('\n❌ Ошибка при выполнении тестов:', error);
    process.exit(1);
  }
}

runTests();
