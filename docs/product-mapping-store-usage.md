# ProductMappingStore - Руководство по использованию

## Обзор

`ProductMappingStore` - это файловое хранилище для маппинга между `product.id` (UUID товара в МойСклад) и `offerId` (идентификатор товара в Яндекс.Маркет M2).

## Основные возможности

- ✅ Загрузка маппингов из JSON файла
- ✅ Сохранение маппингов в JSON файл
- ✅ Двунаправленный маппинг (product.id ↔ offerId)
- ✅ File locking для предотвращения конфликтов при конкурентной записи
- ✅ Валидация структуры JSON
- ✅ Кэширование в памяти для быстрого доступа (O(1))
- ✅ Обработка ошибок и детальное логирование

## Быстрый старт

```javascript
const ProductMappingStore = require('./src/storage/productMappingStore');

// Создание экземпляра
const store = new ProductMappingStore('./data/product-mappings.json');

// Загрузка маппингов из файла
const count = await store.load();
console.log(`Загружено ${count} маппингов`);

// Получение offerId по product.id
const offerId = store.getOfferId('f8a2da33-bf0a-11ef-0a80-17e3002d7201');
console.log('offerId:', offerId); // "8100-X-clean-EFE-5w-30-5L_DBSA"

// Обратный маппинг: получение product.id по offerId
const productId = store.getProductId('8100-X-clean-EFE-5w-30-5L_DBSA');
console.log('product.id:', productId); // "f8a2da33-bf0a-11ef-0a80-17e3002d7201"
```

## Структура файла маппинга

```json
{
  "version": "1.0",
  "lastUpdated": "2024-12-04T10:00:00Z",
  "mappings": {
    "f8a2da33-bf0a-11ef-0a80-17e3002d7201": "8100-X-clean-EFE-5w-30-5L_DBSA",
    "a1b2c3d4-e5f6-11ef-0a80-17e3002d7202": "8100-X-clean-C3-5w-40-5L_DBSA"
  }
}
```

## API

### Конструктор

```javascript
new ProductMappingStore(filePath = './data/product-mappings.json')
```

**Параметры:**
- `filePath` (string, optional) - Путь к файлу маппинга. По умолчанию: `./data/product-mappings.json`

### load()

Загружает маппинги из файла в память.

```javascript
const count = await store.load();
```

**Возвращает:** `Promise<number>` - Количество загруженных маппингов

**Поведение:**
- Если файл не существует - создает пустой файл с корректной структурой
- Валидирует структуру JSON
- Пропускает невалидные записи с логированием
- Кэширует маппинги в памяти для быстрого доступа

### save(mappings)

Сохраняет маппинги в файл.

```javascript
await store.save(store.productToOfferMap);
```

**Параметры:**
- `mappings` (Map<string, string>) - Map с маппингами product.id → offerId

**Возвращает:** `Promise<void>`

**Особенности:**
- Использует file locking для предотвращения конфликтов
- Автоматически создает директорию если она не существует
- Обновляет поле `lastUpdated` в файле

### getOfferId(productId)

Получает offerId по product.id.

```javascript
const offerId = store.getOfferId('f8a2da33-bf0a-11ef-0a80-17e3002d7201');
```

**Параметры:**
- `productId` (string) - UUID товара в МойСклад

**Возвращает:** `string | null` - offerId или null если маппинг не найден

**Сложность:** O(1)

### getProductId(offerId)

Получает product.id по offerId (обратный маппинг).

```javascript
const productId = store.getProductId('8100-X-clean-EFE-5w-30-5L_DBSA');
```

**Параметры:**
- `offerId` (string) - Идентификатор товара в Яндекс.Маркет M2

**Возвращает:** `string | null` - product.id или null если маппинг не найден

**Сложность:** O(1)

### addMapping(productId, offerId)

Добавляет маппинг в память (не сохраняет в файл автоматически).

```javascript
store.addMapping('product-id-123', 'offer-id-456');
```

**Параметры:**
- `productId` (string) - UUID товара в МойСклад
- `offerId` (string) - Идентификатор товара в Яндекс.Маркет M2

**Примечание:** После добавления маппингов нужно вызвать `save()` для сохранения в файл.

### removeMapping(productId)

Удаляет маппинг из памяти (не сохраняет в файл автоматически).

```javascript
store.removeMapping('product-id-123');
```

**Параметры:**
- `productId` (string) - UUID товара в МойСклад

**Примечание:** После удаления маппингов нужно вызвать `save()` для сохранения в файл.

### getAllProductIds()

