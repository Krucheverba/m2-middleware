# Реализация мониторинга и метрик маппинга

## Обзор

Реализована комплексная система мониторинга операций маппинга между product.id и offerId для отслеживания здоровья системы и быстрой диагностики проблем.

**Задача:** 17. Обновить мониторинг и логирование  
**Требования:** 9.1, 9.2, 9.3, 9.4, 9.5

## Реализованные компоненты

### 1. MappingMetrics (src/metrics/mappingMetrics.js)

Центральная система сбора метрик с автоматическим отслеживанием:

**Метрики маппингов:**
- Общее количество маппингов в памяти
- Дата последней загрузки
- Статус загрузки (isLoaded)

**Метрики lookup операций:**
- Успешные операции (success)
- Ненайденные маппинги (notFound)
- Ошибки (errors)
- Процент успешных операций (successRate)
- Отдельная статистика для каждого направления:
  - product.id → offerId
  - offerId → product.id

**Метрики пропущенных товаров:**
- По сервисам: stock, order, webhook
- Общее количество пропущенных товаров

**История ошибок:**
- Последние 100 ошибок маппинга
- Тип ошибки, направление, идентификатор, контекст, время

**Uptime:**
- Время работы системы метрик
- Дата старта

### 2. Интеграция с компонентами

**ProductMappingStore:**
- Автоматическая запись метрик при загрузке маппингов (Требование 9.1)
- Автоматическая запись успешных/неудачных lookup (Требование 9.2)

**MapperService:**
- Методы getStats() и getSummary() для получения статистики (Требования 9.4, 9.5)

**StockService:**
- Автоматическая запись пропущенных товаров в stock и webhook (Требование 9.2)

**OrderService:**
- Автоматическая запись пропущенных товаров в order (Требование 9.2)

### 3. API Endpoints

**GET /api/mapping/summary** - Краткая статистика для dashboard
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

**GET /api/mapping/stats** - Полная статистика с детальными метриками
```json
{
  "totalMappings": 150,
  "lastLoaded": "2024-12-05T10:30:00.000Z",
  "isLoaded": true,
  "filePath": "/path/to/product-mappings.json",
  "metrics": {
    "mappings": {...},
    "lookups": {
      "productIdToOfferId": {
        "success": 1250,
        "notFound": 45,
        "errors": 2,
        "total": 1297,
        "successRate": "96.38%"
      },
      "offerIdToProductId": {...}
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

## Автоматическое логирование

Все операции с метриками автоматически логируются (Требование 9.3):

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

## Система алертов

Реализованы рекомендации для критических и предупреждающих алертов:

### Критические алерты

1. **Маппинги не загружены** (`isLoaded === false`)
   - Немедленная проверка файла маппинга и логов

2. **Высокий процент ошибок lookup** (`successRate < 90%`)
   - Проверка целостности файла маппинга

3. **Большое количество пропущенных товаров** (`totalSkipped > 100`)
   - Добавление недостающих маппингов

### Предупреждающие алерты

1. **Маппинги не обновлялись долго** (`lastLoaded` старше 24 часов)
2. **Растущее количество notFound**
3. **Высокая частота ошибок в определенном сервисе**

Подробнее: [docs/mapping-alerts.md](docs/mapping-alerts.md)

## Использование

### Мониторинг здоровья системы

```bash
# Получить краткую статистику
curl http://localhost:3000/api/mapping/summary

# Проверить процент успешных операций
curl http://localhost:3000/api/mapping/stats | \
  jq '.metrics.lookups.productIdToOfferId.successRate'

# Проверить количество пропущенных товаров
curl http://localhost:3000/api/mapping/summary | jq '.totalSkipped'
```

### Отладка проблем

```bash
# Получить последние ошибки
curl http://localhost:3000/api/mapping/stats | jq '.metrics.recentErrors'

