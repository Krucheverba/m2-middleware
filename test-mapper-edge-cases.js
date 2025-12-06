/**
 * Тест граничных случаев для MapperService (обновлен для работы с product.id)
 */

// Установить переменные окружения
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign';
process.env.YANDEX_TOKEN = 'test-token';
process.env.MS_TOKEN = 'test-ms-token';
process.env.LOG_LEVEL = 'error';

const MapperService = require('./src/services/mapperService');

// Мок для MoySkladClient
class MockMoySkladClient {
  // Больше не нужны методы для работы с атрибутами
}

// Мок для ProductMappingStore
class MockProductMappingStore {
  constructor(scenario) {
    this.scenario = scenario;
    this.productToOfferMap = new Map();
    this.offerToProductMap = new Map();
    this.isLoaded = false;
    this.lastLoaded = null;
    this.filePath = './data/product-mappings.json';
  }

  async load() {
    if (this.scenario === 'empty') {
      this.isLoaded = true;
      this.lastLoaded = new Date();
      return 0;
    }
    
    if (this.scenario === 'error') {
      throw new Error('Ошибка загрузки файла маппинга');
    }
    
    // Нормальный сценарий
    this.productToOfferMap.set('f8a2da33-bf0a-11ef-0a80-17e3002d7201', 'OFFER001');
    this.offerToProductMap.set('OFFER001', 'f8a2da33-bf0a-11ef-0a80-17e3002d7201');
    this.isLoaded = true;
    this.lastLoaded = new Date();
    return 1;
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

async function runEdgeCaseTests() {
  console.log('🧪 Тестирование граничных случаев MapperService (обновленная версия)...\n');

  try {
    // Тест 1: Ошибка загрузки файла маппинга
    console.log('✓ Тест 1: Ошибка загрузки файла маппинга');
    const mockClient1 = new MockMoySkladClient();
    const mockProductStore1 = new MockProductMappingStore('error');
    const mockOrderStore1 = new MockOrderMappingStore();
    const mapper1 = new MapperService(mockClient1, mockProductStore1, mockOrderStore1);
    
    try {
      await mapper1.loadMappings();
      console.error('  ❌ Должна была быть выброшена ошибка');
      process.exit(1);
    } catch (error) {
      console.log('  ✓ Ошибка корректно выброшена:', error.message);
    }

    // Тест 2: Пустой файл маппинга
    console.log('\n✓ Тест 2: Пустой файл маппинга');
    const mockClient2 = new MockMoySkladClient();
    const mockProductStore2 = new MockProductMappingStore('empty');
    const mockOrderStore2 = new MockOrderMappingStore();
    const mapper2 = new MapperService(mockClient2, mockProductStore2, mockOrderStore2);
    
    const count = await mapper2.loadMappings();
    console.log(`  Загружено маппингов: ${count}`);
    console.assert(count === 0, 'Должно быть 0 маппингов');

    // Тест 3: Маппинг с пустыми значениями
    console.log('\n✓ Тест 3: Маппинг с пустыми значениями');
    const mockClient3 = new MockMoySkladClient();
    const mockProductStore3 = new MockProductMappingStore('normal');
    const mockOrderStore3 = new MockOrderMappingStore();
    const mapper3 = new MapperService(mockClient3, mockProductStore3, mockOrderStore3);
    
    await mapper3.loadMappings();
    
    const result1 = mapper3.mapProductIdToOfferId('');
    const result2 = mapper3.mapProductIdToOfferId(null);
    const result3 = mapper3.mapOfferIdToProductId('');
    const result4 = mapper3.mapOfferIdToProductId(null);
    
    console.assert(result1 === null, 'Пустой product.id должен вернуть null');
    console.assert(result2 === null, 'null product.id должен вернуть null');
    console.assert(result3 === null, 'Пустой offerId должен вернуть null');
    console.assert(result4 === null, 'null offerId должен вернуть null');
    console.log('  ✓ Пустые значения обработаны корректно');

    // Тест 4: Попытка маппинга до загрузки
    console.log('\n✓ Тест 4: Попытка маппинга до загрузки');
    const mockClient4 = new MockMoySkladClient();
    const mockProductStore4 = new MockProductMappingStore('normal');
    const mockOrderStore4 = new MockOrderMappingStore();
    const mapper4 = new MapperService(mockClient4, mockProductStore4, mockOrderStore4);
    
    // Не загружаем маппинги, сразу пытаемся использовать
    const result5 = mapper4.mapProductIdToOfferId('f8a2da33-bf0a-11ef-0a80-17e3002d7201');
    console.assert(result5 === null, 'Должен вернуть null если маппинги не загружены');
    console.log('  ✓ Попытка маппинга до загрузки обработана корректно');

    // Тест 5: Получение несуществующего маппинга заказа
    console.log('\n✓ Тест 5: Получение несуществующего маппинга заказа');
    const mockClient5 = new MockMoySkladClient();
    const mockProductStore5 = new MockProductMappingStore('normal');
    const mockOrderStore5 = new MockOrderMappingStore();
    const mapper5 = new MapperService(mockClient5, mockProductStore5, mockOrderStore5);
    
    const result = await mapper5.getMoySkladOrderId('NON-EXISTENT-ORDER');
    console.assert(result === null, 'Несуществующий маппинг должен вернуть null');
    console.log('  ✓ Несуществующий маппинг обработан корректно');

    // Тест 6: Статистика после инициализации
    console.log('\n✓ Тест 6: Статистика после инициализации');
    const mockClient6 = new MockMoySkladClient();
    const mockProductStore6 = new MockProductMappingStore('normal');
    const mockOrderStore6 = new MockOrderMappingStore();
    const mapper6 = new MapperService(mockClient6, mockProductStore6, mockOrderStore6);
    
    await mapper6.loadMappings();
    
    const stats = mapper6.getStats();
    console.log(`  Всего маппингов: ${stats.totalMappings}`);
    console.log(`  Загружено: ${stats.isLoaded}`);
    console.log(`  Файл: ${stats.filePath}`);
    console.assert(stats.totalMappings === 1, 'Должен быть 1 маппинг');
    console.assert(stats.isLoaded === true, 'Маппинги должны быть загружены');

    // Тест 7: Получение списков до загрузки
    console.log('\n✓ Тест 7: Получение списков до загрузки');
    const mockClient7 = new MockMoySkladClient();
    const mockProductStore7 = new MockProductMappingStore('normal');
    const mockOrderStore7 = new MockOrderMappingStore();
    const mapper7 = new MapperService(mockClient7, mockProductStore7, mockOrderStore7);
    
    // Не загружаем маппинги
    const productIds = mapper7.getAllProductIds();
    const offerIds = mapper7.getAllOfferIds();
    console.assert(productIds.length === 0, 'Должен вернуть пустой массив');
    console.assert(offerIds.length === 0, 'Должен вернуть пустой массив');
    console.log('  ✓ Получение списков до загрузки обработано корректно');

    console.log('\n✅ Все тесты граничных случаев пройдены успешно!');
  } catch (error) {
    console.error('\n❌ Ошибка при выполнении тестов:', error);
    process.exit(1);
  }
}

runEdgeCaseTests();