Получает список всех product.id.

```javascript
const productIds = store.getAllProductIds();
console.log(productIds); // ['f8a2da33-...', 'a1b2c3d4-...']
```

**Возвращает:** `string[]` - Массив всех product.id

### getAllOfferIds()

Получает список всех offerId.

```javascript
const offerIds = store.getAllOfferIds();
console.log(offerIds); // ['8100-X-clean-...', '8100-X-clean-C3-...']
```

**Возвращает:** `string[]` - Массив всех offerId

### getStats()

Получает статистику маппинга.

```javascript
const stats = store.getStats();
console.log(stats);
// {
//   totalMappings: 42,
//   lastLoaded: 2024-12-04T10:00:00.000Z,
//   isLoaded: true,
//   filePath: '/path/to/product-mappings.json'
// }
```

**Возвращает:** `Object` - Объект со статистикой

## Обработка ошибок

### Файл не существует

Автоматически создается пустой файл с корректной структурой.

### Невалидный JSON

Выбрасывается ошибка с детальным описанием проблемы.

```javascript
try {
  await store.load();
} catch (error) {
  console.error('Ошибка загрузки:', error.message);
}
```

### Невалидные маппинги

Невалидные записи пропускаются с логированием предупреждения. Валидные записи загружаются нормально.

### Маппинг не найден

Методы `getOfferId()` и `getProductId()` возвращают `null` если маппинг не найден.

```javascript
const offerId = store.getOfferId('non-existent-id');
if (offerId === null) {
  console.log('Маппинг не найден');
}
```

## Примеры использования

### Пример 1: Синхронизация остатков

```javascript
const store = new ProductMappingStore();
await store.load();

// Получить все product.id для синхронизации
const productIds = store.getAllProductIds();

for (const productId of productIds) {
  // Получить остатки из МойСклад
  const stock = await moySkladClient.getProductStock(productId);
  
  // Преобразовать в offerId
  const offerId = store.getOfferId(productId);
  
  if (offerId) {
    // Отправить в Яндекс.Маркет M2
    await yandexClient.updateStocks([{ offerId, stock }]);
  }
}
```

### Пример 2: Обработка заказа

```javascript
const store = new ProductMappingStore();
await store.load();

// Заказ из M2 содержит offerId
const orderItems = [
  { offerId: '8100-X-clean-EFE-5w-30-5L_DBSA', count: 2 }
];

// Преобразовать в product.id для создания заказа в МойСклад
const moySkladItems = orderItems.map(item => {
  const productId = store.getProductId(item.offerId);
  
  if (!productId) {
    console.warn('Маппинг не найден для offerId:', item.offerId);
    return null;
  }
  
  return {
    productId,
    quantity: item.count
  };
}).filter(item => item !== null);

// Создать заказ в МойСклад
await moySkladClient.createOrder(moySkladItems);
```

### Пример 3: Добавление новых маппингов

```javascript
const store = new ProductMappingStore();
await store.load();

// Добавить новые маппинги
store.addMapping('new-product-id-1', 'new-offer-id-1');
store.addMapping('new-product-id-2', 'new-offer-id-2');

// Сохранить в файл
await store.save(store.productToOfferMap);

console.log('Маппинги сохранены');
```

## File Locking

ProductMappingStore использует file locking для предотвращения конфликтов при конкурентной записи.

**Параметры:**
- `lockTimeout`: 5000мс (5 секунд)
- `lockCheckInterval`: 50мс

Если блокировка не может быть получена в течение таймаута, выбрасывается ошибка.

## Логирование

Все операции логируются с использованием централизованного logger:

- **INFO**: Успешная загрузка, сохранение, создание файла
- **WARN**: Невалидные маппинги, маппинг не найден
- **DEBUG**: Операции добавления/удаления маппингов, lookup операции
- **ERROR**: Ошибки файловых операций, невалидный JSON

## Требования

Проверяет следующие требования из спецификации:

- **1.1**: Загрузка маппингов из файла
- **1.2**: Создание пустого файла если не существует
- **1.3**: Валидация структуры JSON
- **1.4**: Обработка невалидных данных
- **1.5**: Кэширование в памяти
- **2.1, 2.2**: Маппинг product.id → offerId
- **5.1**: Получение списка product.id
- **8.1, 8.2**: Обратный маппинг offerId → product.id
- **9.5**: Статистика маппинга

## См. также

- [MapperService Usage](./mapper-service-usage.md)
- [Architecture Data Flow](./architecture-data-flow.md)
- [Stock Service Usage](./stock-service-usage.md)
