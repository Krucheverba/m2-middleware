# Webhook Endpoint - Руководство по использованию

## Обзор

Webhook endpoint позволяет получать события от МойСклад о изменении остатков товаров в реальном времени. Когда остатки товара изменяются в МойСклад, система автоматически отправляет webhook на наш сервер, который обрабатывает событие и обновляет остатки в Яндекс.Маркет M2.

## Endpoint

```
POST /webhook/moysklad
```

## Требования

- **Content-Type**: `application/json`
- **User-Agent**: Должен содержать "MoySklad" или "moysklad"

## Формат webhook данных

МойСклад отправляет webhook в следующем формате:

```json
{
  "action": "UPDATE",
  "entityType": "product",
  "events": [
    {
      "meta": {
        "href": "https://api.moysklad.ru/api/remap/1.2/entity/product/{product-id}",
        "type": "product"
      }
    }
  ]
}
```

### Поля

- **action**: Тип действия (`CREATE`, `UPDATE`, `DELETE`)
- **entityType**: Тип сущности (например, `product`, `stock`, `enter`, `loss`, `move`, `customerorder`, `demand`)
- **events**: Массив событий с метаданными

## Поддерживаемые типы событий

Webhook endpoint обрабатывает следующие типы событий, связанные с остатками:

- `product` - Изменение товара
- `stock` - Изменение остатка
- `enter` - Оприходование
- `loss` - Списание
- `move` - Перемещение
- `customerorder` - Заказ покупателя (резервирует товар)
- `demand` - Отгрузка (уменьшает остаток)

## Ответы

### Успешная обработка (200 OK)

```json
{
  "status": "accepted",
  "message": "Webhook received and processing"
}
```

### Событие не связано с остатками (200 OK)

```json
{
  "status": "ignored",
  "message": "Not a stock change event"
}
```

### Ошибка валидации (401 Unauthorized)

```json
{
  "error": "Unauthorized",
  "message": "Webhook validation failed"
}
```

### Отсутствуют данные (400 Bad Request)

```json
{
  "error": "Bad Request",
  "message": "Webhook data is required"
}
```

### Внутренняя ошибка (500 Internal Server Error)

```json
{
  "error": "Internal Server Error",
  "message": "Failed to process webhook"
}
```

## Настройка webhook в МойСклад

1. Войдите в МойСклад
2. Перейдите в раздел "Настройки" → "Вебхуки"
3. Создайте новый webhook со следующими параметрами:
   - **URL**: `https://your-server.com/webhook/moysklad`
   - **Метод**: POST
   - **События**: Выберите события связанные с товарами и остатками

## Обработка webhook

Когда webhook получен:

1. **Валидация**: Проверяется подлинность webhook (Content-Type, User-Agent)
2. **Извлечение данных**: Извлекается информация о товаре и типе события
3. **Фильтрация**: Проверяется что событие связано с остатками
4. **Асинхронная обработка**: Webhook передаётся в StockService для обработки
5. **Быстрый ответ**: Сервер сразу отвечает МойСклад что webhook принят

## Логирование

Все webhook события логируются со следующей информацией:

- Timestamp
- User-Agent
- Content-Type
- Action и EntityType
- Результат обработки
- Ошибки (если есть)

## Обработка ошибок

- Если webhook не проходит валидацию, он отклоняется с кодом 401
- Если данные webhook отсутствуют или некорректны, возвращается код 400
- Если происходит ошибка при обработке, она логируется, но webhook считается принятым
- Система полагается на cron job для eventual consistency в случае сбоев

## Безопасность

- Webhook endpoint проверяет User-Agent для базовой валидации
- В продакшене рекомендуется добавить дополнительную валидацию:
  - Проверка IP адреса источника
  - Проверка подписи webhook (если поддерживается МойСклад)
  - Rate limiting для защиты от DDoS

## Тестирование

Для тестирования webhook endpoint используйте:

```bash
node test-webhook-simple.js
```

Или отправьте тестовый запрос:

```bash
curl -X POST http://localhost:3000/webhook/moysklad \
  -H "Content-Type: application/json" \
  -H "User-Agent: MoySklad-Webhook/1.0" \
  -d '{
    "action": "UPDATE",
    "entityType": "product",
    "events": [{
      "meta": {
        "href": "https://api.moysklad.ru/api/remap/1.2/entity/product/test-id",
        "type": "product"
      }
    }]
  }'
```

## Мониторинг

Для проверки работоспособности сервера используйте health check endpoint:

```bash
curl http://localhost:3000/health
```

Ответ:

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 3600
}
```

## Связанные компоненты

- **StockService**: Обрабатывает webhook события и обновляет остатки в M2
- **MapperService**: Маппит externalCode → offerId_M2 для обновления правильного товара
- **YandexClient**: Отправляет обновления остатков в Яндекс.Маркет API

## Требования

Проверяет следующие требования из спецификации:

- **4.1**: Валидация подлинности webhook
- **4.2**: Извлечение данных webhook для изменений остатков
- **4.4**: Обработка webhook через StockService
