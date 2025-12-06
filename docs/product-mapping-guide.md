# Руководство по файловому маппингу товаров

## Обзор

Система использует файловый маппинг для связи `product.id` (UUID товара в МойСклад) с `offerId` (идентификатор товара в Яндекс.Маркет M2). Это обеспечивает полную изоляцию между магазинами M1 и M2, работающими с одной базой товаров в МойСклад.

## Зачем нужен файловый маппинг?

### Почему файловый маппинг?

Система должна соответствовать реальным ограничениям API:

- **МойСклад webhook** отправляет только `product.id` (UUID товара)
- **Яндекс.Маркет API** работает только с `offerId` (стандартное поле)
- **M1 и M2** должны использовать разные значения `offerId` для одного и того же товара

### Решение: Файловый маппинг

```
┌─────────────────────────────────────────────────────────────┐
│                  МойСклад (единая база)                      │
│                                                              │
│  Товар: product.id = "f8a2da33-bf0a-11ef-0a80-17e3002d7201" │
│         product.offerId = "8100-X-clean-EFE-5w-30-5L"       │
└─────────────────────────────────────────────────────────────┘
           │                                    │
           │ Встроенная                         │ Webhook
           │ интеграция                         │ (product.id)
           ▼                                    ▼
    ┌──────────┐                         ┌──────────────────┐
    │ M1       │                         │ Middleware       │
    │          │                         │                  │
    │ offerId: │                         │ Mapping Table:   │
    │ "8100-   │                         │ product.id →     │
    │  X-clean"│                         │ offerId          │
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

## Структура файла маппинга

### Формат файла

Файл `data/product-mappings.json` имеет следующую структуру:

```json
{
  "version": "1.0",
  "lastUpdated": "2024-12-04T10:00:00Z",
  "mappings": {
    "f8a2da33-bf0a-11ef-0a80-17e3002d7201": "8100-X-clean-EFE-5w-30-5L_DBSA",
    "a1b2c3d4-e5f6-11ef-0a80-17e3002d7202": "8100-X-clean-C3-5w-40-5L_DBSA",
    "b2c3d4e5-f6a7-11ef-0a80-17e3002d7203": "Castrol-EDGE-0w-40-4L_DBSA"
  }
}
```

### Поля

- **version**: Версия формата файла (текущая: "1.0")
- **lastUpdated**: Дата и время последнего обновления файла (ISO 8601)
- **mappings**: Объект с маппингом `product.id → offerId`
  - Ключ: `product.id` - UUID товара в МойСклад
  - Значение: `offerId` - идентификатор товара в Яндекс.Маркет M2

## Создание файла маппинга

### Создание вручную

```bash
# Скопировать пример
cp data/product-mappings.example.json data/product-mappings.json

# Отредактировать файл
nano data/product-mappings.json
```

Пример заполнения:

```json
{
  "version": "1.0",
  "lastUpdated": "2024-12-04T10:00:00Z",
  "mappings": {
    "UUID-товара-1": "offerId-для-M2-1",
    "UUID-товара-2": "offerId-для-M2-2"
  }
}
```

### Как получить product.id?

**Через API МойСклад:**

```bash
curl -X GET \
  'https://api.moysklad.ru/api/remap/1.2/entity/product' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

Ответ содержит `id` каждого товара:

```json
{
  "rows": [
    {
      "id": "f8a2da33-bf0a-11ef-0a80-17e3002d7201",
      "name": "Масло моторное 5W-30",
      "code": "8100-X-clean-EFE-5w-30-5L"
    }
  ]
}
```

## Использование маппинга

### Синхронизация остатков (МойСклад → M2)

```javascript
// 1. Webhook от МойСклад содержит product.id
const productId = "f8a2da33-bf0a-11ef-0a80-17e3002d7201";

// 2. MapperService преобразует product.id → offerId
const offerId = mapperService.mapProductIdToOfferId(productId);
// "8100-X-clean-EFE-5w-30-5L_DBSA"

// 3. StockService отправляет остатки в M2 с offerId
await yandexClient.updateStocks([{
  sku: offerId,
  warehouseId: 0,
  items: [{ count: 20, type: "FIT" }]
}]);
```

### Обработка заказов (M2 → МойСклад)

