/**
 * Тесты устойчивости и логики повторных попыток
 * 
 * Проверяет:
 * - Требование 9.1: Повторные попытки для неудачных API вызовов
 * - Требование 9.2: Изоляция ошибок
 * - Требование 9.4: Множественные сбои не роняют систему
 */

// Установить тестовые переменные окружения перед загрузкой модулей
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign';
process.env.YANDEX_TOKEN = 'test-token';
process.env.MS_TOKEN = 'test-ms-token';
process.env.MS_BASE = 'https://api.moysklad.ru/api/remap/1.2';
process.env.LOG_LEVEL = 'error'; // Минимальное логирование для тестов

const OrderService = require('./src/services/orderService');
const StockService = require('./src/services/stockService');

// Mock клиентов
class MockYandexClient {
  constructor(options = {}) {
    this.failCount = options.failCount || 0;
    this.currentAttempt = 0;
    this.shouldFail = options.shouldFail || false;
  }

  async getOrders(filters) {
    this.currentAttempt++;
    
    if (this.shouldFail || this.currentAttempt <= this.failCount) {
      const error = new Error('API Error');
      error.response = { status: 500 };
      throw error;
    }
    
    return [
      { 
        id: '1', 
        status: filters.status, 
        items: [
          { offerId: 'offer-1', count: 2, price: 1000 }
        ],
        delivery: { address: { country: 'Россия', city: 'Москва' } },
        buyer: { firstName: 'Иван', lastName: 'Иванов' }
      },
      { 
        id: '2', 
        status: filters.status, 
        items: [
          { offerId: 'offer-2', count: 1, price: 2000 }
        ],
        delivery: { address: { country: 'Россия', city: 'Москва' } },
        buyer: { firstName: 'Петр', lastName: 'Петров' }
      }
    ];
  }

  async updateStocks(stockUpdates) {
    this.currentAttempt++;
    
    if (this.shouldFail || this.currentAttempt <= this.failCount) {
      const error = new Error('API Error');
      error.response = { status: 500 };
      throw error;
    }
    
    return { status: 'ok' };
  }
}

class MockMoySkladClient {
  async createCustomerOrder(orderData) {
    return {
      id: 'ms-order-123',
      name: orderData.name
    };
  }

  async getProductStock(productId) {
    return {
      availableStock: 10
    };
  }
}

class MockMapperService {
  constructor() {
    this.orderMappings = new Map();
  }

  mapOfferIdToProductId(offerId) {
    return `product-${offerId}`;
  }

  mapProductIdToOfferId(productId) {
    return `offer-${productId}`;
  }

  async saveOrderMapping(m2OrderId, moySkladOrderId) {
    this.orderMappings.set(m2OrderId, moySkladOrderId);
  }

  async getMoySkladOrderId(m2OrderId) {
    return this.orderMappings.get(m2OrderId);
  }

  getAllProductIds() {
    return ['product-1', 'product-2', 'product-3'];
  }
}

// Тесты
async function testRetryOnFailedPolling() {
  console.log('\n=== Тест 1: Повторные попытки при неудачном polling (Требование 9.1) ===');
  
  try {
    // Создать клиент который упадет 2 раза, затем успешно выполнится
    const yandexClient = new MockYandexClient({ failCount: 2 });
    const moySkladClient = new MockMoySkladClient();
    const mapperService = new MockMapperService();
    
    const orderService = new OrderService(yandexClient, moySkladClient, mapperService);
    
    console.log('Запуск polling с retry логикой...');
    const result = await orderService.pollAndProcessOrders();
    
    console.log('Результат:', result);
    console.log(`✓ Polling успешно выполнен после ${yandexClient.currentAttempt} попыток`);
    console.log(`✓ Обработано заказов: ${result.processed}`);
    
    if (yandexClient.currentAttempt === 3) {
      console.log('✓ ТЕСТ ПРОЙДЕН: Retry логика работает корректно');
      return true;
    } else {
      console.log('✗ ТЕСТ НЕ ПРОЙДЕН: Неправильное количество попыток');
      return false;
    }
  } catch (error) {
    console.log('✗ ТЕСТ НЕ ПРОЙДЕН:', error.message);
    return false;
  }
}

