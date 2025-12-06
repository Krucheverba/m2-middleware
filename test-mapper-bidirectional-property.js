/**
 * Property-Based тест для двунаправленной консистентности маппинга
 * 
 * Feature: product-id-mapping-refactor, Property 1: Bidirectional mapping consistency
 * Validates: Requirements 2.2, 8.3
 * 
 * Property: Для любого product.id в таблице маппинга, если мы преобразуем его в offerId,
 * а затем обратно в product.id, мы должны получить исходный product.id.
 * 
 * Формально: ∀ productId ∈ mappings: mapOfferIdToProductId(mapProductIdToOfferId(productId)) === productId
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

// Генератор таблицы маппингов (массив уникальных пар)
const mappingTableArbitrary = fc.array(mappingPairArbitrary, { minLength: 1, maxLength: 50 })
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
  })
  .filter(map => map.size > 0); // Убедиться что есть хотя бы один маппинг

async function runPropertyTests() {
  console.log('🔬 Property-Based тесты для MapperService\n');
  console.log('Property 1: Bidirectional mapping consistency');
  console.log('Validates: Requirements 2.2, 8.3\n');
  
  let allTestsPassed = true;

  // Property 1: Двунаправленная консистентность маппинга (product.id → offerId → product.id)
  console.log('Тест 1: product.id → offerId → product.id должен вернуть исходный product.id');
  try {
    await fc.assert(
      fc.asyncProperty(mappingTableArbitrary, async (mappings) => {
        // Создать MapperService с сгенерированными маппингами
        const mockClient = new MockMoySkladClient();
        const mockProductStore = new MockProductMappingStore(mappings);
        const mockOrderStore = new MockOrderMappingStore();
        const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);
        
        await mapper.loadMappings();
        
        // Для каждого product.id в маппинге проверить двунаправленную консистентность
        for (const productId of mappings.keys()) {
          const offerId = mapper.mapProductIdToOfferId(productId);
          
          // offerId не должен быть null для существующего маппинга
          if (offerId === null) {
            return false;
          }
          
          const productIdBack = mapper.mapOfferIdToProductId(offerId);
          
          // Обратный маппинг должен вернуть исходный product.id
          if (productIdBack !== productId) {
            return false;
          }
        }
        
        return true;
      }),
      { numRuns: 100 } // Минимум 100 итераций согласно дизайн-документу
    );
    
    console.log('  ✓ Property 1 (forward): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 1 (forward): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 1 (обратное направление): Двунаправленная консистентность маппинга (offerId → product.id → offerId)
  console.log('\nТест 2: offerId → product.id → offerId должен вернуть исходный offerId');
  try {
    await fc.assert(
      fc.asyncProperty(mappingTableArbitrary, async (mappings) => {
        // Создать MapperService с сгенерированными маппингами
        const mockClient = new MockMoySkladClient();
        const mockProductStore = new MockProductMappingStore(mappings);
        const mockOrderStore = new MockOrderMappingStore();
        const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);
        
        await mapper.loadMappings();
        
        // Для каждого offerId в маппинге проверить двунаправленную консистентность
        const offerIds = Array.from(mappings.values());
        for (const offerId of offerIds) {
          const productId = mapper.mapOfferIdToProductId(offerId);
          
          // product.id не должен быть null для существующего маппинга
          if (productId === null) {
            return false;
          }
          
          const offerIdBack = mapper.mapProductIdToOfferId(productId);
          
          // Прямой маппинг должен вернуть исходный offerId
          if (offerIdBack !== offerId) {
            return false;
          }
        }
        
        return true;
      }),
      { numRuns: 100 } // Минимум 100 итераций согласно дизайн-документу
    );
    
    console.log('  ✓ Property 1 (reverse): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 1 (reverse): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 1 (инъективность): Каждый offerId должен соответствовать ровно одному product.id
  console.log('\nТест 3: Каждый offerId должен соответствовать ровно одному product.id (инъективность)');
  try {
    await fc.assert(
      fc.asyncProperty(mappingTableArbitrary, async (mappings) => {
        // Создать MapperService с сгенерированными маппингами
        const mockClient = new MockMoySkladClient();
        const mockProductStore = new MockProductMappingStore(mappings);
        const mockOrderStore = new MockOrderMappingStore();
        const mapper = new MapperService(mockClient, mockProductStore, mockOrderStore);
        
        await mapper.loadMappings();
        
        // Проверить что каждый offerId соответствует ровно одному product.id
        const offerIdToProductIdMap = new Map();
        
        for (const [productId, offerId] of mappings.entries()) {
          const mappedProductId = mapper.mapOfferIdToProductId(offerId);
          
          if (mappedProductId === null) {
            return false;
          }
          
          if (offerIdToProductIdMap.has(offerId)) {
            // Если offerId уже встречался, проверить что он соответствует тому же product.id
            if (offerIdToProductIdMap.get(offerId) !== mappedProductId) {
              return false;
            }
          } else {
            offerIdToProductIdMap.set(offerId, mappedProductId);
          }
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Property 1 (injectivity): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 1 (injectivity): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Итоги
  console.log('\n' + '='.repeat(50));
  
  if (allTestsPassed) {
    console.log('✅ Все property-based тесты пройдены успешно!');
    console.log('Property 1: Bidirectional mapping consistency - PASSED');
    process.exit(0);
  } else {
    console.log('❌ Некоторые property-based тесты провалены');
    console.log('Property 1: Bidirectional mapping consistency - FAILED');
    process.exit(1);
  }
}

runPropertyTests();
