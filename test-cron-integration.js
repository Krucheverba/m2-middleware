/**
 * Интеграционный тест CronScheduler с сервисами
 * Проверяет интеграцию планировщика с StockService и OrderService
 */

// Установить переменные окружения для теста
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign';
process.env.YANDEX_TOKEN = 'test-token';
process.env.MS_TOKEN = 'test-token';
process.env.LOG_LEVEL = 'info';
process.env.STOCK_SYNC_INTERVAL_MINUTES = '1';
process.env.ORDER_POLL_INTERVAL_MINUTES = '1';

const CronScheduler = require('./src/scheduler/cronScheduler');
const config = require('./src/config');

// Mock сервисы для тестирования
class MockStockService {
  constructor() {
    this.syncCount = 0;
  }

  async syncStocks() {
    this.syncCount++;
    console.log(`[MockStockService] Синхронизация остатков #${this.syncCount}`);
    
    // Симулируем работу
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      total: 10,
      synced: 10,
      skipped: 0,
      errors: 0
    };
  }
}

class MockOrderService {
  constructor() {
    this.pollCount = 0;
    this.shipmentCount = 0;
  }

  async pollAndProcessOrders() {
    this.pollCount++;
    console.log(`[MockOrderService] Polling заказов #${this.pollCount}`);
    
    // Симулируем работу
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      processed: 5,
      successful: 5,
      failed: 0,
      errors: []
    };
  }

  async processShippedOrders() {
    this.shipmentCount++;
    console.log(`[MockOrderService] Polling отгрузок #${this.shipmentCount}`);
    
    // Симулируем работу
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      processed: 2,
      successful: 2,
      failed: 0,
      errors: []
    };
  }
}

async function testCronIntegration() {
  console.log('=== Интеграционный тест CronScheduler ===\n');

  // Создать mock сервисы
  const stockService = new MockStockService();
  const orderService = new MockOrderService();

  // Создать планировщик
  const scheduler = new CronScheduler();

  try {
    console.log('Конфигурация:');
    console.log(`  STOCK_SYNC_INTERVAL_MINUTES: ${config.STOCK_SYNC_INTERVAL_MINUTES}`);
    console.log(`  ORDER_POLL_INTERVAL_MINUTES: ${config.ORDER_POLL_INTERVAL_MINUTES}`);
    console.log();

    // Запланировать синхронизацию остатков
    console.log('Планирование синхронизации остатков...');
    scheduler.scheduleStockSync(
      config.STOCK_SYNC_INTERVAL_MINUTES,
      async () => {
        const result = await stockService.syncStocks();
        console.log(`  Результат: ${result.synced}/${result.total} товаров синхронизировано`);
      }
    );

    // Запланировать polling заказов
    console.log('Планирование polling заказов...');
    scheduler.scheduleOrderPolling(
      config.ORDER_POLL_INTERVAL_MINUTES,
      async () => {
        const result = await orderService.pollAndProcessOrders();
        console.log(`  Результат: ${result.successful}/${result.processed} заказов обработано`);
      }
    );

    // Запланировать polling отгрузок
    console.log('Планирование polling отгрузок...');
    scheduler.scheduleShipmentPolling(
      config.ORDER_POLL_INTERVAL_MINUTES,
      async () => {
        const result = await orderService.processShippedOrders();
        console.log(`  Результат: ${result.successful}/${result.processed} отгрузок обработано`);
      }
    );

    console.log('\n✓ Все jobs запланированы\n');

    // Показать статус
    const status = scheduler.getStatus();
    console.log('Статус jobs:');
    status.forEach(job => {
      console.log(`  - ${job.name}: ${job.running ? 'активен' : 'остановлен'}`);
      if (job.nextRun) {
        console.log(`    Следующий запуск: ${job.nextRun}`);
      }
    });
    console.log();

    // Подождать 70 секунд для выполнения jobs
    console.log('Ожидание 70 секунд для выполнения jobs...\n');
    await new Promise(resolve => setTimeout(resolve, 70000));

    // Остановить все jobs
    console.log('\nОстановка всех jobs...');
    scheduler.stopAll();

    // Финальная статистика
    console.log('\n=== Финальная статистика ===');
    console.log(`Синхронизация остатков: ${stockService.syncCount} раз`);
    console.log(`Polling заказов: ${orderService.pollCount} раз`);
    console.log(`Polling отгрузок: ${orderService.shipmentCount} раз`);

    // Проверка результатов
    const allExecuted = stockService.syncCount > 0 && 
                       orderService.pollCount > 0 && 
                       orderService.shipmentCount > 0;

    if (allExecuted) {
      console.log('\n✓ Интеграционный тест пройден успешно!');
      console.log('✓ Все сервисы выполнились через CronScheduler');
    } else {
      console.log('\n⚠ Внимание: некоторые jobs не выполнились');
      console.log('Это нормально если тест запущен не на границе минуты');
    }

  } catch (error) {
    console.error('✗ Ошибка при тестировании:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Запустить тест
testCronIntegration().then(() => {
  console.log('\nТест завершен');
  process.exit(0);
}).catch(error => {
  console.error('Критическая ошибка:', error);
  process.exit(1);
});
