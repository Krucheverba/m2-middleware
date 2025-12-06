/**
 * Property-Based тест для полноты обратного маппинга
 * 
 * Feature: product-id-mapping-refactor, Property 7: Reverse mapping completeness
 * Validates: Requirements 8.2, 8.3
 * 
 * Property: Для любого offerId в таблице маппинга, обратный lookup должен вернуть
 * ровно один product.id.
 * 
 * Формально: ∀ offerId ∈ mappings.values: 
 *   ∃! productId: mapOfferIdToProductId(offerId) === productId
 */

// Установить переменные окружения перед загрузкой модулей
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign';
process.env.YANDEX_TOKEN = 'test-token';
process.env.MS_TOKEN = 'test-ms-token';
process.env.LOG_LEVEL = 'error'; // Минимизировать вывод логов

const fc = require('fast-check');
const MapperService = require('./src/services/mapperService');

// Мок для MoySkladClient
class MockMoySkladClient {}

// Мок для OrderMappingStore
class MockOrderMappingStore {}

// Мок для ProductMappingStore с динамическими данными
class MockProductMappingStore {
  constructor(mappings = new Map()) {
    this.productToOfferMap = new Map(mappings);
    this.offerToProductMap = new Map();
    
    // Построить обратный индекс
    for (const [productId, offerId] of this.productToOfferMap.entries()) {
      this.offerToProductMap.set(offerId, productId);
    }
    
    this.isLoaded = false;
    this.lastLoaded = null;
    this.filePath = './data/product-mappings.json';
  }

  async load() {
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

// Генератор UUID для product.id
const uuidArbitrary = fc.uuid();

// Генератор offerId (строка из букв, цифр и дефисов)
const offerIdArbitrary = fc.stringMatching(/^[A-Z0-9][A-Z0-9\-_]{3,20}$/);

// Генератор маппинга product.id -> offerId
const mappingArbitrary = fc.dictionary(
  uuidArbitrary,
  offerIdArbitrary,
  { minKeys: 1, maxKeys: 20 }
);

/**
 * Property 7: Reverse mapping completeness
 * 
 * Для любого offerId в таблице маппинга, обратный lookup должен вернуть
 * ровно один product.id.
 */
async function testReverseMappingCompleteness() {
  console.log('🧪 Property Test: Reverse mapping completeness\n');
  
  const property = fc.asyncProperty(
    mappingArbitrary,
    async (mappingsObj) => {
      // Преобразовать объект в Map
      const mappings = new Map(Object.entries(mappingsObj));
      
      // Пропустить если нет маппингов
      if (mappings.size === 0) {
        return true;
      }
      
      // Создать моки
      const mockMoySkladClient = new MockMoySkladClient();
      const mockOrderMappingStore = new MockOrderMappingStore();
      const mockProductMappingStore = new MockProductMappingStore(mappings);
      
      const mapperService = new MapperService(
        mockMoySkladClient,
        mockProductMappingStore,
        mockOrderMappingStore
      );
      
      // Загрузить маппинги
      await mapperService.loadMappings();
      
      // Получить все offerId из маппинга
      const allOfferIds = mockProductMappingStore.getAllOfferIds();
      
      // Для каждого offerId проверить что обратный lookup возвращает ровно один product.id
      for (const offerId of allOfferIds) {
        const productId = mapperService.mapOfferIdToProductId(offerId);
        
        // Проверить что product.id найден
        if (!productId) {
          console.error(`❌ Ошибка: offerId ${offerId} не имеет обратного маппинга`);
          return false;
        }
        
        // Проверить что это правильный product.id
        const expectedProductId = Array.from(mappings.entries())
          .find(([pid, oid]) => oid === offerId)?.[0];
        
        if (productId !== expectedProductId) {
          console.error(`❌ Ошибка: offerId ${offerId} маппится на неправильный product.id`);
          console.error(`   Ожидалось: ${expectedProductId}`);
          console.error(`   Получено: ${productId}`);
          return false;
        }
        
        // Проверить что это единственный product.id для этого offerId
        // (проверяем что нет дубликатов offerId в маппинге)
        const productIdsForOfferId = Array.from(mappings.entries())
          .filter(([pid, oid]) => oid === offerId)
          .map(([pid, oid]) => pid);
        
        if (productIdsForOfferId.length !== 1) {
          console.error(`❌ Ошибка: offerId ${offerId} имеет ${productIdsForOfferId.length} маппингов`);
          console.error(`   Должен быть ровно один маппинг`);
          return false;
        }
      }
      
      return true;
    }
  );
  
  try {
    await fc.assert(property, {
      numRuns: 100,
      verbose: false
    });
    
    console.log('✅ Property Test пройден: Reverse mapping completeness');
    console.log('   Проверено 100 случайных таблиц маппинга');
    console.log('   Каждый offerId имеет ровно один product.id\n');
    
    return true;
  } catch (error) {
    console.error('❌ Property Test провален:', error.message);
    if (error.counterexample) {
      console.error('   Контрпример:', JSON.stringify(error.counterexample, null, 2));
    }
    return false;
  }
}

// Запустить тест
async function runTests() {
  console.log('🚀 Запуск Property-Based тестов для обратного маппинга\n');
  
  const success = await testReverseMappingCompleteness();
  
  if (success) {
    console.log('✅ Все Property-Based тесты пройдены успешно!');
    process.exit(0);
  } else {
    console.error('❌ Некоторые Property-Based тесты провалены');
    process.exit(1);
  }
}

runTests();
