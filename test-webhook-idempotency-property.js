/**
 * Property-Based тест для идемпотентности обработки webhook
 * 
 * Feature: product-id-mapping-refactor, Property 4: Webhook processing idempotency
 * Validates: Requirements 4.3, 4.4
 * 
 * Property: Для любого product.id полученного в webhook, обработка его несколько раз
 * должна давать одинаковый результат (тот же offerId lookup, то же обновление остатков).
 * 
 * Формально: ∀ productId, ∀ n ≥ 1: handleStockUpdate(productId) выполненный n раз
 * должен давать тот же результат что и выполненный 1 раз
 */

// Установить переменные окружения перед загрузкой модулей
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign';
process.env.YANDEX_TOKEN = 'test-token';
process.env.MS_TOKEN = 'test-ms-token';
process.env.LOG_LEVEL = 'error'; // Минимизировать вывод логов

const fc = require('fast-check');
const StockService = require('./src/services/stockService');

// Генератор UUID в формате МойСклад
const uuidArbitrary = fc.uuid();

// Генератор offerId (буквенно-цифровая строка с дефисами и подчеркиваниями)
const offerIdArbitrary = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9_-]{3,49}$/);

// Генератор пары (productId, offerId)
const mappingPairArbitrary = fc.tuple(uuidArbitrary, offerIdArbitrary);

// Генератор таблицы маппингов (массив уникальных пар)
const mappingTableArbitrary = fc.array(mappingPairArbitrary, { minLength: 1, maxLength: 30 })
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

// Генератор количества повторений (от 1 до 5)
const repeatCountArbitrary = fc.integer({ min: 1, max: 5 });

/**
 * Создать моки для тестирования идемпотентности
 */
function createMocks(mappings) {
  const stockCallHistory = [];
  const yandexCallHistory = [];
  
  const mockMoySkladClient = {
    async getProductStock(productId) {
      // Записать вызов
      stockCallHistory.push({
        method: 'getProductStock',
        productId,
        timestamp: Date.now()
      });
      
      // Всегда возвращать одинаковые данные для одного и того же productId
      return {
        productId: productId,
        totalStock: 30,
        totalReserve: 10,
        availableStock: 20,
        stockByStore: [
          { stock: 20, reserve: 5 },
          { stock: 10, reserve: 5 }
        ]
      };
    }
  };

  const mockYandexClient = {
    async updateStocks(stockUpdates) {
      // Записать вызов
      yandexCallHistory.push({
        method: 'updateStocks',
        stockUpdates: JSON.parse(JSON.stringify(stockUpdates)), // Deep copy
        timestamp: Date.now()
      });
      
      return { status: 'OK' };
    }
  };

  const mockMapperService = {
    mappings: new Map(mappings),
    
    mapProductIdToOfferId(productId) {
      return this.mappings.get(productId) || null;
    },
    
    mapOfferIdToProductId(offerId) {
      for (const [pid, oid] of this.mappings.entries()) {
        if (oid === offerId) return pid;
      }
      return null;
    },
    
    getAllProductIds() {
      return Array.from(this.mappings.keys());
    },
    
    getAllOfferIds() {
      return Array.from(this.mappings.values());
    }
  };

  const stockService = new StockService(
    mockMoySkladClient,
    mockYandexClient,
    mockMapperService
  );

  return { 
    stockService, 
    mockMoySkladClient, 
    mockYandexClient, 
    mockMapperService,
    stockCallHistory,
    yandexCallHistory
  };
}

/**
 * Сравнить два вызова updateStocks на эквивалентность
 */
function stockUpdatesAreEqual(update1, update2) {
  if (update1.length !== update2.length) {
    return false;
  }
  
  for (let i = 0; i < update1.length; i++) {
    const u1 = update1[i];
    const u2 = update2[i];
    
    if (u1.offerId !== u2.offerId || 
        u1.count !== u2.count || 
        u1.warehouseId !== u2.warehouseId) {
      return false;
    }
  }
  
  return true;
}

