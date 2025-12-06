# Руководство по устойчивости системы

## Обзор

M2 Middleware реализует комплексную стратегию устойчивости для обеспечения надежной работы при временных сбоях API, сетевых проблемах и других ошибках.

## Основные принципы

### 1. Повторные попытки (Retry Logic)

Система автоматически повторяет неудачные API вызовы с экспоненциальной задержкой.

**Проверяет: Требование 9.1**

#### Параметры retry

- **Максимальное количество попыток**: 3
- **Базовая задержка**: 1-2 секунды (зависит от операции)
- **Стратегия**: Экспоненциальная задержка (exponential backoff)

#### Формула задержки

```
delay = baseDelay * 2^retryCount
```

Пример для baseDelay = 2000ms:
- Попытка 1: немедленно
- Попытка 2: через 2 секунды
- Попытка 3: через 4 секунды
- Попытка 4: через 8 секунд

#### Где применяется

1. **Polling заказов из M2**
   ```javascript
   // OrderService.pollAndProcessOrders()
   const orders = await this._getOrdersWithRetry({ status: 'PROCESSING' });
   ```

2. **Polling отгруженных заказов**
   ```javascript
   // OrderService.processShippedOrders()
   const orders = await this._getOrdersWithRetry({ status: 'SHIPPED' });
   ```

3. **Обновление остатков в M2**
   ```javascript
   // StockService.updateM2Stock()
   // offerId_M2 - это значение атрибута offerId_M2 из МойСклад
   await this.updateM2Stock(offerId_M2, availableStock);
   ```

4. **API вызовы Яндекс.Маркет**
   ```javascript
   // YandexClient._makeRequestWithRetry()
   // Автоматически обрабатывает rate limiting (429) и ошибки сервера (5xx)
   ```

#### Типы ошибок, подлежащих повторной попытке

- **Сетевые ошибки**: ECONNRESET, ETIMEDOUT, ENOTFOUND
- **Ошибки сервера**: HTTP 5xx (500, 502, 503, 504)
- **Rate limiting**: HTTP 429 (с учетом заголовка Retry-After)

### 2. Изоляция ошибок (Error Isolation)

Ошибка при обработке одного элемента не влияет на обработку других элементов.

**Проверяет: Требование 9.2**

#### Примеры изоляции

1. **Обработка заказов**
   ```javascript
   // Если один заказ упал, другие продолжают обрабатываться
   for (const order of orders) {
     try {
       await this.createMoySkladOrder(order);
       results.successful++;
     } catch (error) {
       // Ошибка изолирована - продолжаем обработку
       results.failed++;
       results.errors.push({ orderId: order.id, error: error.message });
     }
   }
   ```

2. **Синхронизация остатков**
   ```javascript
   // Если один товар упал, другие продолжают синхронизироваться
   for (const externalCode of externalCodes) {
     try {
       await this.updateM2Stock(offerId_M2, availableStock);
       stats.synced++;
     } catch (error) {
       // Ошибка изолирована - продолжаем обработку
       stats.errors++;
     }
   }
   ```

#### Результаты операций

Все batch операции возвращают детальную статистику:

```javascript
{
  processed: 10,    // Всего обработано
  successful: 8,    // Успешно
  failed: 2,        // С ошибками
  errors: [         // Детали ошибок
    { orderId: '123', error: 'Mapping not found' },
    { orderId: '456', error: 'API timeout' }
  ]
}
```

### 3. Устойчивость к множественным сбоям

Система продолжает работу даже при множественных последовательных сбоях.

**Проверяет: Требование 9.4**

#### Механизмы защиты

1. **Graceful degradation в polling**
   ```javascript
   try {
     const orders = await this._getOrdersWithRetry(filters);
     // Обработка заказов
   } catch (error) {
     // Ошибка логируется, но не пробрасывается
     // Система продолжает работу
     return { processed: 0, successful: 0, failed: 0, errors: [...] };
   }
   ```

2. **Cron jobs продолжают выполнение**
   ```javascript
   // В cronScheduler.js
   async () => {
     try {
       await syncFunction();
     } catch (error) {
       // Ошибка логируется, но cron job продолжает работу
       logger.error('Ошибка при выполнении cron job', { error });
       // Следующий запуск произойдет по расписанию
     }
   }
   ```