```javascript
// 1. Заказ из M2 содержит offerId
const offerId = "8100-X-clean-EFE-5w-30-5L_DBSA";

// 2. MapperService преобразует offerId → product.id
const productId = mapperService.mapOfferIdToProductId(offerId);
// "f8a2da33-bf0a-11ef-0a80-17e3002d7201"

// 3. OrderService создаёт заказ в МойСклад с product.id
await moySkladClient.createCustomerOrder({
  positions: [{
    assortment: {
      meta: {
        href: `https://api.moysklad.ru/api/remap/1.2/entity/product/${productId}`,
        type: "product"
      }
    },
    quantity: 2
  }]
});
```

## Обновление маппинга

### Добавление нового товара

```javascript
// Через ProductMappingStore
const store = new ProductMappingStore('./data/product-mappings.json');
await store.load();

store.addMapping(
  "новый-product-id-uuid",
  "новый-offerId-для-M2"
);

await store.save();
```

### Удаление товара

```javascript
store.removeMapping("product-id-uuid");
await store.save();
```

### Массовое обновление

Отредактируйте файл `data/product-mappings.json` напрямую:

```json
{
  "version": "1.0",
  "lastUpdated": "2024-12-04T12:00:00Z",
  "mappings": {
    "существующий-id": "существующий-offerId",
    "новый-id-1": "новый-offerId-1",
    "новый-id-2": "новый-offerId-2"
  }
}
```

После изменения перезапустите сервер для загрузки обновлённого маппинга.

## Изоляция M1 и M2

### Ключевые принципы

1. **M1 использует product.offerId** (стандартное поле МойСклад)
   - Пример: `"8100-X-clean-EFE-5w-30-5L"`
   - Встроенная интеграция МойСклад → Яндекс.Маркет
   - Campaign ID M1

2. **M2 использует маппинг → offerId** (из файла)
   - Пример: `"8100-X-clean-EFE-5w-30-5L_DBSA"`
   - Наш middleware
   - Campaign ID M2

3. **Результат**: Полная изоляция
   - Разные offerId для одного товара
   - Разные Campaign ID
   - Нет конфликтов между магазинами

### Пример изоляции

**Товар в МойСклад:**
```json
{
  "id": "f8a2da33-bf0a-11ef-0a80-17e3002d7201",
  "name": "Масло моторное 5W-30 5L",
  "code": "8100-X-clean-EFE-5w-30-5L",
  "offerId": "8100-X-clean-EFE-5w-30-5L"
}
```

**M1 видит:**
- offerId: `"8100-X-clean-EFE-5w-30-5L"`
- Campaign ID: `12345`

**M2 видит:**
- offerId: `"8100-X-clean-EFE-5w-30-5L_DBSA"` (из маппинга)
- Campaign ID: `67890`

**Middleware не читает product.offerId!** Только маппинг из файла.

## Обработка ошибок

### Товар не найден в маппинге

**Webhook от МойСклад:**
```javascript
// product.id не найден в маппинге
logger.warn('Product ID not found in mapping', {
  productId: 'unknown-uuid',
  action: 'skipped'
});
// Товар пропускается, webhook возвращает 200 OK
```

**Заказ из M2:**
```javascript
// offerId не найден в обратном маппинге
logger.error('Offer ID not found in reverse mapping', {
  offerId: 'unknown-offerId',
  orderId: 'M2-ORDER-123',
  action: 'position_skipped'
});
// Позиция пропускается, остальные обрабатываются
```

### Невалидный файл маппинга

```javascript
// При загрузке файла
try {
  await store.load();
} catch (error) {
  logger.error('Failed to load mapping file', {
    file: './data/product-mappings.json',
    error: error.message
  });
  // Попытка загрузить резервную копию
  // Если нет - создать пустой маппинг
}
```

## Мониторинг

### Статистика маппинга

```javascript
// Получить статистику через MapperService
const stats = mapperService.getStats();

console.log(stats);
// {
//   totalMappings: 150,
//   lastLoaded: '2024-12-04T10:00:00.000Z',
//   successfulLookups: 1234,
//   failedLookups: 5
// }
```

### Логирование операций

Все операции маппинга логируются:

```javascript
// DEBUG уровень - успешные операции
logger.debug('Product ID mapped to Offer ID', {
  productId: 'f8a2da33-bf0a-11ef-0a80-17e3002d7201',
  offerId: '8100-X-clean-EFE-5w-30-5L_DBSA'
});