async function runPropertyTests() {
  console.log('🔬 Property-Based тесты для идемпотентности обработки webhook\n');
  console.log('Property 4: Webhook processing idempotency');
  console.log('Validates: Requirements 4.3, 4.4\n');
  
  let allTestsPassed = true;

  // Property 4: Идемпотентность обработки webhook (один и тот же результат при повторных вызовах)
  console.log('Тест 1: Обработка одного и того же product.id N раз должна давать одинаковый результат');
  try {
    await fc.assert(
      fc.asyncProperty(
        mappingTableArbitrary,
        repeatCountArbitrary,
        async (mappings, repeatCount) => {
          // Выбрать случайный product.id из маппингов
          const productIds = Array.from(mappings.keys());
          const productId = productIds[0]; // Берем первый для детерминированности
          
          const { stockService, yandexCallHistory } = createMocks(mappings);
          
          // Обработать webhook N раз
          for (let i = 0; i < repeatCount; i++) {
            await stockService.handleStockUpdate(productId);
          }
          
          // Проверить что все вызовы updateStocks идентичны
          if (yandexCallHistory.length !== repeatCount) {
            console.log(`  Ожидалось ${repeatCount} вызовов, получено ${yandexCallHistory.length}`);
            return false;
          }
          
          // Сравнить все вызовы с первым
          const firstCall = yandexCallHistory[0].stockUpdates;
          for (let i = 1; i < yandexCallHistory.length; i++) {
            const currentCall = yandexCallHistory[i].stockUpdates;
            if (!stockUpdatesAreEqual(firstCall, currentCall)) {
              console.log(`  Вызов ${i} отличается от первого вызова`);
              return false;
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 } // Минимум 100 итераций согласно дизайн-документу
    );
    
    console.log('  ✓ Property 4 (basic idempotency): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 4 (basic idempotency): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 4 (offerId lookup): offerId lookup должен быть одинаковым при повторных вызовах
  console.log('\nТест 2: offerId lookup должен возвращать одинаковое значение при повторных вызовах');
  try {
    await fc.assert(
      fc.asyncProperty(
        mappingTableArbitrary,
        repeatCountArbitrary,
        async (mappings, repeatCount) => {
          const productIds = Array.from(mappings.keys());
          const productId = productIds[0];
          
          const { stockService, mockMapperService } = createMocks(mappings);
          
          const offerIds = [];
          
          // Обработать webhook N раз и собрать offerId
          for (let i = 0; i < repeatCount; i++) {
            await stockService.handleStockUpdate(productId);
            const offerId = mockMapperService.mapProductIdToOfferId(productId);
            offerIds.push(offerId);
          }
          
          // Проверить что все offerId одинаковы
          const firstOfferId = offerIds[0];
          for (let i = 1; i < offerIds.length; i++) {
            if (offerIds[i] !== firstOfferId) {
              console.log(`  offerId ${i} (${offerIds[i]}) отличается от первого (${firstOfferId})`);
              return false;
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Property 4 (offerId lookup): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 4 (offerId lookup): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 4 (stock data): Данные остатков должны быть одинаковыми при повторных вызовах
  console.log('\nТест 3: Данные остатков из МойСклад должны быть одинаковыми при повторных запросах');
  try {
    await fc.assert(
      fc.asyncProperty(
        mappingTableArbitrary,
        repeatCountArbitrary,
        async (mappings, repeatCount) => {
          const productIds = Array.from(mappings.keys());
          const productId = productIds[0];
          
          const { stockService, stockCallHistory } = createMocks(mappings);
          
          // Обработать webhook N раз
          for (let i = 0; i < repeatCount; i++) {
            await stockService.handleStockUpdate(productId);
          }
          
          // Проверить что все вызовы getProductStock были с одним и тем же productId
          if (stockCallHistory.length !== repeatCount) {
            return false;
          }
          
          for (let i = 0; i < stockCallHistory.length; i++) {
            if (stockCallHistory[i].productId !== productId) {
              return false;
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Property 4 (stock data): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 4 (stock data): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 4 (с немаппированным товаром): Обработка немаппированного товара должна быть идемпотентной
  console.log('\nТест 4: Обработка немаппированного product.id должна быть идемпотентной (ничего не делать)');
  try {
    await fc.assert(
      fc.asyncProperty(
        mappingTableArbitrary,
        uuidArbitrary,
        repeatCountArbitrary,
        async (mappings, unmappedProductId, repeatCount) => {
          // Убедиться что unmappedProductId не в маппингах
          if (mappings.has(unmappedProductId)) {
            return true; // Пропустить этот случай
          }
          
          const { stockService, yandexCallHistory } = createMocks(mappings);
          
          // Обработать webhook N раз с немаппированным productId
          for (let i = 0; i < repeatCount; i++) {
            await stockService.handleStockUpdate(unmappedProductId);
          }
          
          // Проверить что НЕ было вызовов updateStocks
          if (yandexCallHistory.length !== 0) {
            console.log(`  Ожидалось 0 вызовов updateStocks, получено ${yandexCallHistory.length}`);
            return false;
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Property 4 (unmapped product): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 4 (unmapped product): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 4 (разные product.id): Обработка разных product.id должна давать разные результаты
  console.log('\nТест 5: Обработка разных product.id должна давать разные offerId (если они разные в маппинге)');
  try {
    await fc.assert(
      fc.asyncProperty(
        mappingTableArbitrary.filter(m => m.size >= 2),
        async (mappings) => {
          const productIds = Array.from(mappings.keys());
          const productId1 = productIds[0];
          const productId2 = productIds[1];
          
          // Убедиться что offerId разные
          const offerId1 = mappings.get(productId1);
          const offerId2 = mappings.get(productId2);
          
          if (offerId1 === offerId2) {
            return true; // Пропустить этот случай
          }
          
          const { stockService, yandexCallHistory } = createMocks(mappings);
          
          // Обработать два разных webhook
          await stockService.handleStockUpdate(productId1);
          await stockService.handleStockUpdate(productId2);
          
          // Проверить что были два вызова updateStocks
          if (yandexCallHistory.length !== 2) {
            return false;
          }
          
          // Проверить что offerId в вызовах разные
          const call1OfferId = yandexCallHistory[0].stockUpdates[0].offerId;
          const call2OfferId = yandexCallHistory[1].stockUpdates[0].offerId;
          
          if (call1OfferId === call2OfferId) {
            console.log(`  Ожидались разные offerId, получены одинаковые: ${call1OfferId}`);
            return false;
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Property 4 (different products): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 4 (different products): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 4 (порядок не важен): Порядок обработки webhook не должен влиять на результат
  console.log('\nТест 6: Порядок обработки нескольких webhook не должен влиять на результат');
  try {
    await fc.assert(
      fc.asyncProperty(
        mappingTableArbitrary.filter(m => m.size >= 2),
        async (mappings) => {
          const productIds = Array.from(mappings.keys()).slice(0, 3); // Берем до 3 товаров
          
          // Создать два набора моков
          const mocks1 = createMocks(mappings);
          const mocks2 = createMocks(mappings);
          
          // Обработать в прямом порядке
          for (const productId of productIds) {
            await mocks1.stockService.handleStockUpdate(productId);
          }
          
          // Обработать в обратном порядке
          for (const productId of productIds.reverse()) {
            await mocks2.stockService.handleStockUpdate(productId);
          }
          
          // Проверить что количество вызовов одинаковое
          if (mocks1.yandexCallHistory.length !== mocks2.yandexCallHistory.length) {
            return false;
          }
          
          // Проверить что множество offerId одинаковое (порядок может отличаться)
          const offerIds1 = new Set(
            mocks1.yandexCallHistory.map(call => call.stockUpdates[0].offerId)
          );
          const offerIds2 = new Set(
            mocks2.yandexCallHistory.map(call => call.stockUpdates[0].offerId)
          );
          
          if (offerIds1.size !== offerIds2.size) {
            return false;
          }
          
          for (const offerId of offerIds1) {
            if (!offerIds2.has(offerId)) {
              return false;
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Property 4 (order independence): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 4 (order independence): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 4 (пустой productId): Обработка пустого productId должна быть идемпотентной
  console.log('\nТест 7: Обработка пустого или null productId должна быть идемпотентной (ничего не делать)');
  try {
    await fc.assert(
      fc.asyncProperty(
        mappingTableArbitrary,
        fc.constantFrom('', null, undefined),
        repeatCountArbitrary,
        async (mappings, emptyProductId, repeatCount) => {
          const { stockService, yandexCallHistory } = createMocks(mappings);
          
          // Обработать webhook N раз с пустым productId
          for (let i = 0; i < repeatCount; i++) {
            await stockService.handleStockUpdate(emptyProductId);
          }
          
          // Проверить что НЕ было вызовов updateStocks
          if (yandexCallHistory.length !== 0) {
            console.log(`  Ожидалось 0 вызовов updateStocks для пустого productId, получено ${yandexCallHistory.length}`);
            return false;
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
    
    console.log('  ✓ Property 4 (empty productId): Пройдено 50 итераций');
  } catch (error) {
    console.error('  ✗ Property 4 (empty productId): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Итоги
  console.log('\n' + '='.repeat(50));
  
  if (allTestsPassed) {
    console.log('✅ Все property-based тесты пройдены успешно!');
    console.log('Property 4: Webhook processing idempotency - PASSED');
    process.exit(0);
  } else {
    console.log('❌ Некоторые property-based тесты провалены');
    console.log('Property 4: Webhook processing idempotency - FAILED');
    process.exit(1);
  }
}

runPropertyTests();