async function testErrorIsolation() {
  console.log('\n=== Тест 2: Изоляция ошибок (Требование 9.2) ===');
  
  try {
    const yandexClient = new MockYandexClient();
    const moySkladClient = new MockMoySkladClient();
    const mapperService = new MockMapperService();
    
    const orderService = new OrderService(yandexClient, moySkladClient, mapperService);
    
    // Переопределить createMoySkladOrder чтобы первый заказ упал
    let callCount = 0;
    const originalCreate = orderService.createMoySkladOrder.bind(orderService);
    orderService.createMoySkladOrder = async function(order) {
      callCount++;
      if (callCount === 1) {
        throw new Error('Ошибка обработки первого заказа');
      }
      return originalCreate(order);
    };
    
    console.log('Запуск polling с ошибкой в первом заказе...');
    const result = await orderService.pollAndProcessOrders();
    
    console.log('Результат:', result);
    console.log(`✓ Обработано заказов: ${result.processed}`);
    console.log(`✓ Успешных: ${result.successful}`);
    console.log(`✓ Неудачных: ${result.failed}`);
    
    if (result.processed === 2 && result.successful === 1 && result.failed === 1) {
      console.log('✓ ТЕСТ ПРОЙДЕН: Ошибка изолирована, другие заказы обработаны');
      return true;
    } else {
      console.log('✗ ТЕСТ НЕ ПРОЙДЕН: Неправильная изоляция ошибок');
      return false;
    }
  } catch (error) {
    console.log('✗ ТЕСТ НЕ ПРОЙДЕН:', error.message);
    return false;
  }
}

async function testMultipleFailuresDontCrash() {
  console.log('\n=== Тест 3: Множественные сбои не роняют систему (Требование 9.4) ===');
  
  try {
    // Создать клиент который всегда падает
    const yandexClient = new MockYandexClient({ shouldFail: true });
    const moySkladClient = new MockMoySkladClient();
    const mapperService = new MockMapperService();
    
    const orderService = new OrderService(yandexClient, moySkladClient, mapperService);
    
    console.log('Запуск polling с постоянными ошибками...');
    const result = await orderService.pollAndProcessOrders();
    
    console.log('Результат:', result);
    console.log('✓ Система не упала при множественных сбоях');
    console.log(`✓ Возвращен результат с ошибками: ${result.errors.length}`);
    
    if (result.errors.length > 0) {
      console.log('✓ ТЕСТ ПРОЙДЕН: Система устойчива к множественным сбоям');
      return true;
    } else {
      console.log('✗ ТЕСТ НЕ ПРОЙДЕН: Ошибки не зарегистрированы');
      return false;
    }
  } catch (error) {
    console.log('✗ ТЕСТ НЕ ПРОЙДЕН: Система упала:', error.message);
    return false;
  }
}

async function testStockSyncResilience() {
  console.log('\n=== Тест 4: Устойчивость синхронизации остатков (Требование 9.2, 9.4) ===');
  
  try {
    const yandexClient = new MockYandexClient();
    const moySkladClient = new MockMoySkladClient();
    const mapperService = new MockMapperService();
    
    const stockService = new StockService(moySkladClient, yandexClient, mapperService);
    
    // Переопределить updateM2Stock чтобы второй товар упал
    let callCount = 0;
    const originalUpdate = stockService.updateM2Stock.bind(stockService);
    stockService.updateM2Stock = async function(offerId, stock) {
      callCount++;
      if (callCount === 2) {
        throw new Error('Ошибка обновления второго товара');
      }
      return originalUpdate(offerId, stock);
    };
    
    console.log('Запуск синхронизации остатков с ошибкой во втором товаре...');
    const result = await stockService.syncStocks();
    
    console.log('Результат:', result);
    console.log(`✓ Всего товаров: ${result.total}`);
    console.log(`✓ Синхронизировано: ${result.synced}`);
    console.log(`✓ Ошибок: ${result.errors}`);
    
    if (result.total === 3 && result.synced === 2 && result.errors === 1) {
      console.log('✓ ТЕСТ ПРОЙДЕН: Ошибка изолирована, другие товары синхронизированы');
      return true;
    } else {
      console.log('✗ ТЕСТ НЕ ПРОЙДЕН: Неправильная обработка ошибок');
      return false;
    }
  } catch (error) {
    console.log('✗ ТЕСТ НЕ ПРОЙДЕН:', error.message);
    return false;
  }
}

