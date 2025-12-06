/**
 * Property-Based тест для полноты синхронизации остатков
 * 
 * Feature: product-id-mapping-refactor, Property 5: Stock sync completeness
 * Validates: Requirements 5.1, 5.5
 * 
 * Property: Для любого списка product.id из таблицы маппинга, синхронизация остатков
 * должна попытаться обработать все из них и вернуть статистику, где
 * processed + skipped + failed = total
 * 
 * Формально: ∀ productIds: syncStocks().synced + syncStocks().skipped + syncStocks().errors === syncStocks().total
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
const mappingTableArbitrary = fc.array(mappingPairArbitrary, { minLength: 0, maxLength: 30 })
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

// Генератор списка product.id с некоторыми без маппинга
const productIdListWithUnmappedArbitrary = fc.record({
  mappings: mappingTableArbitrary,
  unmappedIds: fc.array(uuidArbitrary, { minLength: 0, maxLength: 10 })
});

// Генератор списка product.id с некоторыми вызывающими ошибки
const productIdListWithErrorsArbitrary = fc.record({
  mappings: mappingTableArbitrary,
  errorIds: fc.array(uuidArbitrary, { minLength: 0, maxLength: 5 })
}).map(({ mappings, errorIds }) => {
  // Добавить errorIds в маппинги с специальным offerId
  const extendedMappings = new Map(mappings);
  for (const errorId of errorIds) {
    if (!extendedMappings.has(errorId)) {
      extendedMappings.set(errorId, `ERROR-${errorId.substring(0, 8)}`);
    }
  }
  return { mappings: extendedMappings, errorIds };
});

/**
 * Создать моки для тестирования
 */
