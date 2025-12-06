# Руководство по логированию

## Обзор

Система логирования M2 Middleware реализует комплексное структурированное логирование с санитизацией учётных данных и специализированными методами для различных типов ошибок.

**Проверяет требования:** 6.1, 6.2, 6.3, 6.4, 6.5, 7.3, 7.5

## Конфигурация

Уровень логирования настраивается через переменную окружения `LOG_LEVEL`:

```bash
LOG_LEVEL=error  # По умолчанию - только ошибки
LOG_LEVEL=warn   # Предупреждения и ошибки
LOG_LEVEL=info   # Информационные сообщения, предупреждения и ошибки
LOG_LEVEL=debug  # Все сообщения включая отладочные
```

## Файлы логов

- `logs/error.log` - только ошибки (level: error)
- `logs/combined.log` - все логи
- Консоль - цветной вывод с форматированием

## Специализированные методы логирования

### 1. logMappingError() - Ошибки маппинга

**Требование:** 6.1 - Ошибки маппинга должны включать идентификаторы

```javascript
logger.logMappingError(
  'Маппинг не найден для offerId_M2',
  { offerId_M2: 'OFFER-123', externalCode: 'EXT-456' }
);
```

**Параметры:**
- `message` (string) - Описание ошибки
- `identifiers` (object) - Идентификаторы (offerId_M2, externalCode, productId и т.д.)
- `error` (Error, optional) - Объект ошибки

**Использование:**
- Отсутствие маппинга между offerId_M2 и externalCode
- Товар не найден в системе
- Маппинг заказа не найден

### 2. logApiError() - Ошибки API

**Требование:** 6.2 - Ошибки API должны включать детали запроса

```javascript
logger.logApiError(
  'Ошибка при получении товаров',
  { endpoint: '/entity/product', method: 'GET', params: { limit: 100 } },
  { status: 500, message: 'Internal Server Error' },
  error
);
```

**Параметры:**
- `message` (string) - Описание ошибки
- `requestDetails` (object) - Детали запроса (endpoint, method, params)
- `errorResponse` (object, optional) - Ответ с ошибкой
- `error` (Error, optional) - Объект ошибки

**Использование:**
- Ошибки запросов к МойСклад API
- Ошибки запросов к Яндекс.Маркет API
- Таймауты и сетевые ошибки

### 3. logFileError() - Ошибки файловых операций

**Требование:** 8.5 - Ошибки файлов не должны ронять систему

```javascript
logger.logFileError(
  'Не удалось сохранить маппинг заказа',
  './data/order-mappings.json',
  'save',
  error
);
```

**Параметры:**
- `message` (string) - Описание ошибки
- `filePath` (string) - Путь к файлу
- `operation` (string) - Операция (read, write, delete и т.д.)
- `error` (Error, optional) - Объект ошибки

**Использование:**
- Ошибки чтения/записи файла маппингов заказов
- Проблемы с правами доступа
- Повреждённые файлы

### 4. logWebhookError() - Ошибки webhook

**Требование:** 4.4 - Ошибки webhook должны логироваться

```javascript
logger.logWebhookError(
  'Невалидный webhook отклонён',
  { action: 'UPDATE', entityType: 'product' },
  error
);
```

**Параметры:**
- `message` (string) - Описание ошибки
- `webhookData` (object) - Данные webhook
- `error` (Error, optional) - Объект ошибки

**Использование:**
- Невалидные webhook запросы
- Ошибки обработки webhook
- Проблемы с извлечением данных из webhook

### 5. logOrderError() - Ошибки заказов

**Требование:** 6.3 - Ошибки заказов должны включать контекст

```javascript
logger.logOrderError(
  'Заказ содержит немаппированные товары',
  'M2-ORDER-789',
  ['OFFER-001', 'OFFER-002', 'OFFER-003']
);
```

**Параметры:**
- `message` (string) - Описание ошибки
- `m2OrderId` (string) - ID заказа M2
- `unmappedOfferIds_M2` (array) - Список немаппированных offerId_M2
- `error` (Error, optional) - Объект ошибки

**Использование:**
- Заказы с немаппированными товарами
- Ошибки создания заказов в МойСклад
- Проблемы с валидацией заказов

### 6. logSyncError() - Ошибки синхронизации

**Требование:** 5.5 - Ошибки cron jobs должны логироваться

```javascript
logger.logSyncError(
  'Ошибка при синхронизации товара',
  'stock',
  { externalCode: 'EXT-123', offerId_M2: 'OFFER-456' },
  error
);
```

**Параметры:**
- `message` (string) - Описание ошибки
- `syncType` (string) - Тип синхронизации (stock, order, shipment)
- `context` (object) - Контекст ошибки
- `error` (Error, optional) - Объект ошибки

**Использование:**
- Ошибки синхронизации остатков
- Ошибки polling заказов
- Ошибки обработки отгрузок

## Стандартные методы

Для обычного логирования используйте стандартные методы:

```javascript
logger.debug('Отладочное сообщение', { detail: 'value' });
logger.info('Информационное сообщение', { detail: 'value' });
logger.warn('Предупреждение', { detail: 'value' });
logger.error('Ошибка', { detail: 'value' });
```

## Санитизация учётных данных

**Требование:** 7.3 - Учётные данные никогда не должны логироваться

Система автоматически заменяет следующие поля на `[REDACTED]`:
- `MS_TOKEN`
- `YANDEX_TOKEN`
- `token`
- `password`
- `authorization`
- `bearer`

```javascript
logger.error('Ошибка API', {
  MS_TOKEN: 'secret-123',        // Будет [REDACTED]
  authorization: 'Bearer xyz',   // Будет [REDACTED]
  normalField: 'visible'         // Останется как есть
});
```

## Структура логов

**Требование:** 6.4 - Логи должны включать timestamp, errorType и идентификаторы

Все логи имеют следующую структуру:

```json
{
  "timestamp": "2024-12-02 18:30:45",
  "level": "error",
  "message": "Описание ошибки",
  "errorType": "MAPPING_ERROR",
  "identifiers": {
    "offerId_M2": "OFFER-123",
    "externalCode": "EXT-456"
  },
  "error": "Error message",
  "stack": "Stack trace..."
}
```

## Типы ошибок (errorType)

- `MAPPING_ERROR` - Ошибки маппинга товаров/заказов
- `API_ERROR` - Ошибки API запросов
- `FILE_ERROR` - Ошибки файловых операций
- `WEBHOOK_ERROR` - Ошибки обработки webhook
- `ORDER_ERROR` - Ошибки обработки заказов
- `SYNC_ERROR` - Ошибки синхронизации
- `WEBHOOK_VALIDATION_ERROR` - Ошибки валидации webhook
- `JSON_PARSE_ERROR` - Ошибки парсинга JSON
- `EXPRESS_ERROR` - Ошибки Express сервера

## Примеры использования

### Пример 1: Ошибка маппинга в StockService

```javascript
const offerId_M2 = this.mapperService.mapExternalCodeToOfferId(externalCode);

if (!offerId_M2) {
  logger.logMappingError(
    'Маппинг не найден для товара, пропускаем',
    { externalCode, productId }
  );
  return;
}
```

### Пример 2: Ошибка API в OrderService

```javascript
try {
  const orders = await this.yandexClient.getOrders({ status: 'PROCESSING' });
} catch (error) {
  logger.logApiError(
    'Ошибка при polling заказов',
    { endpoint: '/orders', method: 'GET', filters: { status: 'PROCESSING' } },
    null,
    error
  );
  throw error;
}
```

### Пример 3: Ошибка заказа с немаппированными товарами

```javascript
if (unmappedItems.length > 0) {
  const unmappedOfferIds_M2 = unmappedItems.map(p => p.offerId_M2);
  
  logger.logOrderError(
    'Заказ содержит немаппированные товары',
    m2Order.id,
    unmappedOfferIds_M2
  );
  
  throw new Error(`Заказ ${m2Order.id} содержит немаппированные товары`);
}
```

### Пример 4: Ошибка файла в OrderMappingStore

```javascript
try {
  await this._writeMappings(mappings);
} catch (error) {
  logger.logFileError(
    'Не удалось сохранить маппинг заказа',
    this.filePath,
    'save',
    error
  );
  throw error;
}
```

## Тестирование

Запустите тест логирования:

```bash
node test-logging-detailed.js
```

Тест проверяет:
- ✓ Наличие всех специализированных методов
- ✓ Правильность параметров методов
- ✓ Санитизацию учётных данных
- ✓ Настройку уровня логирования
- ✓ Соответствие всем требованиям (6.1-6.5, 7.3, 7.5)

## Лучшие практики

1. **Используйте специализированные методы** вместо обычного `logger.error()` для типизированных ошибок
2. **Всегда включайте идентификаторы** (offerId_M2, externalCode, orderId и т.д.)
3. **Передавайте объект Error** как последний параметр для получения stack trace
4. **Не логируйте чувствительные данные** - система санитизирует автоматически, но будьте внимательны
5. **Используйте правильный уровень**:
   - `error` - для ошибок требующих внимания
   - `warn` - для предупреждений (rate limiting, fallback к cron)
   - `info` - для важных событий (запуск, завершение операций)
   - `debug` - для отладочной информации

## Мониторинг

Для мониторинга в продакшене:

1. Настройте ротацию логов (winston-daily-rotate-file)
2. Отправляйте логи в централизованную систему (ELK, Splunk)
3. Настройте алерты на критические ошибки
4. Регулярно проверяйте `logs/error.log`

## Соответствие требованиям

| Требование | Описание | Реализация |
|------------|----------|------------|
| 6.1 | Ошибки маппинга включают идентификаторы | `logMappingError()` |
| 6.2 | Ошибки API включают детали запроса | `logApiError()` |
| 6.3 | Ошибки заказов включают контекст | `logOrderError()` |
| 6.4 | Логи включают timestamp и errorType | Структура логов |
| 6.5 | Нормальные операции не на уровне error | Уровни логирования |
| 7.3 | Учётные данные санитизируются | `sanitizeLog()` |
| 7.5 | Уровень настраивается через LOG_LEVEL | Winston config |
| 8.5 | Ошибки файлов не роняют систему | `logFileError()` |