3. **Критические ошибки не роняют систему**
   ```javascript
   // В stockService.syncAllStocks()
   catch (error) {
     logger.logSyncError('Критическая ошибка', 'stock', {}, error);
     // Не пробрасываем ошибку - система продолжает работу
     return { total: 0, synced: 0, skipped: 0, errors: 1 };
   }
   ```

### 4. Rate Limiting

Система автоматически обрабатывает ограничения скорости API.

**Проверяет: Требование 9.3**

#### Обработка в YandexClient

```javascript
if (error.response?.status === 429) {
  // Получаем время ожидания из заголовка Retry-After
  const retryAfter = error.response.headers['retry-after'];
  const delay = retryAfter 
    ? parseInt(retryAfter) * 1000 
    : baseDelay * Math.pow(2, retryCount);
  
  await this._sleep(delay);
  return this._makeRequestWithRetry(method, url, data, config, retryCount + 1);
}
```

#### Лимиты API

- **Яндекс.Маркет**: Автоматическая обработка rate limiting с учетом заголовка Retry-After
- **МойСклад**: Стандартные лимиты с экспоненциальной задержкой при ошибках

## Логирование ошибок

Все ошибки логируются с полным контекстом для диагностики:

```javascript
logger.error('Ошибка при polling заказов', {
  errorType: 'API_ERROR',
  endpoint: '/orders',
  method: 'GET',
  filters: { status: 'PROCESSING' },
  error: error.message,
  retryCount: 2,
  maxRetries: 3
});
```

## Мониторинг

### Метрики для отслеживания

1. **Успешность операций**
   - Процент успешных polling операций
   - Процент успешных обновлений остатков
   - Процент успешных создания заказов

2. **Retry метрики**
   - Количество retry попыток
   - Средняя задержка между попытками
   - Процент операций, требующих retry

3. **Ошибки**
   - Типы ошибок (сетевые, API, маппинг)
   - Частота ошибок
   - Критические ошибки vs временные

### Алерты

Рекомендуется настроить алерты на:

- Процент неудачных операций > 10%
- Более 3 последовательных сбоев polling
- Критические ошибки в логах
- Длительное время выполнения операций (> 30 секунд)

## Тестирование устойчивости

Запустите тесты устойчивости:

```bash
node test-resilience.js
```

Тесты проверяют:
- ✓ Повторные попытки при неудачном polling
- ✓ Изоляцию ошибок при обработке batch операций
- ✓ Устойчивость к множественным сбоям
- ✓ Экспоненциальную задержку
- ✓ Retry логику для обновления остатков

## Рекомендации по эксплуатации

### 1. Настройка интервалов

Увеличьте интервалы polling при высокой нагрузке:

```bash
# .env
ORDER_POLL_INTERVAL_MINUTES=10  # Вместо 5
STOCK_SYNC_INTERVAL_MINUTES=15  # Вместо 10
```

### 2. Мониторинг логов

Регулярно проверяйте логи на наличие:
- Повторяющихся ошибок маппинга
- Частых retry попыток
- Ошибок rate limiting

### 3. Обработка критических ситуаций

При критических сбоях:
1. Проверьте доступность API (МойСклад, Яндекс.Маркет)
2. Проверьте валидность токенов
3. Проверьте сетевое подключение
4. Проверьте логи на детали ошибок

### 4. Graceful shutdown

Система поддерживает graceful shutdown:

```javascript
// В server.js
process.on('SIGTERM', async () => {
  logger.info('Получен сигнал SIGTERM, завершение работы...');
  
  // Остановить cron jobs
  cronScheduler.stopAll();
  
  // Закрыть сервер
  server.close(() => {
    logger.info('Сервер остановлен');
    process.exit(0);
  });
});
```

## Заключение

Система M2 Middleware спроектирована для надежной работы в условиях временных сбоев и высокой нагрузки. Комбинация retry логики, изоляции ошибок и graceful degradation обеспечивает высокую доступность и устойчивость к сбоям.
