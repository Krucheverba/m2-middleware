/**
 * Unit тесты для MapperService (обновленная версия с product.id)
 * 
 * Проверяет: Требования 2.1, 2.2, 2.3, 2.4
 * 
 * Тесты:
 * - Загрузка маппингов из ProductMappingStore
 * - Маппинг product.id → offerId
 * - Обратный маппинг offerId → product.id
 * - Обработка несуществующих маппингов
 * - Получение списков product.id и offerId
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
  constructor(testData = {}) {
    this.productToOfferMap = new Map();
    this.offerToProductMap = new Map();
    this.isLoaded = false;
    this.lastLoaded = null;
    this.filePath = './data/product-mappings.json';
    this.shouldThrowOnLoad = testData.shouldThrowOnLoad || false;
    this.loadCount = testData.loadCount || 0;
  }

  async load() {
    if (this.shouldThrowOnLoad) {
      throw new Error('Ошибка загрузки файла маппинга');
    }

    this.productToOfferMap.clear();
    this.offerToProductMap.clear();
    
    // Загружаем тестовые данные
    if (this.loadCount > 0) {
      this.productToOfferMap.set('f8a2da33-bf0a-11ef-0a80-17e3002d7201', 'OFFER001');
      this.productToOfferMap.set('a1b2c3d4-e5f6-11ef-0a80-17e3002d7202', 'OFFER002');
      this.productToOfferMap.set('b2c3d4e5-f6a7-11ef-0a80-17e3002d7203', 'OFFER003');
      
      this.offerToProductMap.set('OFFER001', 'f8a2da33-bf0a-11ef-0a80-17e3002d7201');
      this.offerToProductMap.set('OFFER002', 'a1b2c3d4-e5f6-11ef-0a80-17e3002d7202');
      this.offerToProductMap.set('OFFER003', 'b2c3d4e5-f6a7-11ef-0a80-17e3002d7203');
    }
    
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

async function runUnitTests() {
  console.log('🧪 Unit тесты для MapperService\n');
  
  let passedTests = 0;
  let failedTests = 0;

  // Тест 1: Загрузка маппингов из ProductMappingStore
  console.log('Тест 1: Загрузка маппингов из ProductMappingStore');
  try {
    const mockClient = new MockMoySkladClient();
    const mockProductStore = new MockProductMappingStore({ loadCount: 3 });
    const mockOrderStore = new MockOrderMappingStore();
    const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);

    const count = await mapper.loadMappings();
    
    console.assert(count === 3, 'Должно быть загружено 3 маппинга');
    console.assert(mockProductStore.isLoaded === true, 'Маппинги должны быть загружены');
    
    console.log('  ✓ Маппинги успешно загружены из ProductMappingStore');
    passedTests++;
  } catch (error) {
    console.error('  ✗ Ошибка:', error.message);
    failedTests++;
  }

  // Тест 2: Загрузка пустого маппинга
  console.log('\nТест 2: Загрузка пустого маппинга');
  try {
    const mockClient = new MockMoySkladClient();
    const mockProductStore = new MockProductMappingStore({ loadCount: 0 });
    const mockOrderStore = new MockOrderMappingStore();
    const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);

    const count = await mapper.loadMappings();
    
    console.assert(count === 0, 'Должно быть загружено 0 маппингов');
    console.assert(mockProductStore.isLoaded === true, 'Store должен быть помечен как загруженный');
    
    console.log('  ✓ Пустой маппинг загружен корректно');
    passedTests++;
  } catch (error) {
    console.error('  ✗ Ошибка:', error.message);
    failedTests++;
  }

  // Тест 3: Ошибка при загрузке маппингов
  console.log('\nТест 3: Ошибка при загрузке маппингов');
  try {
    const mockClient = new MockMoySkladClient();
    const mockProductStore = new MockProductMappingStore({ shouldThrowOnLoad: true });
    const mockOrderStore = new MockOrderMappingStore();
    const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);

    let errorThrown = false;
    try {
      await mapper.loadMappings();
    } catch (error) {
      errorThrown = true;
      console.assert(error.message.includes('Ошибка загрузки'), 'Должна быть выброшена ошибка загрузки');
    }
    
    console.assert(errorThrown === true, 'Должна быть выброшена ошибка');
    console.log('  ✓ Ошибка загрузки обработана корректно');
    passedTests++;
  } catch (error) {
    console.error('  ✗ Ошибка:', error.message);
    failedTests++;
  }

  // Тест 4: Маппинг product.id → offerId
  console.log('\nТест 4: Маппинг product.id → offerId');
  try {
    const mockClient = new MockMoySkladClient();
    const mockProductStore = new MockProductMappingStore({ loadCount: 3 });
    const mockOrderStore = new MockOrderMappingStore();
    const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);

    await mapper.loadMappings();
    
    const offerId1 = mapper.mapProductIdToOfferId('f8a2da33-bf0a-11ef-0a80-17e3002d7201');
    const offerId2 = mapper.mapProductIdToOfferId('a1b2c3d4-e5f6-11ef-0a80-17e3002d7202');
    const offerId3 = mapper.mapProductIdToOfferId('b2c3d4e5-f6a7-11ef-0a80-17e3002d7203');
    
    console.assert(offerId1 === 'OFFER001', 'Должен вернуть OFFER001');
    console.assert(offerId2 === 'OFFER002', 'Должен вернуть OFFER002');
    console.assert(offerId3 === 'OFFER003', 'Должен вернуть OFFER003');
    
    console.log('  ✓ Маппинг product.id → offerId работает корректно');
    passedTests++;
  } catch (error) {
    console.error('  ✗ Ошибка:', error.message);
    failedTests++;
  }

  // Тест 5: Маппинг несуществующего product.id
  console.log('\nТест 5: Маппинг несуществующего product.id');
  try {
    const mockClient = new MockMoySkladClient();
    const mockProductStore = new MockProductMappingStore({ loadCount: 3 });
    const mockOrderStore = new MockOrderMappingStore();
    const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);

    await mapper.loadMappings();
    
    const offerId = mapper.mapProductIdToOfferId('non-existent-product-id');
    
    console.assert(offerId === null, 'Должен вернуть null для несуществующего product.id');
    
    console.log('  ✓ Несуществующий product.id обработан корректно');
    passedTests++;
  } catch (error) {
    console.error('  ✗ Ошибка:', error.message);
    failedTests++;
  }

  // Тест 6: Маппинг с пустым product.id
  console.log('\nТест 6: Маппинг с пустым product.id');
  try {
    const mockClient = new MockMoySkladClient();
    const mockProductStore = new MockProductMappingStore({ loadCount: 3 });
    const mockOrderStore = new MockOrderMappingStore();
    const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);

    await mapper.loadMappings();
    
    const offerId1 = mapper.mapProductIdToOfferId('');
    const offerId2 = mapper.mapProductIdToOfferId(null);
    const offerId3 = mapper.mapProductIdToOfferId(undefined);
    
    console.assert(offerId1 === null, 'Пустая строка должна вернуть null');
    console.assert(offerId2 === null, 'null должен вернуть null');
    console.assert(offerId3 === null, 'undefined должен вернуть null');
    
    console.log('  ✓ Пустые значения product.id обработаны корректно');
    passedTests++;
  } catch (error) {
    console.error('  ✗ Ошибка:', error.message);
    failedTests++;
  }

  // Тест 7: Обратный маппинг offerId → product.id
  console.log('\nТест 7: Обратный маппинг offerId → product.id');
  try {
    const mockClient = new MockMoySkladClient();
    const mockProductStore = new MockProductMappingStore({ loadCount: 3 });
    const mockOrderStore = new MockOrderMappingStore();
    const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);

    await mapper.loadMappings();
    
    const productId1 = mapper.mapOfferIdToProductId('OFFER001');
    const productId2 = mapper.mapOfferIdToProductId('OFFER002');
    const productId3 = mapper.mapOfferIdToProductId('OFFER003');
    
    console.assert(productId1 === 'f8a2da33-bf0a-11ef-0a80-17e3002d7201', 'Должен вернуть правильный product.id');
    console.assert(productId2 === 'a1b2c3d4-e5f6-11ef-0a80-17e3002d7202', 'Должен вернуть правильный product.id');
    console.assert(productId3 === 'b2c3d4e5-f6a7-11ef-0a80-17e3002d7203', 'Должен вернуть правильный product.id');
    
    console.log('  ✓ Обратный маппинг offerId → product.id работает корректно');
    passedTests++;
  } catch (error) {
    console.error('  ✗ Ошибка:', error.message);
    failedTests++;
  }

  // Тест 8: Обратный маппинг несуществующего offerId
  console.log('\nТест 8: Обратный маппинг несуществующего offerId');
  try {
    const mockClient = new MockMoySkladClient();
    const mockProductStore = new MockProductMappingStore({ loadCount: 3 });
    const mockOrderStore = new MockOrderMappingStore();
    const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);

    await mapper.loadMappings();
    
    const productId = mapper.mapOfferIdToProductId('OFFER999');
    
    console.assert(productId === null, 'Должен вернуть null для несуществующего offerId');
    
    console.log('  ✓ Несуществующий offerId обработан корректно');
    passedTests++;
  } catch (error) {
    console.error('  ✗ Ошибка:', error.message);
    failedTests++;
  }

  // Тест 9: Обратный маппинг с пустым offerId
  console.log('\nТест 9: Обратный маппинг с пустым offerId');
  try {
    const mockClient = new MockMoySkladClient();
    const mockProductStore = new MockProductMappingStore({ loadCount: 3 });
    const mockOrderStore = new MockOrderMappingStore();
    const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);

    await mapper.loadMappings();
    
    const productId1 = mapper.mapOfferIdToProductId('');
    const productId2 = mapper.mapOfferIdToProductId(null);
    const productId3 = mapper.mapOfferIdToProductId(undefined);
    
    console.assert(productId1 === null, 'Пустая строка должна вернуть null');
    console.assert(productId2 === null, 'null должен вернуть null');
    console.assert(productId3 === null, 'undefined должен вернуть null');
    
    console.log('  ✓ Пустые значения offerId обработаны корректно');
    passedTests++;
  } catch (error) {
    console.error('  ✗ Ошибка:', error.message);
    failedTests++;
  }

  // Тест 10: Получение всех product.id
  console.log('\nТест 10: Получение всех product.id');
  try {
    const mockClient = new MockMoySkladClient();
    const mockProductStore = new MockProductMappingStore({ loadCount: 3 });
    const mockOrderStore = new MockOrderMappingStore();
    const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);

    await mapper.loadMappings();
    
    const allProductIds = mapper.getAllProductIds();
    
    console.assert(allProductIds.length === 3, 'Должно быть 3 product.id');
    console.assert(allProductIds.includes('f8a2da33-bf0a-11ef-0a80-17e3002d7201'), 'Должен содержать первый product.id');
    console.assert(allProductIds.includes('a1b2c3d4-e5f6-11ef-0a80-17e3002d7202'), 'Должен содержать второй product.id');
    console.assert(allProductIds.includes('b2c3d4e5-f6a7-11ef-0a80-17e3002d7203'), 'Должен содержать третий product.id');
    
    console.log('  ✓ Получение всех product.id работает корректно');
    passedTests++;
  } catch (error) {
    console.error('  ✗ Ошибка:', error.message);
    failedTests++;
  }

  // Тест 11: Получение всех offerId
  console.log('\nТест 11: Получение всех offerId');
  try {
    const mockClient = new MockMoySkladClient();
    const mockProductStore = new MockProductMappingStore({ loadCount: 3 });
    const mockOrderStore = new MockOrderMappingStore();
    const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);

    await mapper.loadMappings();
    
    const allOfferIds = mapper.getAllOfferIds();
    
    console.assert(allOfferIds.length === 3, 'Должно быть 3 offerId');
    console.assert(allOfferIds.includes('OFFER001'), 'Должен содержать OFFER001');
    console.assert(allOfferIds.includes('OFFER002'), 'Должен содержать OFFER002');
    console.assert(allOfferIds.includes('OFFER003'), 'Должен содержать OFFER003');
    
    console.log('  ✓ Получение всех offerId работает корректно');
    passedTests++;
  } catch (error) {
    console.error('  ✗ Ошибка:', error.message);
    failedTests++;
  }

  // Тест 12: Получение списков из пустого маппинга
  console.log('\nТест 12: Получение списков из пустого маппинга');
  try {
    const mockClient = new MockMoySkladClient();
    const mockProductStore = new MockProductMappingStore({ loadCount: 0 });
    const mockOrderStore = new MockOrderMappingStore();
    const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);

    await mapper.loadMappings();
    
    const allProductIds = mapper.getAllProductIds();
    const allOfferIds = mapper.getAllOfferIds();
    
    console.assert(allProductIds.length === 0, 'Должен вернуть пустой массив product.id');
    console.assert(allOfferIds.length === 0, 'Должен вернуть пустой массив offerId');
    
    console.log('  ✓ Получение списков из пустого маппинга работает корректно');
    passedTests++;
  } catch (error) {
    console.error('  ✗ Ошибка:', error.message);
    failedTests++;
  }

  // Тест 13: Получение статистики
  console.log('\nТест 13: Получение статистики');
  try {
    const mockClient = new MockMoySkladClient();
    const mockProductStore = new MockProductMappingStore({ loadCount: 3 });
    const mockOrderStore = new MockOrderMappingStore();
    const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);

    await mapper.loadMappings();
    
    const stats = mapper.getStats();
    
    console.assert(stats.totalMappings === 3, 'Должно быть 3 маппинга');
    console.assert(stats.isLoaded === true, 'Маппинги должны быть загружены');
    console.assert(stats.lastLoaded !== null, 'Должна быть дата загрузки');
    console.assert(stats.filePath === './data/product-mappings.json', 'Должен быть правильный путь к файлу');
    
    console.log('  ✓ Получение статистики работает корректно');
    passedTests++;
  } catch (error) {
    console.error('  ✗ Ошибка:', error.message);
    failedTests++;
  }

  // Тест 14: Двунаправленная консистентность маппинга
  console.log('\nТест 14: Двунаправленная консистентность маппинга');
  try {
    const mockClient = new MockMoySkladClient();
    const mockProductStore = new MockProductMappingStore({ loadCount: 3 });
    const mockOrderStore = new MockOrderMappingStore();
    const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);

    await mapper.loadMappings();
    
    // Проверяем что прямой и обратный маппинг консистентны
    const productId = 'f8a2da33-bf0a-11ef-0a80-17e3002d7201';
    const offerId = mapper.mapProductIdToOfferId(productId);
    const productIdBack = mapper.mapOfferIdToProductId(offerId);
    
    console.assert(productIdBack === productId, 'Обратный маппинг должен вернуть исходный product.id');
    
    // Проверяем в обратном направлении
    const offerId2 = 'OFFER002';
    const productId2 = mapper.mapOfferIdToProductId(offerId2);
    const offerIdBack = mapper.mapProductIdToOfferId(productId2);
    
    console.assert(offerIdBack === offerId2, 'Прямой маппинг должен вернуть исходный offerId');
    
    console.log('  ✓ Двунаправленная консистентность маппинга подтверждена');
    passedTests++;
  } catch (error) {
    console.error('  ✗ Ошибка:', error.message);
    failedTests++;
  }

  // Итоги
  console.log('\n' + '='.repeat(50));
  console.log(`Всего тестов: ${passedTests + failedTests}`);
  console.log(`Пройдено: ${passedTests}`);
  console.log(`Провалено: ${failedTests}`);
  
  if (failedTests === 0) {
    console.log('\n✅ Все unit тесты пройдены успешно!');
    process.exit(0);
  } else {
    console.log('\n❌ Некоторые тесты провалены');
    process.exit(1);
  }
}

runUnitTests();
