# Дизайн: Рефакторинг маппинга product.id → offerId

## Overview

Система рефакторится для использования файлового маппинга между `product.id` (МойСклад UUID) и `offerId` (Яндекс.Маркет M2) вместо кастомного атрибута `offerId_M2`. Это обеспечивает полную изоляцию между M1 и M2, работающими с одной базой товаров в МойСклад.

### Ключевые изменения:

1. **Удаление зависимости от атрибута offerId_M2** - больше не читаем кастомные атрибуты
2. **Файловое хранилище маппинга** - `data/product-mappings.json`
3. **Двунаправленный маппинг** - `product.id ↔ offerId`
4. **Webhook на основе product.id** - обработка изменений товаров
5. **Полная изоляция M1/M2** - разные offerId для одного товара

## Architecture

### Текущая архитектура (проблемная):

```
МойСклад
  └─ product.offerId (стандартное поле) → M1 использует
  └─ offerId_M2 (кастомный атрибут) → M2 использует
  
Проблема: Webhook отправляет только product.id, 
          а не значения атрибутов!
```

### Новая архитектура (правильная):

```
┌─────────────────────────────────────────────────────────┐
│                  МойСклад (единая база)                  │
│                                                          │
│  Товар: product.id = "f8a2da33-bf0a-11ef-0a80-17e3..."  │
│         product.offerId = "8100-X-clean-EFE-5w-30-5L"   │
└─────────────────────────────────────────────────────────┘
           │                                    │
           │ Встроенная                         │ Webhook
           │ интеграция                         │ (product.id)
           ▼                                    ▼
    ┌──────────┐                         ┌──────────────────┐
    │ M1       │                         │ Middleware       │
    │          │                         │                  │
    │ offerId: │                         │ Mapping Table:   │
    │ "8100-   │                         │ product.id →     │
    │  X-clean"│                         │ offerId_M2       │
    └──────────┘                         │                  │
           │                             │ "f8a2da33..." →  │
           │                             │ "8100-X-clean_   │
           │                             │  DBSA"           │
           ▼                             └──────────────────┘
    Яндекс M1                                    │
    Campaign ID: XXX                             ▼
                                          Яндекс M2
                                          Campaign ID: YYY
                                          offerId: "8100-X-clean_DBSA"
```

### Изоляция M1 и M2:

- **M1**: Использует `product.offerId` = `"8100-X-clean-EFE-5w-30-5L"` + Campaign ID M1
- **M2**: Использует маппинг → `offerId` = `"8100-X-clean-EFE-5w-30-5L_DBSA"` + Campaign ID M2
- **Результат**: Полная изоляция, разные offerId, разные Campaign ID

## Components and Interfaces

### 1. ProductMappingStore

Новый компонент для управления файловым хранилищем маппинга.

```javascript
class ProductMappingStore {
  constructor(filePath = './data/product-mappings.json')
  
  // Загрузить маппинги из файла
  async load(): Promise<number>
  
  // Сохранить маппинги в файл
  async save(mappings: Map<string, string>): Promise<void>
  
  // Получить offerId по product.id
  getOfferId(productId: string): string | null
  
  // Получить product.id по offerId (обратный маппинг)
  getProductId(offerId: string): string | null
  
  // Добавить маппинг
  addMapping(productId: string, offerId: string): void
  
  // Удалить маппинг
  removeMapping(productId: string): void
  
  // Получить все product.id
  getAllProductIds(): string[]
  
  // Получить все offerId
  getAllOfferIds(): string[]
  
  // Получить статистику
  getStats(): { totalMappings: number, lastLoaded: Date }
}
```

### 2. MapperService (рефакторинг)

Обновленный сервис для работы с новым маппингом.

