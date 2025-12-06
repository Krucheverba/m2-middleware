/**
 * Тест для CronScheduler
 * Проверяет базовую функциональность планировщика
 */

// Установить минимальные переменные окружения для теста
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign';
process.env.YANDEX_TOKEN = 'test-token';
process.env.MS_TOKEN = 'test-token';
process.env.LOG_LEVEL = 'error'; // Минимальное логирование для теста

const CronScheduler = require('./src/scheduler/cronScheduler');

async function testCronScheduler() {
  console.log('=== Тест CronScheduler ===\n');

  const scheduler = new CronScheduler();

  // Счетчики для отслеживания выполнения
  let stockSyncCount = 0;
  let orderPollCount = 0;
  let shipmentPollCount = 0;

  // Тестовые функции
  const stockSyncFunction = async () => {
    stockSyncCount++;
    console.log(`[${new Date().toISOString()}] Синхронизация остатков выполнена (${stockSyncCount})`);
  };

  const orderPollFunction = async () => {
    orderPollCount++;
    console.log(`[${new Date().toISOString()}] Polling заказов выполнен (${orderPollCount})`);
  };

  const shipmentPollFunction = async () => {
    shipmentPollCount++;
    console.log(`[${new Date().toISOString()}] Polling отгрузок выполнен (${shipmentPollCount})`);
  };

  try {
    // Тест 1: Планирование синхронизации остатков
    console.log('Тест 1: Планирование синхронизации остатков (каждую минуту)');
    scheduler.scheduleStockSync(1, stockSyncFunction);
    console.log('✓ Синхронизация остатков запланирована\n');

    // Тест 2: Планирование polling заказов
    console.log('Тест 2: Планирование polling заказов (каждую минуту)');
    scheduler.scheduleOrderPolling(1, orderPollFunction);
    console.log('✓ Polling заказов запланирован\n');

    // Тест 3: Планирование polling отгрузок
    console.log('Тест 3: Планирование polling отгрузок (каждую минуту)');
    scheduler.scheduleShipmentPolling(1, shipmentPollFunction);
    console.log('✓ Polling отгрузок запланирован\n');

    // Тест 4: Получение статуса
    console.log('Тест 4: Получение статуса всех jobs');
    const status = scheduler.getStatus();
    console.log('Статус jobs:', JSON.stringify(status, null, 2));
    console.log(`✓ Найдено ${status.length} активных jobs\n`);

    // Тест 5: Проверка обработки ошибок
    console.log('Тест 5: Проверка обработки ошибок в cron job');
    const errorFunction = async () => {
      throw new Error('Тестовая ошибка');
    };
    scheduler.scheduleStockSync(1, errorFunction);
    console.log('✓ Job с ошибкой запланирован (ошибка будет залогирована, но не остановит выполнение)\n');

    // Подождать несколько секунд чтобы увидеть выполнение
    console.log('Ожидание 10 секунд для демонстрации работы...\n');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Тест 6: Остановка конкретного job
    console.log('\nТест 6: Остановка конкретного job');
    const stopped = scheduler.stop('orderPolling');
    console.log(`✓ Job 'orderPolling' остановлен: ${stopped}\n`);

    // Тест 7: Остановка всех jobs
    console.log('Тест 7: Остановка всех jobs');
    scheduler.stopAll();
    console.log('✓ Все jobs остановлены\n');

    // Финальная статистика
    console.log('=== Финальная статистика ===');
    console.log(`Синхронизация остатков выполнена: ${stockSyncCount} раз`);
    console.log(`Polling заказов выполнен: ${orderPollCount} раз`);
    console.log(`Polling отгрузок выполнен: ${shipmentPollCount} раз`);

    console.log('\n✓ Все тесты пройдены успешно!');

  } catch (error) {
    console.error('✗ Ошибка при тестировании:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Запустить тест
testCronScheduler().then(() => {
  console.log('\nТест завершен');
  process.exit(0);
}).catch(error => {
  console.error('Критическая ошибка:', error);
  process.exit(1);
});
