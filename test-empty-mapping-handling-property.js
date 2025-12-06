/**
 * Property-Based тест для обработки пустого маппинга
 * 
 * Feature: product-id-mapping-refactor, Property 10: Empty mapping handling
 * Validates: Requirements 2.3, 8.4
 * 
 * Property: Для любого product.id или offerId, которого нет в таблице маппинга,
 * операции lookup должны возвращать null и логировать предупреждение без выброса ошибок.
 * 
 * Формально: ∀ id ∉ mappings: lookup(id) === null ∧ ¬throws(Error)
 */

// Установить переменные окружения перед загрузкой модулей
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign';
process.env.YANDEX_TOKEN = 'test-token';
process.env.MS_TOKEN = 'test-ms-token';
process.env.LOG_LEVEL = 'error'; // Минимизировать вывод логов

const fc = require('fast-check');
const MapperService = require('./src/services/mapperService');
const ProductMappingStore = require('./src/storage/productMappingStore');

// Мок для MoySkladClient
class MockMoySkladClient {}

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
    
    if (!productId || typeof productId !== 'string') {
      return null;
    }
    
    return this.productToOfferMap.get(productId) || null;
  }

  getProductId(offerId) {
    if (!this.isLoaded) {
      throw new Error('Маппинги не загружены');
    }
    
    if (!offerId || typeof offerId !== 'string') {
      return null;
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

// Генератор UUID в формате МойСклад
const uuidArbitrary = fc.uuid();

// Генератор offerId (буквенно-цифровая строка с дефисами и подчеркиваниями)
const offerIdArbitrary = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9_-]{3,49}$/);

// Генератор пары (productId, offerId)
const mappingPairArbitrary = fc.tuple(uuidArbitrary, offerIdArbitrary);

// Генератор таблицы маппингов (может быть пустой или содержать элементы)
const mappingTableArbitrary = fc.array(mappingPairArbitrary, { minLength: 0, maxLength: 50 })
  .map(pairs => {
    // Убедиться что productId и offerId уникальны
    const uniqueMap = new Map();
    const usedOfferIds = new Set();
    
    for (const [productId, offerId] of pairs) {
      if (!uniqueMap.has(productId) && !usedOfferIds.has(offerId)) {
        uniqueMap.set(productId, offerId);
        usedOfferIds.add(offerId);
      }
    }
    
    return uniqueMap;
  });