// WARN уровень - маппинг не найден
logger.warn('Product ID not found in mapping', {
  productId: 'unknown-uuid'
});

// ERROR уровень - критические ошибки
logger.error('Failed to load mapping file', {
  error: 'Invalid JSON'
});
```

## Резервное копирование

### Ручное резервное копирование

```bash
# Создать резервную копию
cp data/product-mappings.json data/backups/product-mappings-$(date +%Y-%m-%d).json

# Восстановить из резервной копии
cp data/backups/product-mappings-2024-12-04.json data/product-mappings.json
```

## Конфигурация

### Переменные окружения

```env
# Путь к файлу маппинга
PRODUCT_MAPPING_FILE=./data/product-mappings.json
```

### Изменение пути к файлу

```env
# Использовать другой файл
PRODUCT_MAPPING_FILE=/path/to/custom-mappings.json
```

## Валидация маппинга

### Проверка целостности

```javascript
// Через MigrationService
const migrationService = new MigrationService(moySkladClient, productMappingStore);

const validation = await migrationService.validateMappings();

console.log(validation);
// {
//   valid: true,
//   totalMappings: 150,
//   invalidMappings: [],
//   duplicateOfferIds: []
// }
```

### Проверка дубликатов

```javascript
// Проверить что каждый offerId уникален
const offerIds = store.getAllOfferIds();
const uniqueOfferIds = new Set(offerIds);

if (offerIds.length !== uniqueOfferIds.size) {
  console.error('Duplicate offerId found!');
}
```

## Производительность

### Кэширование в памяти

- Маппинги загружаются в память при старте сервера
- O(1) сложность для lookup операций
- Используются Map объекты для быстрого доступа

### Batch обработка

```javascript
// Получить все product.id для синхронизации
const productIds = mapperService.getAllProductIds();

// Обработать batch (например, по 100 товаров)
for (let i = 0; i < productIds.length; i += 100) {
  const batch = productIds.slice(i, i + 100);
  await stockService.syncStocksForProducts(batch);
}
```

## Troubleshooting

### Проблема: Остатки не синхронизируются

**Проверка:**
```bash
# 1. Проверить что файл маппинга существует
ls -la data/product-mappings.json

# 2. Проверить формат JSON
cat data/product-mappings.json | jq .

# 3. Проверить логи
tail -f logs/combined.log | grep "mapping"
```

### Проблема: Заказы не создаются в МойСклад

**Проверка:**
```bash
# 1. Проверить обратный маппинг
node -e "
const store = require('./src/storage/productMappingStore');
const s = new store('./data/product-mappings.json');
s.load().then(() => {
  console.log(s.getProductId('ваш-offerId'));
});
"

# 2. Проверить логи заказов
tail -f logs/combined.log | grep "order"
```

### Проблема: Файл маппинга повреждён

**Восстановление:**
```bash
# Восстановить из резервной копии
cp data/backups/product-mappings-latest.json data/product-mappings.json

# Или создать новый файл на основе примера
cp data/product-mappings.example.json data/product-mappings.json
```

## Best Practices

1. **Регулярное резервное копирование**
   - Создавайте резервные копии перед изменениями
   - Храните несколько версий

2. **Валидация перед деплоем**
   - Проверяйте JSON формат
   - Проверяйте отсутствие дубликатов offerId

3. **Мониторинг маппинга**
   - Отслеживайте количество пропущенных товаров
   - Настройте алерты для критических ошибок

4. **Документирование изменений**
   - Обновляйте поле `lastUpdated`
   - Ведите changelog для маппинга

5. **Тестирование после изменений**
   - Проверяйте синхронизацию остатков
   - Проверяйте обработку заказов

## См. также

- [Архитектура потоков данных](architecture-data-flow.md)
- [Руководство по ProductMappingStore](product-mapping-store-usage.md)
- [Руководство по MapperService](mapper-service-usage.md)
- [Синхронизация остатков](stock-service-usage.md)
- [Обработка заказов](order-service-usage.md)