```javascript
class MapperService {
  constructor(moySkladClient, productMappingStore, orderMappingStore)
  
  // Загрузить маппинги из файла (вместо API МойСклад)
  async loadMappings(): Promise<number>
  
  // Маппинг product.id → offerId
  mapProductIdToOfferId(productId: string): string | null
  
  // Обратный маппинг offerId → product.id
  mapOfferIdToProductId(offerId: string): string | null
  
  // Получить список всех product.id для синхронизации
  getAllProductIds(): string[]
  
  // Получить список всех offerId для M2
  getAllOfferIds(): string[]
  
  // Сохранить/получить маппинг заказов (без изменений)
  async saveOrderMapping(m2OrderId, moySkladOrderId): Promise<void>
  async getMoySkladOrderId(m2OrderId): Promise<string | null>
  
  // Статистика
  getStats(): Object
}
```

### 3. MoySkladClient (упрощение)

Удаляем методы работы с атрибутами.

```javascript
class MoySkladClient {
  // УДАЛИТЬ: async getProductAttributes()
  
  // Получить товары БЕЗ expand=attributes
  async getProducts(filter = {}): Promise<Array>
  
  // Получить товар по product.id
  async getProductById(productId: string): Promise<Object>
  
  // Получить остатки по product.id
  async getProductStock(productId: string): Promise<Object>
  
  // Остальные методы без изменений
  async createCustomerOrder(orderData): Promise<Object>
  async createShipment(shipmentData): Promise<Object>
  async updateOrderStatus(orderId, stateId): Promise<Object>
}
```

### 4. StockService (обновление)

Работа с product.id вместо externalCode.

```javascript
class StockService {
  constructor(moySkladClient, yandexClient, mapperService)
  
  // Синхронизация остатков используя product.id
  async syncStocks(): Promise<Object>
  
  // Обработка webhook с product.id
  async handleStockUpdate(productId: string): Promise<void>
  
  // Получить остатки для списка product.id
  async getStocksForProducts(productIds: string[]): Promise<Array>
}
```

### 5. OrderService (обновление)

Обработка заказов с offerId → product.id маппингом.

```javascript
class OrderService {
  constructor(moySkladClient, yandexClient, mapperService)
  
  // Обработка заказа из M2 (offerId → product.id)
  async processOrder(m2Order: Object): Promise<Object>
  
  // Создание заказа в МойСклад используя product.id
  async createMoySkladOrder(orderData: Object): Promise<Object>
  
  // Остальные методы без изменений
  async pollOrders(): Promise<Array>
  async handleShipment(m2OrderId: string): Promise<void>
}
```

### 6. MigrationService (новый)

Сервис для миграции данных из атрибутов в файл.

```javascript
class MigrationService {
  constructor(moySkladClient, productMappingStore)
  
  // Мигрировать данные из атрибута offerId_M2 в файл
  async migrateFromAttributes(): Promise<Object>
  
  // Создать резервную копию текущего маппинга
  async backupCurrentMappings(): Promise<string>
  
  // Валидировать маппинг
  async validateMappings(): Promise<Object>
}
```

## Data Models

### ProductMapping (файл data/product-mappings.json)

```json
{
  "version": "1.0",
  "lastUpdated": "2024-12-04T10:00:00Z",
  "mappings": {
    "f8a2da33-bf0a-11ef-0a80-17e3002d7201": "8100-X-clean-EFE-5w-30-5L_DBSA",
    "a1b2c3d4-e5f6-11ef-0a80-17e3002d7202": "8100-X-clean-C3-5w-40-5L_DBSA",
    "...": "..."
  }
}
```

**Структура:**
- `version`: Версия формата файла
- `lastUpdated`: Дата последнего обновления
- `mappings`: Объект с маппингом `product.id → offerId`

### Webhook Payload (МойСклад)

```json
{
  "events": [
    {
      "meta": {
        "type": "product",
        "href": "https://api.moysklad.ru/api/remap/1.2/entity/product/f8a2da33-bf0a-11ef-0a80-17e3002d7201"
      },
      "action": "UPDATE",
      "accountId": "..."
    }
  ]
}
```

**Извлечение product.id:**
```javascript
const productId = event.meta.href.split('/').pop();
// "f8a2da33-bf0a-11ef-0a80-17e3002d7201"
```

### Order Item (Яндекс M2)