async function runPropertyTests() {
  console.log('🔬 Property-Based тесты для обработки пустого маппинга\n');
  console.log('Property 10: Empty mapping handling');
  console.log('Validates: Requirements 2.3, 8.4\n');
  
  let allTestsPassed = true;

  // Property 10.1: Lookup несуществующего product.id должен вернуть null без ошибок
  console.log('Тест 1: Lookup несуществующего product.id должен вернуть null без ошибок');
  try {
    await fc.assert(
      fc.asyncProperty(
        mappingTableArbitrary,
        uuidArbitrary,
        async (mappings, nonExistentProductId) => {
          // Убедиться что product.id не существует в маппинге
          fc.pre(!mappings.has(nonExistentProductId));
          
          // Создать MapperService с маппингами
          const mockClient = new MockMoySkladClient();
          const mockProductStore = new MockProductMappingStore(mappings);
          const mockOrderStore = new MockOrderMappingStore();
          const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);
          
          await mapper.loadMappings();
          
          // Попытка lookup несуществующего product.id не должна выбросить ошибку
          let result;
          let errorThrown = false;
          
          try {
            result = mapper.mapProductIdToOfferId(nonExistentProductId);
          } catch (error) {
            errorThrown = true;
          }
          
          // Проверить что ошибка не была выброшена и результат null
          return !errorThrown && result === null;
        }
      ),
      { numRuns: 100 } // Минимум 100 итераций согласно дизайн-документу
    );
    
    console.log('  ✓ Тест 1: Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Тест 1: Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 10.2: Lookup несуществующего offerId должен вернуть null без ошибок
  console.log('\nТест 2: Lookup несуществующего offerId должен вернуть null без ошибок');
  try {
    await fc.assert(
      fc.asyncProperty(
        mappingTableArbitrary,
        offerIdArbitrary,
        async (mappings, nonExistentOfferId) => {
          // Убедиться что offerId не существует в маппинге
          const existingOfferIds = Array.from(mappings.values());
          fc.pre(!existingOfferIds.includes(nonExistentOfferId));
          
          // Создать MapperService с маппингами
          const mockClient = new MockMoySkladClient();
          const mockProductStore = new MockProductMappingStore(mappings);
          const mockOrderStore = new MockOrderMappingStore();
          const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);
          
          await mapper.loadMappings();
          
          // Попытка lookup несуществующего offerId не должна выбросить ошибку
          let result;
          let errorThrown = false;
          
          try {
            result = mapper.mapOfferIdToProductId(nonExistentOfferId);
          } catch (error) {
            errorThrown = true;
          }
          
          // Проверить что ошибка не была выброшена и результат null
          return !errorThrown && result === null;
        }
      ),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Тест 2: Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Тест 2: Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 10.3: Lookup с пустым маппингом должен всегда возвращать null
  console.log('\nТест 3: Lookup с пустым маппингом должен всегда возвращать null');
  try {
    await fc.assert(
      fc.asyncProperty(
        uuidArbitrary,
        offerIdArbitrary,
        async (productId, offerId) => {
          // Создать MapperService с пустым маппингом
          const mockClient = new MockMoySkladClient();
          const mockProductStore = new MockProductMappingStore(new Map());
          const mockOrderStore = new MockOrderMappingStore();
          const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);
          
          await mapper.loadMappings();
          
          // Оба lookup должны вернуть null без ошибок
          let productLookupResult;
          let offerLookupResult;
          let errorThrown = false;
          
          try {
            productLookupResult = mapper.mapProductIdToOfferId(productId);
            offerLookupResult = mapper.mapOfferIdToProductId(offerId);
          } catch (error) {
            errorThrown = true;
          }
          
          // Проверить что ошибки не были выброшены и оба результата null
          return !errorThrown && 
                 productLookupResult === null && 
                 offerLookupResult === null;
        }
      ),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Тест 3: Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Тест 3: Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 10.4: Lookup с невалидными входными данными должен вернуть null
  console.log('\nТест 4: Lookup с невалидными входными данными должен вернуть null');
  try {
    await fc.assert(
      fc.asyncProperty(
        mappingTableArbitrary,
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.constant(''),
          fc.constant(123),
          fc.constant({}),
          fc.constant([])
        ),
        async (mappings, invalidInput) => {
          // Создать MapperService с маппингами
          const mockClient = new MockMoySkladClient();
          const mockProductStore = new MockProductMappingStore(mappings);
          const mockOrderStore = new MockOrderMappingStore();
          const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);
          
          await mapper.loadMappings();
          
          // Попытка lookup с невалидными данными не должна выбросить ошибку
          let productLookupResult;
          let offerLookupResult;
          let errorThrown = false;
          
          try {
            productLookupResult = mapper.mapProductIdToOfferId(invalidInput);
            offerLookupResult = mapper.mapOfferIdToProductId(invalidInput);
          } catch (error) {
            errorThrown = true;
          }
          
          // Проверить что ошибки не были выброшены и оба результата null
          return !errorThrown && 
                 productLookupResult === null && 
                 offerLookupResult === null;
        }
      ),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Тест 4: Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Тест 4: Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 10.5: getAllProductIds и getAllOfferIds должны работать с пустым маппингом
  console.log('\nТест 5: getAllProductIds и getAllOfferIds должны работать с пустым маппингом');
  try {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(new Map()),
        async (emptyMappings) => {
          // Создать MapperService с пустым маппингом
          const mockClient = new MockMoySkladClient();
          const mockProductStore = new MockProductMappingStore(emptyMappings);
          const mockOrderStore = new MockOrderMappingStore();
          const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);
          
          await mapper.loadMappings();
          
          // Получить списки должно работать без ошибок
          let productIds;
          let offerIds;
          let errorThrown = false;
          
          try {
            productIds = mapper.getAllProductIds();
            offerIds = mapper.getAllOfferIds();
          } catch (error) {
            errorThrown = true;
          }
          
          // Проверить что ошибки не были выброшены и оба массива пустые
          return !errorThrown && 
                 Array.isArray(productIds) && 
                 productIds.length === 0 &&
                 Array.isArray(offerIds) && 
                 offerIds.length === 0;
        }
      ),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Тест 5: Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Тест 5: Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Итоги
  console.log('\n' + '='.repeat(50));
  
  if (allTestsPassed) {
    console.log('✅ Все property-based тесты пройдены успешно!');
    console.log('Property 10: Empty mapping handling - PASSED');
    process.exit(0);
  } else {
    console.log('❌ Некоторые property-based тесты провалены');
    console.log('Property 10: Empty mapping handling - FAILED');
    process.exit(1);
  }
}

runPropertyTests();
