/**
 * Unit тесты для StockService
 * Проверяет: Требования 5.1, 5.2, 5.3, 5.4
 */

// Установить переменные окружения перед загрузкой модулей
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign';
process.env.YANDEX_TOKEN = 'test-token';
process.env.MS_TOKEN = 'test-ms-token';
process.env.LOG_LEVEL = 'error';

const assert = require('assert');
const StockService = require('./src/services/stockService');

// Функция для создания моков
function createMocks() {
  const mockMoySkladClient = {
    async getProductStock(productId) {
      if (productId === 'error-product-id') {
        throw new Error('МойСклад API error');
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
    lastStockUpdate: null,
    shouldFail: false,
    async updateStocks(stockUpdates) {
      if (this.shouldFail) {
        const error = new Error('Yandex API error');
        error.response = { status: 500 };
        throw error;
      }
      this.lastStockUpdate = stockUpdates;
      return { status: 'OK' };
    }
  };

  const mockMapperService = {
    mappings: new Map([
      ['product-id-001', 'OFFER001'],
      ['product-id-002', 'OFFER002'],
      ['product-id-003', 'OFFER003']
    ]),
    
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

  return { stockService, mockMoySkladClient, mockYandexClient, mockMapperService };
}

async function runTests() {
  console.log('🧪 Unit тесты для StockService\n');
  
  let testsPassed = 0;
  let testsFailed = 0;

  function testResult(testName, passed, error = null) {
    if (passed) {
      console.log(`  ✓ ${testName}`);
      testsPassed++;
    } else {
      console.log(`  ✗ ${testName}`);
      if (error) console.log(`    Ошибка: ${error.message}`);
      testsFailed++;
    }
  }

  // ============================================================================
  // Тест синхронизации остатков с product.id (Требование 5.1)
  // ============================================================================
  
  console.log('📋 Тест синхронизации остатков с product.id (Требование 5.1)\n');
  
  // Тест 1.1: должен синхронизировать все товары из маппинга
  try {
    const { stockService } = createMocks();
    const stats = await stockService.syncStocks();
    
    assert.strictEqual(stats.total, 3, 'Должно быть 3 товара');
    assert.strictEqual(stats.synced, 3, 'Все 3 товара должны быть синхронизированы');
    assert.strictEqual(stats.skipped, 0, 'Не должно быть пропущенных товаров');
    assert.strictEqual(stats.errors, 0, 'Не должно быть ошибок');
    
    testResult('должен синхронизировать все товары из маппинга', true);
  } catch (error) {
    testResult('должен синхронизировать все товары из маппинга', false, error);
  }

  // Тест 1.2: должен получать product.id из маппинга
  try {
    const { stockService, mockMapperService } = createMocks();
    let getAllProductIdsCalled = false;
    const originalGetAll = mockMapperService.getAllProductIds.bind(mockMapperService);
    mockMapperService.getAllProductIds = function() {
      getAllProductIdsCalled = true;
      return originalGetAll();
    };

    await stockService.syncStocks();
    
    assert.strictEqual(getAllProductIdsCalled, true, 'getAllProductIds должен быть вызван');
    testResult('должен получать product.id из маппинга', true);
  } catch (error) {
    testResult('должен получать product.id из маппинга', false, error);
  }

  // Тест 1.3: должен преобразовывать product.id в offerId для каждого товара
  try {
    const { stockService, mockMapperService } = createMocks();
    const mapCalls = [];
    const originalMap = mockMapperService.mapProductIdToOfferId.bind(mockMapperService);
    mockMapperService.mapProductIdToOfferId = function(productId) {
      mapCalls.push(productId);
      return originalMap(productId);
    };

    await stockService.syncStocks();
    
    assert.strictEqual(mapCalls.length, 3, 'mapProductIdToOfferId должен быть вызван 3 раза');
    assert.ok(mapCalls.includes('product-id-001'), 'Должен маппить product-id-001');
    assert.ok(mapCalls.includes('product-id-002'), 'Должен маппить product-id-002');
    assert.ok(mapCalls.includes('product-id-003'), 'Должен маппить product-id-003');
    
    testResult('должен преобразовывать product.id в offerId для каждого товара', true);
  } catch (error) {
    testResult('должен преобразовывать product.id в offerId для каждого товара', false, error);
  }

  // Тест 1.4: должен получать остатки из МойСклад по product.id
  try {
    const { stockService, mockMoySkladClient } = createMocks();
    const getStockCalls = [];
    const originalGetStock = mockMoySkladClient.getProductStock.bind(mockMoySkladClient);
    mockMoySkladClient.getProductStock = async function(productId) {
      getStockCalls.push(productId);
      return originalGetStock(productId);
    };

    await stockService.syncStocks();
    
    assert.strictEqual(getStockCalls.length, 3, 'getProductStock должен быть вызван 3 раза');
    assert.ok(getStockCalls.includes('product-id-001'), 'Должен получить остатки для product-id-001');
    
    testResult('должен получать остатки из МойСклад по product.id', true);
  } catch (error) {
    testResult('должен получать остатки из МойСклад по product.id', false, error);
  }

  // Тест 1.5: должен отправлять обновления в M2 с offerId
  try {
    const { stockService, mockYandexClient } = createMocks();
    await stockService.syncStocks();
    
    assert.ok(mockYandexClient.lastStockUpdate, 'Должен быть вызван updateStocks');
    assert.strictEqual(mockYandexClient.lastStockUpdate.length, 1, 'Должен быть 1 товар в последнем обновлении');
    assert.strictEqual(mockYandexClient.lastStockUpdate[0].offerId, 'OFFER003', 'Должен использовать offerId');
    assert.strictEqual(mockYandexClient.lastStockUpdate[0].count, 20, 'Должен передать availableStock');
    
    testResult('должен отправлять обновления в M2 с offerId', true);
  } catch (error) {
    testResult('должен отправлять обновления в M2 с offerId', false, error);
  }

  // Тест 1.6: должен возвращать корректную статистику
  try {
    const { stockService } = createMocks();
    const stats = await stockService.syncStocks();
    
    assert.ok(stats.hasOwnProperty('total'), 'Статистика должна содержать total');
    assert.ok(stats.hasOwnProperty('synced'), 'Статистика должна содержать synced');
    assert.ok(stats.hasOwnProperty('skipped'), 'Статистика должна содержать skipped');
    assert.ok(stats.hasOwnProperty('errors'), 'Статистика должна содержать errors');
    
    testResult('должен возвращать корректную статистику', true);
  } catch (error) {
    testResult('должен возвращать корректную статистику', false, error);
  }

  // ============================================================================
  // Тест обработки webhook с product.id (Требование 5.2)
  // ============================================================================
  
  console.log('\n📋 Тест обработки webhook с product.id (Требование 5.2)\n');

  // Тест 2.1: должен обработать webhook с валидным product.id
  try {
    const { stockService, mockYandexClient } = createMocks();
    await stockService.handleStockUpdate('product-id-001');
    
    assert.ok(mockYandexClient.lastStockUpdate, 'Должен быть вызван updateStocks');
    assert.strictEqual(mockYandexClient.lastStockUpdate[0].offerId, 'OFFER001', 'Должен использовать правильный offerId');
    assert.strictEqual(mockYandexClient.lastStockUpdate[0].count, 20, 'Должен передать availableStock');
    
    testResult('должен обработать webhook с валидным product.id', true);
  } catch (error) {
    testResult('должен обработать webhook с валидным product.id', false, error);
  }

  // Тест 2.2: должен извлечь product.id и найти соответствующий offerId
  try {
    const { stockService, mockMapperService } = createMocks();
    const mapCalls = [];
    const originalMap = mockMapperService.mapProductIdToOfferId.bind(mockMapperService);
    mockMapperService.mapProductIdToOfferId = function(productId) {
      mapCalls.push(productId);
      return originalMap(productId);
    };

    await stockService.handleStockUpdate('product-id-002');
    
    assert.strictEqual(mapCalls.length, 1, 'mapProductIdToOfferId должен быть вызван');
    assert.strictEqual(mapCalls[0], 'product-id-002', 'Должен маппить правильный product.id');
    
    testResult('должен извлечь product.id и найти соответствующий offerId', true);
  } catch (error) {
    testResult('должен извлечь product.id и найти соответствующий offerId', false, error);
  }

  // Тест 2.3: должен получить остатки из МойСклад по product.id
  try {
    const { stockService, mockMoySkladClient } = createMocks();
    const getStockCalls = [];
    const originalGetStock = mockMoySkladClient.getProductStock.bind(mockMoySkladClient);
    mockMoySkladClient.getProductStock = async function(productId) {
      getStockCalls.push(productId);
      return originalGetStock(productId);
    };

    await stockService.handleStockUpdate('product-id-001');
    
    assert.strictEqual(getStockCalls.length, 1, 'getProductStock должен быть вызван');
    assert.strictEqual(getStockCalls[0], 'product-id-001', 'Должен получить остатки для правильного product.id');
    
    testResult('должен получить остатки из МойСклад по product.id', true);
  } catch (error) {
    testResult('должен получить остатки из МойСклад по product.id', false, error);
  }

  // Тест 2.4: должен обновить остатки в M2 с offerId
  try {
    const { stockService, mockYandexClient } = createMocks();
    await stockService.handleStockUpdate('product-id-003');
    
    assert.ok(mockYandexClient.lastStockUpdate, 'Должен быть вызван updateStocks');
    assert.strictEqual(mockYandexClient.lastStockUpdate[0].offerId, 'OFFER003', 'Должен использовать offerId из маппинга');
    
    testResult('должен обновить остатки в M2 с offerId', true);
  } catch (error) {
    testResult('должен обновить остатки в M2 с offerId', false, error);
  }

  // Тест 2.5: не должен выбрасывать ошибку при обработке webhook
  try {
    const { stockService, mockMoySkladClient } = createMocks();
    mockMoySkladClient.getProductStock = async () => {
      throw new Error('API error');
    };

    // Не должно быть исключения
    await stockService.handleStockUpdate('product-id-001');
    
    testResult('не должен выбрасывать ошибку при обработке webhook', true);
  } catch (error) {
    testResult('не должен выбрасывать ошибку при обработке webhook', false, error);
  }

  // ============================================================================
  // Тест обработки товаров без маппинга (Требование 5.3)
  // ============================================================================
  
  console.log('\n📋 Тест обработки товаров без маппинга (Требование 5.3)\n');

  // Тест 3.1: должен пропустить товар без маппинга в handleStockUpdate
  try {
    const { stockService, mockYandexClient } = createMocks();
    const updatesBefore = mockYandexClient.lastStockUpdate;
    
    await stockService.handleStockUpdate('non-existent-product-id');
    
    assert.strictEqual(mockYandexClient.lastStockUpdate, updatesBefore, 
      'updateStocks не должен быть вызван для товара без маппинга');
    
    testResult('должен пропустить товар без маппинга в handleStockUpdate', true);
  } catch (error) {
    testResult('должен пропустить товар без маппинга в handleStockUpdate', false, error);
  }

  // Тест 3.2: должен пропустить товар с пустым product.id
  try {
    const { stockService, mockYandexClient } = createMocks();
    const updatesBefore = mockYandexClient.lastStockUpdate;
    
    await stockService.handleStockUpdate(null);
    await stockService.handleStockUpdate('');
    await stockService.handleStockUpdate(undefined);
    
    assert.strictEqual(mockYandexClient.lastStockUpdate, updatesBefore,
      'updateStocks не должен быть вызван для пустого product.id');
    
    testResult('должен пропустить товар с пустым product.id', true);
  } catch (error) {
    testResult('должен пропустить товар с пустым product.id', false, error);
  }

  // Тест 3.3: должен увеличить счетчик пропущенных товаров в syncStocks
  try {
    const { stockService, mockMapperService } = createMocks();
    mockMapperService.getAllProductIds = () => [
      'product-id-001',
      'product-id-002',
      'no-mapping-id-1',
      'no-mapping-id-2'
    ];

    const stats = await stockService.syncStocks();
    
    assert.strictEqual(stats.total, 4, 'Должно быть 4 товара');
    assert.strictEqual(stats.synced, 2, 'Должно быть синхронизировано 2 товара');
    assert.strictEqual(stats.skipped, 2, 'Должно быть пропущено 2 товара без маппинга');
    assert.strictEqual(stats.errors, 0, 'Не должно быть ошибок');
    
    testResult('должен увеличить счетчик пропущенных товаров в syncStocks', true);
  } catch (error) {
    testResult('должен увеличить счетчик пропущенных товаров в syncStocks', false, error);
  }

  // Тест 3.4: должен продолжить обработку других товаров после пропуска
  try {
    const { stockService, mockMapperService } = createMocks();
    mockMapperService.getAllProductIds = () => [
      'no-mapping-id',
      'product-id-001',
      'another-no-mapping-id',
      'product-id-002'
    ];

    const stats = await stockService.syncStocks();
    
    assert.strictEqual(stats.synced, 2, 'Должно быть синхронизировано 2 товара с маппингом');
    assert.strictEqual(stats.skipped, 2, 'Должно быть пропущено 2 товара без маппинга');
    
    testResult('должен продолжить обработку других товаров после пропуска', true);
  } catch (error) {
    testResult('должен продолжить обработку других товаров после пропуска', false, error);
  }

  // ============================================================================
  // Тест batch обработки остатков (Требование 5.4)
  // ============================================================================
  
  console.log('\n📋 Тест batch обработки остатков (Требование 5.4)\n');

  // Тест 4.1: должен обработать несколько товаров последовательно
  try {
    const { stockService, mockMoySkladClient } = createMocks();
    const processedProducts = [];
    const originalGetStock = mockMoySkladClient.getProductStock.bind(mockMoySkladClient);
    mockMoySkladClient.getProductStock = async function(productId) {
      processedProducts.push(productId);
      return originalGetStock(productId);
    };

    await stockService.syncStocks();
    
    assert.strictEqual(processedProducts.length, 3, 'Должно быть обработано 3 товара');
    assert.ok(processedProducts.includes('product-id-001'), 'Должен обработать product-id-001');
    assert.ok(processedProducts.includes('product-id-002'), 'Должен обработать product-id-002');
    assert.ok(processedProducts.includes('product-id-003'), 'Должен обработать product-id-003');
    
    testResult('должен обработать несколько товаров последовательно', true);
  } catch (error) {
    testResult('должен обработать несколько товаров последовательно', false, error);
  }

  // Тест 4.2: должен изолировать ошибки между товарами
  try {
    const { stockService, mockMapperService } = createMocks();
    // Добавляем маппинг для error-product-id, чтобы он не был пропущен
    mockMapperService.mappings.set('error-product-id', 'ERROR-OFFER');
    mockMapperService.getAllProductIds = () => [
      'product-id-001',
      'error-product-id',
      'product-id-002'
    ];

    const stats = await stockService.syncStocks();
    
    assert.strictEqual(stats.total, 3, 'Должно быть 3 товара');
    assert.strictEqual(stats.synced, 2, 'Должно быть синхронизировано 2 товара');
    assert.strictEqual(stats.errors, 1, 'Должна быть 1 ошибка');
    
    testResult('должен изолировать ошибки между товарами', true);
  } catch (error) {
    testResult('должен изолировать ошибки между товарами', false, error);
  }

  // Тест 4.3: должен продолжить обработку после ошибки в одном товаре
  try {
    const { stockService, mockMoySkladClient, mockMapperService } = createMocks();
    const processedProducts = [];
    const originalGetStock = mockMoySkladClient.getProductStock.bind(mockMoySkladClient);
    mockMoySkladClient.getProductStock = async function(productId) {
      processedProducts.push(productId);
      if (productId === 'product-id-002') {
        throw new Error('API error for product-id-002');
      }
      return originalGetStock(productId);
    };

    mockMapperService.getAllProductIds = () => [
      'product-id-001',
      'product-id-002',
      'product-id-003'
    ];

    const stats = await stockService.syncStocks();
    
    assert.strictEqual(processedProducts.length, 3, 'Должно быть 3 попытки обработки');
    assert.strictEqual(stats.synced, 2, 'Должно быть синхронизировано 2 товара');
    assert.strictEqual(stats.errors, 1, 'Должна быть 1 ошибка');
    
    testResult('должен продолжить обработку после ошибки в одном товаре', true);
  } catch (error) {
    testResult('должен продолжить обработку после ошибки в одном товаре', false, error);
  }

  // Тест 4.4: должен обрабатывать большое количество товаров
  try {
    const { stockService, mockMapperService } = createMocks();
    const largeProductList = [];
    const largeMappings = new Map();
    
    for (let i = 1; i <= 50; i++) {
      const productId = `product-id-${String(i).padStart(3, '0')}`;
      const offerId = `OFFER${String(i).padStart(3, '0')}`;
      largeProductList.push(productId);
      largeMappings.set(productId, offerId);
    }

    mockMapperService.mappings = largeMappings;
    mockMapperService.getAllProductIds = () => largeProductList;

    const stats = await stockService.syncStocks();
    
    assert.strictEqual(stats.total, 50, 'Должно быть 50 товаров');
    assert.strictEqual(stats.synced, 50, 'Все 50 товаров должны быть синхронизированы');
    
    testResult('должен обрабатывать большое количество товаров', true);
  } catch (error) {
    testResult('должен обрабатывать большое количество товаров', false, error);
  }

  // Тест 4.5: должен корректно обрабатывать смешанный batch
  try {
    const { stockService, mockMapperService } = createMocks();
    // Добавляем маппинг для error-product-id, чтобы он не был пропущен
    mockMapperService.mappings.set('error-product-id', 'ERROR-OFFER');
    mockMapperService.getAllProductIds = () => [
      'product-id-001',      // успех
      'no-mapping-id',       // пропуск
      'error-product-id',    // ошибка
      'product-id-002',      // успех
      'another-no-mapping',  // пропуск
      'product-id-003'       // успех
    ];

    const stats = await stockService.syncStocks();
    
    assert.strictEqual(stats.total, 6, 'Должно быть 6 товаров');
    assert.strictEqual(stats.synced, 3, 'Должно быть синхронизировано 3 товара');
    assert.strictEqual(stats.skipped, 2, 'Должно быть пропущено 2 товара');
    assert.strictEqual(stats.errors, 1, 'Должна быть 1 ошибка');
    
    testResult('должен корректно обрабатывать смешанный batch', true);
  } catch (error) {
    testResult('должен корректно обрабатывать смешанный batch', false, error);
  }

  // Тест 4.6: должен обновлять остатки в M2 для каждого товара отдельно
  try {
    const { stockService, mockYandexClient } = createMocks();
    const updateCalls = [];
    const originalUpdate = mockYandexClient.updateStocks.bind(mockYandexClient);
    mockYandexClient.updateStocks = async function(stockUpdates) {
      updateCalls.push(stockUpdates);
      return originalUpdate(stockUpdates);
    };

    await stockService.syncStocks();
    
    assert.strictEqual(updateCalls.length, 3, 'Должно быть 3 вызова updateStocks');
    
    updateCalls.forEach((call, index) => {
      assert.strictEqual(call.length, 1, `Вызов ${index + 1} должен содержать 1 товар`);
    });
    
    testResult('должен обновлять остатки в M2 для каждого товара отдельно', true);
  } catch (error) {
    testResult('должен обновлять остатки в M2 для каждого товара отдельно', false, error);
  }

  // ============================================================================
  // Дополнительные тесты для полноты покрытия
  // ============================================================================
  
  console.log('\n📋 Дополнительные тесты\n');

  // Тест 5.1: должен корректно обрабатывать пустой список товаров
  try {
    const { stockService, mockMapperService } = createMocks();
    mockMapperService.getAllProductIds = () => [];

    const stats = await stockService.syncStocks();
    
    assert.strictEqual(stats.total, 0, 'Должно быть 0 товаров');
    assert.strictEqual(stats.synced, 0, 'Должно быть синхронизировано 0 товаров');
    
    testResult('должен корректно обрабатывать пустой список товаров', true);
  } catch (error) {
    testResult('должен корректно обрабатывать пустой список товаров', false, error);
  }

  // Тест 5.2: должен использовать retry механизм при временных ошибках
  try {
    const { stockService, mockYandexClient } = createMocks();
    let attemptCount = 0;
    mockYandexClient.updateStocks = async function() {
      attemptCount++;
      if (attemptCount < 2) {
        const error = new Error('Temporary error');
        error.response = { status: 500 };
        throw error;
      }
      return { status: 'OK' };
    };

    await stockService.updateM2Stock('OFFER001', 10);
    
    assert.strictEqual(attemptCount, 2, 'Должно быть 2 попытки (1 ошибка + 1 успех)');
    
    testResult('должен использовать retry механизм при временных ошибках', true);
  } catch (error) {
    testResult('должен использовать retry механизм при временных ошибках', false, error);
  }

  // Тест 5.3: должен валидировать параметры updateM2Stock
  try {
    const { stockService } = createMocks();
    
    // Тест null offerId
    try {
      await stockService.updateM2Stock(null, 10);
      throw new Error('Должна была быть ошибка для null offerId');
    } catch (error) {
      assert.ok(error.message.includes('offerId обязателен'), 'Должна быть ошибка для null offerId');
    }

    // Тест отрицательного остатка
    try {
      await stockService.updateM2Stock('OFFER001', -5);
      throw new Error('Должна была быть ошибка для отрицательного остатка');
    } catch (error) {
      assert.ok(error.message.includes('Некорректное значение остатка'), 'Должна быть ошибка для отрицательного остатка');
    }

    // Тест нечислового остатка
    try {
      await stockService.updateM2Stock('OFFER001', 'invalid');
      throw new Error('Должна была быть ошибка для нечислового остатка');
    } catch (error) {
      assert.ok(error.message.includes('Некорректное значение остатка'), 'Должна быть ошибка для нечислового остатка');
    }
    
    testResult('должен валидировать параметры updateM2Stock', true);
  } catch (error) {
    testResult('должен валидировать параметры updateM2Stock', false, error);
  }

  // ============================================================================
  // Итоги
  // ============================================================================
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Результаты тестирования:`);
  console.log(`   ✓ Пройдено: ${testsPassed}`);
  console.log(`   ✗ Провалено: ${testsFailed}`);
  console.log(`   Всего: ${testsPassed + testsFailed}\n`);
  
  if (testsFailed > 0) {
    console.log('❌ Некоторые тесты провалились!\n');
    process.exit(1);
  } else {
    console.log('✅ Все тесты пройдены успешно!\n');
    process.exit(0);
  }
}

// Запуск тестов
runTests().catch(error => {
  console.error('\n❌ Критическая ошибка при выполнении тестов:', error);
  console.error(error.stack);
  process.exit(1);
});