## Метрики маппинга

**Требования:** 9.1, 9.2, 9.3, 9.4, 9.5

Система автоматически собирает метрики операций маппинга для мониторинга и отладки.

### Автоматический сбор метрик

Метрики собираются автоматически при каждой операции маппинга:

```javascript
// При загрузке маппингов (Требование 9.1)
await productMappingStore.load();
// → Автоматически записывается количество загруженных маппингов

// При успешном lookup (Требование 9.2)
const offerId = productMappingStore.getOfferId(productId);
// → Автоматически увеличивается счетчик успешных операций

// При ненайденном маппинге (Требование 9.2)
const offerId = productMappingStore.getOfferId('unknown-id');
// → Автоматически записывается в метрики и логи

// При пропуске товара (Требование 9.2)
mappingMetrics.recordSkippedItem('stock', productId);
// → Автоматически увеличивается счетчик пропущенных товаров
```

### Получение метрик через API

**Краткая статистика (Требование 9.4):**

```bash
curl http://localhost:3000/api/mapping/summary
```

```json
{
  "totalMappings": 150,
  "isLoaded": true,
  "lastLoaded": "2024-12-05T10:30:00.000Z",
  "totalLookups": 1629,
  "successfulLookups": 1570,
  "notFoundLookups": 57,
  "totalSkipped": 45,
  "uptimeHours": 1
}
```

**Полная статистика (Требования 9.4, 9.5):**

```bash
curl http://localhost:3000/api/mapping/stats
```

```json
{
  "totalMappings": 150,
  "lastLoaded": "2024-12-05T10:30:00.000Z",
  "isLoaded": true,
  "filePath": "/path/to/product-mappings.json",
  "metrics": {
    "mappings": {
      "total": 150,
      "lastLoaded": "2024-12-05T10:30:00.000Z",
      "isLoaded": true
    },
    "lookups": {
      "productIdToOfferId": {
        "success": 1250,
        "notFound": 45,
        "errors": 2,
        "total": 1297,
        "successRate": "96.38%"
      },
      "offerIdToProductId": {
        "success": 320,
        "notFound": 12,
        "errors": 0,
        "total": 332,
        "successRate": "96.39%"
      }
    },
    "skipped": {
      "stock": 30,
      "order": 10,
      "webhook": 5,
      "total": 45
    },
    "recentErrors": [...],
    "uptime": {...}
  }
}
```

### Логирование метрик

Все операции с метриками автоматически логируются:

```javascript
// Загрузка маппингов
logger.info('Метрики маппинга обновлены', {
  totalMappings: 150,
  lastLoaded: '2024-12-05T10:30:00.000Z'
});

// Успешный lookup
logger.debug('Успешный lookup product.id → offerId', {
  productId: 'f8a2da33-...',
  offerId: '8100-X-clean_DBSA',
  totalSuccess: 1251
});

// Ненайденный маппинг
logger.warn('Маппинг не найден для product.id', {
  productId: 'unknown-id',
  context: 'stock',
  totalNotFound: 46
});

// Пропущенный товар
logger.info('Товар пропущен из-за отсутствия маппинга', {
  service: 'stock',
  identifier: 'product-123',
  totalSkipped: 31
});
```

### Мониторинг метрик

Рекомендуемые проверки для мониторинга:

```bash
# Проверить статус загрузки
curl http://localhost:3000/api/mapping/summary | jq '.isLoaded'

# Проверить success rate
curl http://localhost:3000/api/mapping/stats | \
  jq '.metrics.lookups.productIdToOfferId.successRate'

# Проверить количество пропущенных товаров
curl http://localhost:3000/api/mapping/summary | jq '.totalSkipped'

# Получить последние ошибки
curl http://localhost:3000/api/mapping/stats | \
  jq '.metrics.recentErrors'
```

### Алерты

Настройте алерты для критических ситуаций:

1. **Маппинги не загружены:** `isLoaded === false`
2. **Низкий success rate:** `successRate < 90%`
3. **Много пропущенных товаров:** `totalSkipped > 100`

Подробнее: [Алерты для критических ошибок маппинга](mapping-alerts.md)

### Интеграция с системами мониторинга

Метрики можно экспортировать в Prometheus, Grafana и другие системы мониторинга.

Пример для Prometheus:

```javascript
const summary = await fetch('http://localhost:3000/api/mapping/summary')
  .then(r => r.json());

const metrics = `
mapping_total ${summary.totalMappings}
mapping_loaded ${summary.isLoaded ? 1 : 0}
mapping_lookups_total ${summary.totalLookups}
mapping_lookups_successful ${summary.successfulLookups}
mapping_skipped_total ${summary.totalSkipped}
`;
```

Подробнее: [Mapping Metrics API](mapping-metrics-api.md)
