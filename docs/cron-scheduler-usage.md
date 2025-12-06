# CronScheduler - Руководство по использованию

## Обзор

`CronScheduler` - это класс для управления периодическими задачами (cron jobs) в M2 Middleware. Он обеспечивает:

- Планирование синхронизации остатков из МойСклад в M2
- Планирование polling заказов из M2
- Планирование polling отгруженных заказов из M2
- Автоматическую обработку ошибок без остановки выполнения
- Логирование всех операций

## Требования

Проверяет требования: 5.3, 5.4, 5.5

## Установка

CronScheduler использует библиотеку `cron` (уже установлена в проекте):

```bash
npm install cron
```

## Базовое использование

### Импорт

```javascript
const CronScheduler = require('./src/scheduler/cronScheduler');
```

### Создание экземпляра

```javascript
const scheduler = new CronScheduler();
```

### Планирование синхронизации остатков

```javascript
const StockService = require('./src/services/stockService');

// Создать сервис
const stockService = new StockService(moySkladClient, yandexClient, mapperService);

// Запланировать синхронизацию каждые 10 минут
scheduler.scheduleStockSync(10, async () => {
  await stockService.syncAllStocks();
});
```

### Планирование polling заказов

```javascript
const OrderService = require('./src/services/orderService');

// Создать сервис
const orderService = new OrderService(yandexClient, moySkladClient, mapperService);

// Запланировать polling каждые 5 минут
scheduler.scheduleOrderPolling(5, async () => {
  await orderService.pollAndProcessOrders();
});
```

### Планирование polling отгрузок

```javascript
// Запланировать polling отгрузок каждые 5 минут
scheduler.scheduleShipmentPolling(5, async () => {
  await orderService.processShippedOrders();
});
```

## API

### scheduleStockSync(intervalMinutes, syncFunction)

Планирует синхронизацию остатков.

**Параметры:**
- `intervalMinutes` (number) - Интервал в минутах (минимум 1)
- `syncFunction` (async function) - Функция синхронизации

**Пример:**
```javascript
scheduler.scheduleStockSync(10, async () => {
  await stockService.syncAllStocks();
});
```

### scheduleOrderPolling(intervalMinutes, pollFunction)

Планирует polling заказов.

**Параметры:**
- `intervalMinutes` (number) - Интервал в минутах (минимум 1)
- `pollFunction` (async function) - Функция polling

**Пример:**
```javascript
scheduler.scheduleOrderPolling(5, async () => {
  await orderService.pollAndProcessOrders();
});
```

### scheduleShipmentPolling(intervalMinutes, pollFunction)

Планирует polling отгруженных заказов.

**Параметры:**
- `intervalMinutes` (number) - Интервал в минутах (минимум 1)
- `pollFunction` (async function) - Функция polling

**Пример:**
```javascript
scheduler.scheduleShipmentPolling(5, async () => {
  await orderService.processShippedOrders();
});
```

### stopAll()

Останавливает все запланированные jobs.

**Пример:**
```javascript
scheduler.stopAll();
```

### stop(name)

Останавливает конкретный job.

**Параметры:**
- `name` (string) - Имя job ('stockSync', 'orderPolling', 'shipmentPolling')

**Возвращает:**
- `boolean` - true если job был остановлен, false если не найден

**Пример:**
```javascript
const stopped = scheduler.stop('orderPolling');
console.log(`Job остановлен: ${stopped}`);
```

### getStatus()

Получает статус всех запланированных jobs.

**Возвращает:**
- `Array` - Массив объектов со статусом каждого job

**Пример:**
```javascript
const status = scheduler.getStatus();
console.log('Статус jobs:', status);
// [
//   {
//     name: 'stockSync',
//     running: true,
//     nextRun: '2024-01-01T12:00:00.000Z'
//   },
//   ...
// ]
```

## Обработка ошибок

CronScheduler автоматически обрабатывает ошибки в cron jobs:

- Ошибки логируются с типом `CRON_ERROR`
- Выполнение job не останавливается после ошибки
- Следующий запуск происходит по расписанию

**Пример:**
```javascript
scheduler.scheduleStockSync(10, async () => {
  // Даже если эта функция выбросит ошибку,
  // следующий запуск произойдет через 10 минут
  await stockService.syncAllStocks();
});
```