```json
{
  "offerId": "8100-X-clean-EFE-5w-30-5L_DBSA",
  "count": 2,
  "price": 1500
}
```

**Маппинг для создания заказа в МойСклад:**
```javascript
const productId = mapperService.mapOfferIdToProductId(item.offerId);
// "f8a2da33-bf0a-11ef-0a80-17e3002d7201"
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Bidirectional mapping consistency

*For any* product.id in the mapping table, if we map it to offerId and then map that offerId back to product.id, we should get the original product.id
**Validates: Requirements 2.2, 8.3**

### Property 2: Mapping file integrity

*For any* valid mapping file, loading it and then saving it should produce an equivalent file with the same mappings
**Validates: Requirements 1.1, 1.3**

### Property 3: Isolation guarantee

*For any* product.id processed by the middleware, the system should never read or modify the standard product.offerId field in МойСклад
**Validates: Requirements 3.5**

### Property 4: Webhook processing idempotency

*For any* product.id received in a webhook, processing it multiple times should produce the same result (same offerId lookup, same stock update)
**Validates: Requirements 4.3, 4.4**

### Property 5: Stock sync completeness

*For any* list of product.id from the mapping table, the stock sync should attempt to process all of them and return statistics for successful/failed/skipped items
**Validates: Requirements 5.1, 5.5**

### Property 6: Order mapping preservation

*For any* offerId in an M2 order, if a mapping exists to product.id, then creating an order in МойСклад should use that exact product.id
**Validates: Requirements 7.2, 7.3**

### Property 7: Reverse mapping completeness

*For any* offerId in the mapping table, the reverse lookup should return exactly one product.id
**Validates: Requirements 8.2, 8.3**

### Property 8: Mapping statistics accuracy

*For any* loaded mapping table, the statistics should report the exact count of mappings in the table
**Validates: Requirements 9.5**

### Property 9: Migration data preservation

*For any* set of products with offerId_M2 attribute, migrating them to the file should preserve all mappings without loss
**Validates: Requirements 10.2, 10.3**

### Property 10: Empty mapping handling

*For any* product.id or offerId not in the mapping table, lookup operations should return null and log a warning without throwing errors
**Validates: Requirements 2.3, 8.4**

## Error Handling

### 1. Mapping File Errors

**Scenario**: Файл маппинга поврежден или имеет неверный формат

**Handling**:
- Логировать детальную ошибку с указанием проблемы
- Попытаться загрузить резервную копию если она существует
- Если резервной копии нет - создать пустой маппинг и продолжить работу
- Отправить уведомление администратору

### 2. Product ID Not Found

**Scenario**: Webhook получен для product.id, которого нет в маппинге

**Handling**:
- Логировать предупреждение с product.id
- Пропустить обработку этого товара
- Вернуть HTTP 200 OK (чтобы МойСклад не повторял webhook)
- Увеличить счетчик пропущенных товаров в статистике

### 3. Offer ID Not Found

**Scenario**: Заказ из M2 содержит offerId, которого нет в маппинге

**Handling**:
- Логировать ошибку с offerId и деталями заказа
- Пропустить эту позицию заказа
- Продолжить обработку остальных позиций
- Если все позиции пропущены - логировать критическую ошибку

### 4. МойСклад API Errors

**Scenario**: Ошибка при получении остатков по product.id

**Handling**:
- Логировать ошибку API с product.id и кодом ответа
- Использовать retry механизм (до 3 попыток)
- Если все попытки неудачны - пропустить товар
- Продолжить обработку остальных товаров

### 5. Яндекс API Errors

**Scenario**: Ошибка при обновлении остатков с offerId

**Handling**:
- Логировать ошибку API с offerId и кодом ответа
- Использовать retry механизм с exponential backoff
- Обрабатывать rate limiting (429) специально
- Если критическая ошибка - остановить синхронизацию и уведомить

### 6. Concurrent File Access

**Scenario**: Несколько процессов пытаются записать в файл маппинга одновременно

**Handling**:
- Использовать file locking механизм
- Timeout для получения блокировки (5 секунд)
- Если timeout - логировать ошибку и повторить попытку
- Всегда освобождать блокировку в finally блоке

## Testing Strategy

### Unit Tests

1. **ProductMappingStore**
   - Загрузка валидного файла маппинга
   - Обработка невалидного JSON
   - Обработка отсутствующего файла
   - Сохранение маппинга в файл
   - Получение offerId по product.id
   - Получение product.id по offerId
   - Добавление/удаление маппинга

2. **MapperService**
   - Загрузка маппингов из ProductMappingStore
   - Маппинг product.id → offerId
   - Обратный маппинг offerId → product.id
   - Обработка несуществующих маппингов
   - Получение списков product.id и offerId

3. **StockService**
   - Синхронизация остатков с product.id
   - Обработка webhook с product.id
   - Обработка товаров без маппинга
   - Batch обработка остатков

4. **OrderService**
   - Обработка заказа с offerId
   - Маппинг offerId → product.id для позиций
   - Создание заказа в МойСклад с product.id
   - Обработка позиций без маппинга

5. **MigrationService**
   - Миграция из атрибутов в файл
   - Создание резервной копии
   - Валидация маппинга

### Property-Based Tests

Используем библиотеку **fast-check** для JavaScript.

Каждый тест должен выполнять минимум 100 итераций.

1. **Property 1: Bidirectional mapping consistency**
   - Генерировать случайные пары (product.id, offerId)
   - Проверять: `mapOfferIdToProductId(mapProductIdToOfferId(id)) === id`

2. **Property 2: Mapping file integrity**
   - Генерировать случайные маппинги
   - Сохранить → загрузить → сравнить

3. **Property 4: Webhook processing idempotency**
   - Генерировать случайные product.id
   - Обработать webhook N раз
   - Проверить одинаковый результат

4. **Property 5: Stock sync completeness**
   - Генерировать случайный список product.id
   - Запустить синхронизацию
   - Проверить: processed + skipped + failed = total

5. **Property 7: Reverse mapping completeness**
   - Генерировать случайные маппинги
   - Для каждого offerId проверить что reverse lookup возвращает ровно один product.id

6. **Property 10: Empty mapping handling**
   - Генерировать случайные несуществующие ID
   - Проверить что lookup возвращает null без ошибок

### Integration Tests

1. **End-to-end stock sync**
   - Создать тестовый файл маппинга
   - Запустить полную синхронизацию
   - Проверить что остатки обновлены в M2

2. **End-to-end order processing**
   - Создать тестовый заказ из M2
   - Обработать через OrderService
   - Проверить что заказ создан в МойСклад с правильными product.id

3. **Webhook processing**
   - Отправить тестовый webhook с product.id
   - Проверить что остатки обновлены в M2

4. **Migration**
   - Создать тестовые товары с атрибутом offerId_M2
   - Запустить миграцию
   - Проверить что файл маппинга создан корректно

## Implementation Notes

### 1. Обратная совместимость

Во время переходного периода система должна поддерживать оба способа:
- Старый: чтение атрибута offerId_M2
- Новый: чтение из файла маппинга

Приоритет: файл маппинга > атрибут

### 2. Performance

- Маппинги кэшируются в памяти (Map объекты)
- O(1) сложность для lookup операций
- Файл загружается только при старте системы
- Batch обработка для синхронизации остатков

### 3. Monitoring

Добавить метрики:
- Количество маппингов в памяти
- Количество успешных/неудачных lookup операций
- Время последней загрузки маппинга
- Количество пропущенных товаров (нет маппинга)

### 4. Configuration

Добавить в `.env`:
```
PRODUCT_MAPPING_FILE=./data/product-mappings.json
ENABLE_MIGRATION=false
MIGRATION_BACKUP_DIR=./data/backups
```

### 5. Logging

Все операции маппинга должны логироваться с уровнем DEBUG для отладки.
Ошибки маппинга - уровень WARN.
Критические ошибки (файл не загружен) - уровень ERROR.
