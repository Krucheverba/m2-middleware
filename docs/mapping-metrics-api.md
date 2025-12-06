# Mapping Metrics API

API для мониторинга операций маппинга между product.id и offerId.

## Endpoints

### GET /api/mapping/stats

Получить полную статистику маппинга.

**Требования:** 9.4, 9.5

**Response:**

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
    "recentErrors": [
      {
        "type": "NOT_FOUND",
        "direction": "productId → offerId",
        "identifier": "f8a2da33-bf0a-11ef-0a80-17e3002d7201",
        "context": "stock",
        "timestamp": "2024-12-05T10:25:00.000Z"
      }
    ],
    "uptime": {
      "milliseconds": 3600000,
      "seconds": 3600,
      "minutes": 60,
      "hours": 1
    },
    "startTime": "2024-12-05T09:30:00.000Z"
  }
}
```

**Описание полей:**

- `totalMappings` - Общее количество маппингов в памяти
- `lastLoaded` - Дата последней загрузки маппингов
- `isLoaded` - Статус загрузки маппингов
- `filePath` - Путь к файлу маппинга
- `metrics.lookups` - Статистика lookup операций
  - `success` - Количество успешных операций
  - `notFound` - Количество операций где маппинг не найден
  - `errors` - Количество ошибок
  - `successRate` - Процент успешных операций
- `metrics.skipped` - Количество пропущенных товаров по сервисам
- `metrics.recentErrors` - Последние 10 ошибок маппинга
- `metrics.uptime` - Время работы системы метрик

### GET /api/mapping/summary

Получить краткую статистику для dashboard.

**Требования:** 9.4

**Response:**

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

**Описание полей:**

- `totalMappings` - Общее количество маппингов
- `isLoaded` - Статус загрузки
- `lastLoaded` - Дата последней загрузки
- `totalLookups` - Общее количество lookup операций
- `successfulLookups` - Количество успешных lookup операций
- `notFoundLookups` - Количество операций где маппинг не найден
- `totalSkipped` - Общее количество пропущенных товаров
- `uptimeHours` - Время работы в часах

## Использование

### Мониторинг здоровья системы

```bash
# Получить краткую статистику
curl http://localhost:3000/api/mapping/summary

# Проверить процент успешных операций
curl http://localhost:3000/api/mapping/stats | jq '.metrics.lookups.productIdToOfferId.successRate'
```

### Отладка проблем с маппингом

```bash
# Получить последние ошибки
curl http://localhost:3000/api/mapping/stats | jq '.metrics.recentErrors'

# Проверить количество пропущенных товаров
curl http://localhost:3000/api/mapping/stats | jq '.metrics.skipped'
```

### Интеграция с мониторингом

Эти endpoints можно использовать для интеграции с системами мониторинга (Prometheus, Grafana, etc.):

```javascript
// Пример периодического сбора метрик
setInterval(async () => {
  const response = await fetch('http://localhost:3000/api/mapping/summary');
  const metrics = await response.json();
  
  // Отправить метрики в систему мониторинга
  sendToMonitoring({
    'mapping.total': metrics.totalMappings,
    'mapping.lookups.total': metrics.totalLookups,
    'mapping.lookups.success': metrics.successfulLookups,
    'mapping.skipped': metrics.totalSkipped
  });
}, 60000); // Каждую минуту
```

## Алерты

Рекомендуемые алерты на основе метрик:

### Критические

1. **Маппинги не загружены**
   - Условие: `isLoaded === false`
   - Действие: Немедленно проверить файл маппинга и логи

2. **Высокий процент ошибок lookup**
   - Условие: `successRate < 90%`
   - Действие: Проверить целостность файла маппинга

3. **Большое количество пропущенных товаров**
   - Условие: `totalSkipped > 100`
   - Действие: Проверить актуальность маппингов

### Предупреждения

1. **Маппинги не обновлялись долго**
   - Условие: `lastLoaded` старше 24 часов
   - Действие: Проверить процесс обновления маппингов

2. **Растущее количество notFound**
   - Условие: `notFoundLookups` растет быстрее чем `successfulLookups`
   - Действие: Добавить недостающие маппинги

## Требования

Эти endpoints реализуют следующие требования:

- **9.1** - Логирование количества загруженных маппингов
- **9.2** - Логирование когда маппинг не найден
- **9.3** - Логирование деталей ошибок маппинга с контекстом
- **9.4** - Предоставление статистики маппинга через API
- **9.5** - Возврат количества маппингов и статуса загрузки