## Логирование

Все операции CronScheduler логируются:

- **INFO**: Планирование jobs, запуск и завершение выполнения
- **ERROR**: Ошибки при выполнении jobs или планировании

**Примеры логов:**

```
2024-01-01 12:00:00 [info]: Планирование синхронизации остатков { intervalMinutes: 10, cronExpression: '*/10 * * * *' }
2024-01-01 12:00:00 [info]: Синхронизация остатков запланирована { intervalMinutes: 10, nextRun: '2024-01-01T12:10:00.000Z' }
2024-01-01 12:10:00 [info]: Запуск cron job: синхронизация остатков
2024-01-01 12:10:05 [info]: Cron job завершен: синхронизация остатков { durationMs: 5000 }
```

## Интеграция с конфигурацией

CronScheduler использует интервалы из конфигурации:

```javascript
const config = require('./src/config');

// Использовать интервалы из переменных окружения
scheduler.scheduleStockSync(
  config.STOCK_SYNC_INTERVAL_MINUTES,
  async () => await stockService.syncAllStocks()
);

scheduler.scheduleOrderPolling(
  config.ORDER_POLL_INTERVAL_MINUTES,
  async () => await orderService.pollAndProcessOrders()
);
```

## Graceful Shutdown

Для корректного завершения работы приложения:

```javascript
// Обработка сигналов завершения
process.on('SIGTERM', () => {
  console.log('Получен SIGTERM, остановка cron jobs...');
  scheduler.stopAll();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Получен SIGINT, остановка cron jobs...');
  scheduler.stopAll();
  process.exit(0);
});
```

## Полный пример

```javascript
const CronScheduler = require('./src/scheduler/cronScheduler');
const StockService = require('./src/services/stockService');
const OrderService = require('./src/services/orderService');
const config = require('./src/config');

// Создать планировщик
const scheduler = new CronScheduler();

// Создать сервисы
const stockService = new StockService(moySkladClient, yandexClient, mapperService);
const orderService = new OrderService(yandexClient, moySkladClient, mapperService);

// Запланировать синхронизацию остатков
scheduler.scheduleStockSync(
  config.STOCK_SYNC_INTERVAL_MINUTES,
  async () => {
    await stockService.syncAllStocks();
  }
);

// Запланировать polling заказов
scheduler.scheduleOrderPolling(
  config.ORDER_POLL_INTERVAL_MINUTES,
  async () => {
    await orderService.pollAndProcessOrders();
  }
);

// Запланировать polling отгрузок
scheduler.scheduleShipmentPolling(
  config.ORDER_POLL_INTERVAL_MINUTES,
  async () => {
    await orderService.processShippedOrders();
  }
);

// Graceful shutdown
process.on('SIGTERM', () => {
  scheduler.stopAll();
  process.exit(0);
});

console.log('CronScheduler запущен');
console.log('Статус:', scheduler.getStatus());
```

## Тестирование

Для тестирования CronScheduler:

```bash
# Базовый тест функциональности
node test-cron-scheduler.js

# Тест выполнения jobs (требует ожидания ~70 секунд)
node test-cron-execution.js
```

## Часовой пояс

По умолчанию используется часовой пояс `Europe/Moscow`. Для изменения отредактируйте параметр `timezone` в конструкторе `CronJob`.

## Ограничения

- Минимальный интервал: 1 минута
- Jobs выполняются в одном процессе (не распределенные)
- При перезапуске приложения расписание сбрасывается

## Troubleshooting

### Jobs не выполняются

1. Проверьте что jobs запланированы: `scheduler.getStatus()`
2. Проверьте логи на наличие ошибок
3. Убедитесь что интервал >= 1 минуты

### Ошибки в jobs

Ошибки автоматически логируются и не останавливают выполнение. Проверьте логи:

```bash
tail -f logs/error.log
```

### Высокая нагрузка

Если jobs выполняются слишком часто:

1. Увеличьте интервалы в `.env`:
   ```
   STOCK_SYNC_INTERVAL_MINUTES=15
   ORDER_POLL_INTERVAL_MINUTES=10
   ```

2. Перезапустите приложение
