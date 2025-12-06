# MoySkladClient - Руководство по использованию

## Обзор

`MoySkladClient` - клиент для работы с API МойСклад. После рефакторинга клиент больше не работает с кастомными атрибутами и использует только стандартные поля API.

## Изменения в версии 2.0

### Удалено

- ❌ `getProductAttributes()` - метод удален, так как система больше не использует кастомные атрибуты

### Изменено

- ✅ `getProducts(filter)` - больше не использует `expand=attributes`
- ✅ `getProductStock(productId)` - теперь работает только с `product.id` (UUID)

### Добавлено

- ✅ `getProductById(productId)` - новый метод для получения товара по UUID

## API

### getProducts(filter)

Получить список товаров без атрибутов.

**Параметры:**
- `filter` (Object, optional) - параметры фильтрации

**Возвращает:** `Promise<Array>` - массив товаров

**Пример:**
```javascript
const client = new MoySkladClient();

// Получить первые 10 товаров
const products = await client.getProducts({ limit: 10 });

// Получить товары с offset
const moreProducts = await client.getProducts({ offset: 100 });
```

**Важно:** Метод больше не возвращает атрибуты товаров. Если вам нужен маппинг `product.id → offerId`, используйте `ProductMappingStore`.

---

### getProductById(productId)

Получить товар по UUID.

**Параметры:**
- `productId` (string) - UUID товара в МойСклад

**Возвращает:** `Promise<Object>` - данные товара

**Пример:**
```javascript
const productId = 'f8a2da33-bf0a-11ef-0a80-17e3002d7201';
const product = await client.getProductById(productId);

console.log(product.id);    // f8a2da33-bf0a-11ef-0a80-17e3002d7201
console.log(product.name);  // Название товара
console.log(product.code);  // Артикул
```

---

### getProductStock(productId)

Получить остатки товара по UUID.

**Параметры:**
- `productId` (string) - UUID товара в МойСклад

**Возвращает:** `Promise<Object>` - данные об остатках

**Структура ответа:**
```javascript
{
  productId: 'f8a2da33-bf0a-11ef-0a80-17e3002d7201',
  totalStock: 15,        // Всего на складах
  totalReserve: 3,       // В резерве
  availableStock: 12,    // Доступно для продажи
  stockByStore: [...]    // Детализация по складам
}
```

**Пример:**
```javascript
const productId = 'f8a2da33-bf0a-11ef-0a80-17e3002d7201';
const stock = await client.getProductStock(productId);

console.log(`Доступно: ${stock.availableStock} шт.`);
```

**Важно:** Метод теперь принимает только `product.id` (UUID), а не `externalCode`.

---

### createCustomerOrder(orderData)

Создать заказ покупателя.

**Параметры:**
- `orderData` (Object) - данные заказа

**Возвращает:** `Promise<Object>` - созданный заказ

**Пример:**
```javascript
const orderData = {
  name: 'Заказ #123',
  organization: { meta: { href: '...' } },
  agent: { meta: { href: '...' } },
  positions: [
    {
      assortment: { meta: { href: '...' } },
      quantity: 2,
      price: 1500
    }
  ]
};

const order = await client.createCustomerOrder(orderData);
```

---

### createShipment(shipmentData)

Создать отгрузку.

**Параметры:**
- `shipmentData` (Object) - данные отгрузки

**Возвращает:** `Promise<Object>` - созданная отгрузка

---

### updateOrderStatus(orderId, stateId)

Обновить статус заказа.

**Параметры:**
- `orderId` (string) - ID заказа
- `stateId` (string) - href статуса

**Возвращает:** `Promise<Object>` - обновленный заказ

## Миграция с версии 1.0

### Было (версия 1.0):

```javascript
// Получение атрибутов
const attrId = await client.getProductAttributes();

// Получение товаров с атрибутами
const products = await client.getProducts();
const offerId = products[0].attributes.find(a => a.id === attrId)?.value;

// Получение остатков по externalCode
const stock = await client.getProductStock(externalCode);
```

### Стало (версия 2.0):

```javascript
// Атрибуты больше не используются
// Используем ProductMappingStore для маппинга

const productMappingStore = new ProductMappingStore();
await productMappingStore.load();

// Получение товаров без атрибутов
const products = await client.getProducts();
const productId = products[0].id;

// Маппинг через ProductMappingStore
const offerId = productMappingStore.getOfferId(productId);

// Получение остатков по product.id
const stock = await client.getProductStock(productId);
```

## Обработка ошибок

Все методы выбрасывают ошибки при сбоях API:

```javascript
try {
  const product = await client.getProductById(productId);
} catch (error) {
  console.error('Ошибка API:', error.message);
  console.error('Статус:', error.response?.status);
  console.error('Детали:', error.response?.data);
}
```

## Логирование

Клиент автоматически логирует все операции через `logger`:

- `DEBUG` - детали запросов и ответов
- `INFO` - успешные операции
- `ERROR` - ошибки API

## Требования

- Требование 6.1: Система не запрашивает метаданные атрибутов
- Требование 6.2: Система не использует `expand=attributes`
- Требование 6.3: Система не читает кастомные атрибуты

## См. также

- [ProductMappingStore](./product-mapping-store-usage.md) - для маппинга product.id → offerId
- [MapperService](./mapper-service-usage.md) - для работы с маппингом
- [StockService](./stock-service-usage.md) - для синхронизации остатков