# Проверить статус загрузки
curl http://localhost:3000/api/mapping/summary | jq '.isLoaded'
```

### Интеграция с мониторингом

```javascript
// Пример периодического сбора метрик для Prometheus/Grafana
setInterval(async () => {
  const response = await fetch('http://localhost:3000/api/mapping/summary');
  const metrics = await response.json();
  
  sendToMonitoring({
    'mapping.total': metrics.totalMappings,
    'mapping.lookups.total': metrics.totalLookups,
    'mapping.lookups.success': metrics.successfulLookups,
    'mapping.skipped': metrics.totalSkipped
  });
}, 60000); // Каждую минуту
```

## Тестирование

### Unit тесты метрик

```bash
node test-mapping-metrics.js
```

Проверяет:
- Обновление количества маппингов
- Запись успешных lookup операций
- Запись ненайденных маппингов
- Запись ошибок lookup
- Запись пропущенных товаров
- Получение полной и краткой статистики
- Вычисление процента успешных операций

### Интеграционные тесты API

```bash
# Запустить сервер
npm start

# В другом терминале
node test-mapping-metrics-api.js
```

Проверяет:
- Работу endpoint /api/mapping/summary
- Работу endpoint /api/mapping/stats
- Структуру возвращаемых данных
- Наличие всех необходимых полей

## Документация

1. **[Mapping Metrics API](docs/mapping-metrics-api.md)** - Полное описание API endpoints
2. **[Mapping Alerts](docs/mapping-alerts.md)** - Система алертов и мониторинга
3. **[Logging Guide](docs/logging-guide.md)** - Обновлено с разделом о метриках
4. **[README.md](README.md)** - Обновлено с информацией о новых endpoints

## Соответствие требованиям

### ✅ Требование 9.1: Логирование количества загруженных маппингов

Реализовано:
- `mappingMetrics.updateMappingCount()` вызывается при загрузке
- Автоматическое логирование: `logger.info('Метрики маппинга обновлены', {...})`
- Доступно через API: `GET /api/mapping/summary` → `totalMappings`

### ✅ Требование 9.2: Логирование когда маппинг не найден

Реализовано:
- `mappingMetrics.recordNotFoundProductId()` для product.id
- `mappingMetrics.recordNotFoundOfferId()` для offerId
- `mappingMetrics.recordSkippedItem()` для пропущенных товаров
- Автоматическое логирование с контекстом
- Доступно через API: `GET /api/mapping/stats` → `metrics.lookups.*.notFound`

### ✅ Требование 9.3: Логирование деталей ошибок маппинга с контекстом

Реализовано:
- `mappingMetrics.recordLookupError()` с полным контекстом
- История последних 100 ошибок
- Каждая ошибка содержит: type, direction, identifier, error, context, timestamp
- Доступно через API: `GET /api/mapping/stats` → `metrics.recentErrors`

### ✅ Требование 9.4: Предоставление статистики маппинга через API

Реализовано:
- `GET /api/mapping/summary` - краткая статистика для dashboard
- `GET /api/mapping/stats` - полная детальная статистика
- Оба endpoint доступны через HTTP REST API
- Возвращают JSON с полной информацией о метриках

### ✅ Требование 9.5: Возврат количества маппингов и статуса загрузки

Реализовано:
- `totalMappings` - количество маппингов
- `isLoaded` - статус загрузки (true/false)
- `lastLoaded` - дата последней загрузки
- Доступно в обоих endpoints: `/api/mapping/summary` и `/api/mapping/stats`

## Преимущества реализации

1. **Автоматический сбор метрик** - не требует ручного вмешательства
2. **Детальная статистика** - отдельно для каждого направления маппинга
3. **История ошибок** - последние 100 ошибок для отладки
4. **API для интеграции** - легко интегрируется с системами мониторинга
5. **Система алертов** - готовые рекомендации для критических ситуаций
6. **Полное логирование** - все операции логируются с контекстом
7. **Success rate** - автоматический расчет процента успешных операций
8. **Uptime tracking** - отслеживание времени работы системы

## Следующие шаги

1. Настроить автоматические алерты на основе метрик
2. Интегрировать с Prometheus/Grafana для визуализации
3. Настроить email/SMS уведомления для критических алертов
4. Добавить dashboard для визуального мониторинга метрик
5. Настроить периодическую проверку метрик через cron

## Заключение

Система мониторинга и метрик маппинга полностью реализована и готова к использованию. Все требования 9.1-9.5 выполнены. Система предоставляет детальную информацию о работе маппинга, автоматически собирает метрики и предоставляет API для интеграции с системами мониторинга.
