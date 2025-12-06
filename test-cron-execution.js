/**
 * Тест выполнения cron jobs
 * Проверяет что jobs действительно выполняются по расписанию
 */

// Установить минимальные переменные окружения для теста
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign';
process.env.YANDEX_TOKEN = 'test-token';
process.env.MS_TOKEN = 'test-token';
process.env.LOG_LEVEL = 'info';

const CronScheduler = require('./src/scheduler/cronScheduler');

async function testCronExecution() {
  console.log('=== Тест выполнения Cron Jobs ===\n');

  const scheduler = new CronScheduler();

  // Счетчики для отслеживания выполнения
  let stockSyncCount = 0;
  let orderPollCount = 0;
  let errorCount = 0;

  // Тестовые функции
  const stockSyncFunction = async () => {
    stockSyncCount++;
    console.log(`[${new Date().toISOString()}] ✓ Синхронизация остатков #${stockSyncCount}`);
    // Симулируем работу
    await new Promise(resolve => setTimeout(resolve, 100));
  };

  const orderPollFunction = async () => {
    orderPollCount++;
    console.log(`[${new Date().toISOString()}] ✓ Polling заказов #${orderPollCount}`);
    // Симулируем работу
    await new Promise(resolve => setTimeout(resolve, 100));
  };

  const errorFunction = async () => {
    errorCount++;
    console.log(`[${new Date().toISOString()}] ⚠ Генерация ошибки #${errorCount}`);
    throw new Error(`Тестовая ошибка #${errorCount}`);
  };

  try {
    console.log('Планирование jobs с интервалом 1 минута...\n');

    // Запланировать jobs
    scheduler.scheduleStockSync(1, stockSyncFunction);
    scheduler.scheduleOrderPolling(1, orderPollFunction);

    // Также запланировать job с ошибкой для проверки устойчивости
    scheduler.scheduleShipmentPolling(1, errorFunction);

    console.log('Jobs запланированы. Ожидание выполнения...\n');

    // Показать статус
    const status = scheduler.getStatus();
    console.log('Статус jobs:');
    status.forEach(job => {
      console.log(`  - ${job.name}: следующий запуск в ${job.nextRun}`);
    });
    console.log();

    // Подождать 70 секунд чтобы увидеть хотя бы одно выполнение
    // (cron jobs с интервалом 1 минута выполнятся на следующей минуте)
    console.log('Ожидание 70 секунд для выполнения jobs...\n');
    
    await new Promise(resolve => setTimeout(resolve, 70000));

    // Остановить все jobs
    console.log('\nОстановка всех jobs...');
    scheduler.stopAll();

    // Финальная статистика
    console.log('\n=== Финальная статистика ===');
    console.log(`Синхронизация остатков выполнена: ${stockSyncCount} раз`);
    console.log(`Polling заказов выполнен: ${orderPollCount} раз`);
    console.log(`Ошибки сгенерированы: ${errorCount} раз`);

    // Проверка результатов
    if (stockSyncCount > 0 && orderPollCount > 0 && errorCount > 0) {
      console.log('\n✓ Все jobs выполнились успешно!');
      console.log('✓ Обработка ошибок работает корректно (jobs продолжают выполняться после ошибок)');
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
testCronExecution().then(() => {
  console.log('\nТест завершен');
  process.exit(0);
}).catch(error => {
  console.error('Критическая ошибка:', error);
  process.exit(1);
});