async function testStockUpdateRetry() {
  console.log('\n=== Тест 5: Повторные попытки обновления остатков (Требование 9.1) ===');
  
  try {
    // Создать клиент который упадет 2 раза, затем успешно выполнится
    const yandexClient = new MockYandexClient({ failCount: 2 });
    const moySkladClient = new MockMoySkladClient();
    const mapperService = new MockMapperService();
    
    const stockService = new StockService(moySkladClient, yandexClient, mapperService);
    
    console.log('Обновление остатка с retry логикой...');
    await stockService.updateM2Stock('offer-123', 10);
    
    console.log(`✓ Остаток обновлен после ${yandexClient.currentAttempt} попыток`);
    
    if (yandexClient.currentAttempt === 3) {
      console.log('✓ ТЕСТ ПРОЙДЕН: Retry логика для остатков работает корректно');
      return true;
    } else {
      console.log('✗ ТЕСТ НЕ ПРОЙДЕН: Неправильное количество попыток');
      return false;
    }
  } catch (error) {
    console.log('✗ ТЕСТ НЕ ПРОЙДЕН:', error.message);
    return false;
  }
}

async function testExponentialBackoff() {
  console.log('\n=== Тест 6: Экспоненциальная задержка (быстрая проверка) ===');
  
  try {
    // Используем меньше попыток для быстрого теста
    const yandexClient = new MockYandexClient({ failCount: 1 });
    const moySkladClient = new MockMoySkladClient();
    const mapperService = new MockMapperService();
    
    const orderService = new OrderService(yandexClient, moySkladClient, mapperService);
    
    console.log('Запуск polling с измерением задержек...');
    const startTime = Date.now();
    await orderService.pollAndProcessOrders();
    const duration = Date.now() - startTime;
    
    // Ожидаемая задержка: 2000ms (одна retry попытка)
    console.log(`✓ Общее время выполнения: ${duration}ms`);
    
    if (duration >= 2000 && duration < 5000) {
      console.log('✓ ТЕСТ ПРОЙДЕН: Экспоненциальная задержка работает');
      return true;
    } else {
      console.log('✗ ТЕСТ НЕ ПРОЙДЕН: Задержка не соответствует ожидаемой');
      return false;
    }
  } catch (error) {
    console.log('✗ ТЕСТ НЕ ПРОЙДЕН:', error.message);
    return false;
  }
}

// Запуск всех тестов
async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Тесты устойчивости и логики повторных попыток                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  const results = [];
  
  results.push(await testRetryOnFailedPolling());
  results.push(await testErrorIsolation());
  results.push(await testMultipleFailuresDontCrash());
  results.push(await testStockSyncResilience());
  results.push(await testStockUpdateRetry());
  results.push(await testExponentialBackoff());
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Результаты тестов                                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\nПройдено: ${passed}/${total}`);
  
  if (passed === total) {
    console.log('\n✓ ВСЕ ТЕСТЫ ПРОЙДЕНЫ');
    console.log('\nУстойчивость системы подтверждена:');
    console.log('  ✓ Требование 9.1: Повторные попытки для неудачных API вызовов');
    console.log('  ✓ Требование 9.2: Изоляция ошибок');
    console.log('  ✓ Требование 9.4: Множественные сбои не роняют систему');
  } else {
    console.log('\n✗ НЕКОТОРЫЕ ТЕСТЫ НЕ ПРОЙДЕНЫ');
    process.exit(1);
  }
}

// Запуск
runAllTests().catch(error => {
  console.error('Критическая ошибка при выполнении тестов:', error);
  process.exit(1);
});