function createMocks(mappings, errorIds = [], unmappedIds = []) {
  const mockMoySkladClient = {
    async getProductStock(productId) {
      if (errorIds.includes(productId)) {
        throw new Error(`МойСклад API error for ${productId}`);
      }
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
    updateCallCount: 0,
    async updateStocks(stockUpdates) {
      this.updateCallCount++;
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
      // Включить как маппированные, так и немаппированные ID
      const allIds = Array.from(this.mappings.keys());
      return [...allIds, ...unmappedIds];
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

  return { stockService, mockMoySkladClient, mockYandexClient, mockMapperService };
}

async function runPropertyTests() {
  console.log('🔬 Property-Based тесты для полноты синхронизации остатков\n');
  console.log('Property 5: Stock sync completeness');
  console.log('Validates: Requirements 5.1, 5.5\n');
  
  let allTestsPassed = true;

  // Property 5: Полнота синхронизации (synced + skipped + errors = total)
  console.log('Тест 1: synced + skipped + errors должно равняться total');
  try {
    await fc.assert(
      fc.asyncProperty(mappingTableArbitrary, async (mappings) => {
        const { stockService } = createMocks(mappings);
        
        const stats = await stockService.syncStocks();
        
        // Проверить что сумма всех категорий равна total
        const sum = stats.synced + stats.skipped + stats.errors;
        
        if (sum !== stats.total) {
          console.log(`  Несоответствие: synced=${stats.synced}, skipped=${stats.skipped}, errors=${stats.errors}, total=${stats.total}, sum=${sum}`);
          return false;
        }
        
        return true;
      }),
      { numRuns: 100 } // Минимум 100 итераций согласно дизайн-документу
    );
    
    console.log('  ✓ Property 5 (completeness): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 5 (completeness): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 5 (с немаппированными товарами): Немаппированные товары должны быть пропущены
  console.log('\nТест 2: Товары без маппинга должны быть учтены в skipped');
  try {
    await fc.assert(
      fc.asyncProperty(productIdListWithUnmappedArbitrary, async ({ mappings, unmappedIds }) => {
        const { stockService } = createMocks(mappings, [], unmappedIds);
        
        const stats = await stockService.syncStocks();
        
        // Проверить что сумма всех категорий равна total
        const sum = stats.synced + stats.skipped + stats.errors;
        if (sum !== stats.total) {
          return false;
        }
        
        // Проверить что количество пропущенных >= количества немаппированных
        if (stats.skipped < unmappedIds.length) {
          return false;
        }
        
        // Проверить что total включает все товары
        const expectedTotal = mappings.size + unmappedIds.length;
        if (stats.total !== expectedTotal) {
          return false;
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Property 5 (with unmapped): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 5 (with unmapped): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 5 (с ошибками): Товары с ошибками должны быть учтены в errors
  console.log('\nТест 3: Товары с ошибками должны быть учтены в errors');
  try {
    await fc.assert(
      fc.asyncProperty(productIdListWithErrorsArbitrary, async ({ mappings, errorIds }) => {
        const { stockService } = createMocks(mappings, errorIds);
        
        const stats = await stockService.syncStocks();
        
        // Проверить что сумма всех категорий равна total
        const sum = stats.synced + stats.skipped + stats.errors;
        if (sum !== stats.total) {
          return false;
        }
        
        // Проверить что количество ошибок >= количества errorIds
        if (stats.errors < errorIds.length) {
          return false;
        }
        
        // Проверить что total соответствует количеству маппингов
        if (stats.total !== mappings.size) {
          return false;
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Property 5 (with errors): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 5 (with errors): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 5 (пустой список): Пустой список должен вернуть нулевую статистику
  console.log('\nТест 4: Пустой список товаров должен вернуть нулевую статистику');
  try {
    await fc.assert(
      fc.asyncProperty(fc.constant(new Map()), async (emptyMappings) => {
        const { stockService } = createMocks(emptyMappings);
        
        const stats = await stockService.syncStocks();
        
        // Проверить что все счетчики равны 0
        if (stats.total !== 0 || stats.synced !== 0 || stats.skipped !== 0 || stats.errors !== 0) {
          return false;
        }
        
        return true;
      }),
      { numRuns: 10 } // Меньше итераций для константного случая
    );
    
    console.log('  ✓ Property 5 (empty list): Пройдено 10 итераций');
  } catch (error) {
    console.error('  ✗ Property 5 (empty list): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 5 (все успешны): Если все товары имеют маппинг и нет ошибок, synced = total
  console.log('\nТест 5: Если все товары имеют маппинг и нет ошибок, synced должно равняться total');
  try {
    await fc.assert(
      fc.asyncProperty(mappingTableArbitrary.filter(m => m.size > 0), async (mappings) => {
        const { stockService } = createMocks(mappings, [], []); // Нет ошибок, нет немаппированных
        
        const stats = await stockService.syncStocks();
        
        // Проверить что все товары синхронизированы
        if (stats.synced !== stats.total) {
          return false;
        }
        
        // Проверить что нет пропущенных и ошибок
        if (stats.skipped !== 0 || stats.errors !== 0) {
          return false;
        }
        
        // Проверить что total соответствует количеству маппингов
        if (stats.total !== mappings.size) {
          return false;
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Property 5 (all successful): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 5 (all successful): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 5 (неотрицательность): Все счетчики должны быть неотрицательными
  console.log('\nТест 6: Все счетчики статистики должны быть неотрицательными');
  try {
    await fc.assert(
      fc.asyncProperty(mappingTableArbitrary, async (mappings) => {
        const { stockService } = createMocks(mappings);
        
        const stats = await stockService.syncStocks();
        
        // Проверить что все счетчики неотрицательны
        if (stats.total < 0 || stats.synced < 0 || stats.skipped < 0 || stats.errors < 0) {
          return false;
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Property 5 (non-negative): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 5 (non-negative): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 5 (ограничения): synced, skipped, errors не должны превышать total
  console.log('\nТест 7: synced, skipped, errors не должны превышать total по отдельности');
  try {
    await fc.assert(
      fc.asyncProperty(mappingTableArbitrary, async (mappings) => {
        const { stockService } = createMocks(mappings);
        
        const stats = await stockService.syncStocks();
        
        // Проверить что каждый счетчик не превышает total
        if (stats.synced > stats.total || stats.skipped > stats.total || stats.errors > stats.total) {
          return false;
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Property 5 (bounds): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 5 (bounds): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Итоги
  console.log('\n' + '='.repeat(50));
  
  if (allTestsPassed) {
    console.log('✅ Все property-based тесты пройдены успешно!');
    console.log('Property 5: Stock sync completeness - PASSED');
    process.exit(0);
  } else {
    console.log('❌ Некоторые property-based тесты провалены');
    console.log('Property 5: Stock sync completeness - FAILED');
    process.exit(1);
  }
}

runPropertyTests();
