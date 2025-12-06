/**
 * Простой тест для проверки StockService
 */

// Установить переменные окружения перед загрузкой модулей
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign';
process.env.YANDEX_TOKEN = 'test-token';
process.env.MS_TOKEN = 'test-ms-token';
process.env.LOG_LEVEL = 'error'; // Минимизировать вывод логов

const StockService = require('./src/services/stockService');

// Мок для MoySkladClient
class MockMoySkladClient {
  async getProductStock(productId) {
    // Симулируем ответ от МойСклад с остатками по складам
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
}

// Мок для YandexClient
class MockYandexClient {
  constructor() {
    this.lastStockUpdate = null;
  }

  async updateStocks(stockUpdates) {
    this.lastStockUpdate = stockUpdates;
    return { status: 'OK' };
  }
}

// Мок для MapperService
class MockMapperService {
  constructor() {
    // Маппинг product.id -> offerId
    this.mappings = new Map([
      ['product-id-001', 'OFFER001'],
      ['product-id-002', 'OFFER002'],
      ['product-id-003', 'OFFER003']
    ]);
  }

  mapProductIdToOfferId(productId) {
    return this.mappings.get(productId) || null;
  }

  mapOfferIdToProductId(offerId) {
    for (const [pid, oid] of this.mappings.entries()) {
      if (oid === offerId) return pid;
    }
    return null;
  }

  getAllProductIds() {
    return Array.from(this.mappings.keys());
  }

  getAllOfferIds() {
    return Array.from(this.mappings.values());
  }
}

async function runTests() {
  console.log('🧪 Тестирование StockService...\n');

  const mockMoySkladClient = new MockMoySkladClient();
  const mockYandexClient = new MockYandexClient();
  const mockMapperService = new MockMapperService();

  const stockService = new StockService(
    mockMoySkladClient,
    mockYandexClient,
    mockMapperService
  );

  try {
    // Тест 1: Обновление остатка одного товара в M2
    console.log('✓ Тест 1: Обновление остатка одного товара в M2');
    await stockService.updateM2Stock('OFFER001', 15);
    console.log('  Остаток обновлен');
    console.assert(mockYandexClient.lastStockUpdate !== null, 'Должен быть вызван updateStocks');
    console.assert(mockYandexClient.lastStockUpdate.length === 1, 'Должен быть 1 товар');
    console.assert(mockYandexClient.lastStockUpdate[0].offerId === 'OFFER001', 'offerId должен совпадать');
    console.assert(mockYandexClient.lastStockUpdate[0].count === 15, 'Количество должно быть 15');

    // Тест 2: Валидация параметров updateM2Stock
    console.log('\n✓ Тест 2: Валидация параметров updateM2Stock');
    try {
      await stockService.updateM2Stock(null, 10);
      console.error('  ❌ Должна была быть выброшена ошибка для null offerId');
      process.exit(1);
    } catch (error) {
      console.log('  ✓ Ошибка корректно выброшена для null offerId');
    }

    try {
      await stockService.updateM2Stock('OFFER001', -5);
      console.error('  ❌ Должна была быть выброшена ошибка для отрицательного остатка');
      process.exit(1);
    } catch (error) {
      console.log('  ✓ Ошибка корректно выброшена для отрицательного остатка');
    }

    // Тест 3: Полная синхронизация всех остатков
    console.log('\n✓ Тест 3: Полная синхронизация всех остатков');
    const stats = await stockService.syncStocks();
    console.log(`  Всего товаров: ${stats.total}`);
    console.log(`  Синхронизировано: ${stats.synced}`);
    console.log(`  Пропущено: ${stats.skipped}`);
    console.log(`  Ошибок: ${stats.errors}`);
    console.assert(stats.total === 3, 'Должно быть 3 товара');
    console.assert(stats.synced === 3, 'Должно быть синхронизировано 3 товара');

    // Тест 4: Обработка обновления остатков по product.id
    console.log('\n✓ Тест 4: Обработка обновления остатков по product.id');
    await stockService.handleStockUpdate('product-id-001');
    console.log('  Обновление обработано');
    console.assert(mockYandexClient.lastStockUpdate !== null, 'Должен быть вызван updateStocks');
    console.assert(mockYandexClient.lastStockUpdate[0].offerId === 'OFFER001', 'offerId должен совпадать');
    console.assert(mockYandexClient.lastStockUpdate[0].count === 20, 'Доступный остаток должен быть 20');

    // Тест 5: Обработка обновления с несуществующим product.id
    console.log('\n✓ Тест 5: Обработка обновления с несуществующим product.id');
    await stockService.handleStockUpdate('non-existent-product-id');
    console.log('  Обновление с несуществующим product.id обработано (должно быть пропущено)');

    // Тест 6: Обработка обновления с пустым product.id
    console.log('\n✓ Тест 6: Обработка обновления с пустым product.id');
    await stockService.handleStockUpdate(null);
    console.log('  Обновление с пустым product.id обработано (должно быть пропущено)');

    // Тест 7: Изоляция данных - проверка что в M2 передается только offerId и count
    console.log('\n✓ Тест 7: Изоляция данных - только offerId и count передаются в M2');
    await stockService.updateM2Stock('OFFER001', 25);
    const lastUpdate = mockYandexClient.lastStockUpdate[0];
    
    // Проверяем что передаются ТОЛЬКО offerId и count (и warehouseId)
    const allowedKeys = ['offerId', 'count', 'warehouseId'];
    const actualKeys = Object.keys(lastUpdate);
    const extraKeys = actualKeys.filter(key => !allowedKeys.includes(key));
    
    console.assert(extraKeys.length === 0, `Не должно быть лишних полей: ${extraKeys.join(', ')}`);
    console.assert(!lastUpdate.externalCode, 'externalCode НЕ должен передаваться в M2');
    console.assert(!lastUpdate.name, 'name НЕ должен передаваться в M2');
    console.assert(!lastUpdate.price, 'price НЕ должен передаваться в M2');
    console.assert(!lastUpdate.productId, 'productId НЕ должен передаваться в M2');
    console.log('  ✓ Только offerId и count передаются в M2 (изоляция данных соблюдена)');

    // Тест 8: Обработка товаров без маппинга в syncStocks
    console.log('\n✓ Тест 8: Обработка товаров без маппинга в syncStocks');
    // Добавим product.id без маппинга
    mockMapperService.getAllProductIds = () => ['product-id-001', 'product-id-002', 'product-id-003', 'no-mapping-id'];
    const stats2 = await stockService.syncStocks();
    console.log(`  Всего товаров: ${stats2.total}`);
    console.log(`  Синхронизировано: ${stats2.synced}`);
    console.log(`  Пропущено: ${stats2.skipped}`);
    console.assert(stats2.total === 4, 'Должно быть 4 товара');
    console.assert(stats2.synced === 3, 'Должно быть синхронизировано 3 товара');
    console.assert(stats2.skipped === 1, 'Должен быть пропущен 1 товар без маппинга');

    console.log('\n✅ Все тесты пройдены успешно!');
  } catch (error) {
    console.error('\n❌ Ошибка при выполнении тестов:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
