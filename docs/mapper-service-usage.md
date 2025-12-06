# MapperService - Руководство по использованию

## Описание

`MapperService` - это сервис для маппинга SKU между МойСклад и Яндекс.Маркет (M2), а также для управления маппингами заказов.

## Архитектурный принцип

Middleware обеспечивает **однонаправленные потоки данных**:

- **МойСклад → M2**: Только остатки (offerId_M2 + count)
- **M2 → МойСклад**: Только заказы (резервирование и продажи)

MapperService выполняет роль **изолирующего слоя**, обеспечивая:
- Преобразование `offerId_M2` ↔ `externalCode`
- Минимизацию передаваемых данных
- Изоляцию внутренних данных систем

## Основные возможности

1. **Маппинг товаров**: Связывает `offerId_M2` (M2) с `externalCode` (МойСклад) через атрибут `offerId_M2`
2. **Маппинг заказов**: Сохраняет связь между ID заказов M2 и МойСклад
3. **Кэширование**: Хранит маппинги товаров в памяти для быстрого доступа
4. **Изоляция данных**: Обеспечивает передачу только необходимых данных
5. **Логирование ошибок**: Подробное логирование всех ошибок маппинга

## Инициализация

```javascript
const MapperService = require('./src/services/mapperService');
const MoySkladClient = require('./src/api/moySkladClient');
const OrderMappingStore = require('./src/storage/orderMappingStore');

// Создать зависимости
const moySkladClient = new MoySkladClient();
const orderMappingStore = new OrderMappingStore('./data/order-mappings.json');

// Создать сервис
const mapperService = new MapperService(moySkladClient, orderMappingStore);

// Инициализировать (обязательно при запуске)
await mapperService.getOfferIdAttributeId();
await mapperService.loadMappings();
```

## Использование

### 1. Получение ID атрибута offerId_M2

```javascript
// Получить ID атрибута из метаданных МойСклад
const attributeId = await mapperService.getOfferIdAttributeId();
console.log('ID атрибута:', attributeId);
```

### 2. Загрузка маппингов товаров

```javascript
// Загрузить все маппинги из МойСклад
const count = await mapperService.loadMappings();
console.log(`Загружено ${count} маппингов`);
```

### 3. Маппинг offerId_M2 → externalCode

```javascript
// Получить externalCode по offerId_M2
const externalCode = mapperService.mapOfferIdToExternalCode('OFFER-123');

if (externalCode) {
  console.log('Найден externalCode:', externalCode);
} else {
  console.log('Маппинг не найден');
}
```

### 4. Маппинг externalCode → offerId_M2

```javascript
// Получить offerId_M2 по externalCode
const offerId_M2 = mapperService.mapExternalCodeToOfferId('EXT-456');

if (offerId_M2) {
  console.log('Найден offerId_M2:', offerId_M2);
} else {
  console.log('Маппинг не найден');
}
```

### 5. Сохранение маппинга заказа

```javascript
// Сохранить связь между заказами M2 и МойСклад
await mapperService.saveOrderMapping('M2-ORDER-789', 'MS-ORDER-UUID-123');
console.log('Маппинг заказа сохранен');
```

### 6. Получение маппинга заказа

```javascript
// Получить ID заказа МойСклад по ID заказа M2
const moySkladOrderId = await mapperService.getMoySkladOrderId('M2-ORDER-789');

if (moySkladOrderId) {
  console.log('Найден заказ МойСклад:', moySkladOrderId);
} else {
  console.log('Маппинг заказа не найден');
}
```

### 7. Получение статистики

```javascript
// Получить статистику маппингов
const stats = mapperService.getStats();
console.log('Всего маппингов:', stats.totalMappings);
console.log('ID атрибута:', stats.offerIdAttributeId);
```

### 8. Получение списка offerId_M2 (для синхронизации с M2)

```javascript
// Получить только список offerId_M2 без других данных товара
// Используется для безопасной синхронизации остатков с M2
const offerIds_M2 = mapperService.getAllOfferIds();
console.log('OfferIds для M2:', offerIds);
// Результат: ['OFFER-001', 'OFFER-002', ...]
```

### 9. Получение списка externalCode (для запроса остатков)

```javascript
// Получить список externalCode для запроса остатков из МойСклад
const externalCodes = mapperService.getAllExternalCodes();
console.log('ExternalCodes для МойСклад:', externalCodes);
// Результат: ['EXT-001', 'EXT-002', ...]
```

## Пример полного цикла работы

```javascript
const MapperService = require('./src/services/mapperService');
const MoySkladClient = require('./src/api/moySkladClient');
const OrderMappingStore = require('./src/storage/orderMappingStore');

async function main() {
  // 1. Инициализация
  const moySkladClient = new MoySkladClient();
  const orderMappingStore = new OrderMappingStore();
  const mapper = new MapperService(moySkladClient, orderMappingStore);
  
  // 2. Загрузка маппингов при запуске
  await mapper.getOfferIdAttributeId();
  const count = await mapper.loadMappings();
  console.log(`Система готова. Загружено ${count} маппингов товаров.`);
  
  // 3. Обработка заказа из M2
  const m2Order = {
    id: 'M2-12345',
    items: [
      { offerId_M2: 'OFFER-001', quantity: 2 },
      { offerId_M2: 'OFFER-002', quantity: 1 }
    ]
  };
  
  // 4. Маппинг товаров заказа
  const mappedItems = [];
  for (const item of m2Order.items) {
    const externalCode = mapper.mapOfferIdToExternalCode(item.offerId_M2);
    
    if (!externalCode) {
      console.error(`Товар ${item.offerId_M2} не имеет маппинга!`);
      continue;
    }
    
    mappedItems.push({
      externalCode,
      quantity: item.quantity
    });
  }
  
  // 5. Создание заказа в МойСклад (псевдокод)
  // const msOrder = await moySkladClient.createCustomerOrder(mappedItems);
  
  // 6. Сохранение маппинга заказа
  // await mapper.saveOrderMapping(m2Order.id, msOrder.id);
  
  console.log('Заказ обработан успешно');
}

main().catch(console.error);
```

## Обработка ошибок

### Отсутствующий маппинг товара

```javascript
const externalCode = mapper.mapOfferIdToExternalCode('UNKNOWN-OFFER');

if (!externalCode) {
  // Маппинг не найден - ошибка будет залогирована автоматически
  console.error('Товар не найден в маппинге');
  // Пометить заказ для ручной обработки
}
```

### Отсутствующий маппинг заказа

```javascript
const moySkladOrderId = await mapper.getMoySkladOrderId('UNKNOWN-ORDER');

if (!moySkladOrderId) {
  // Маппинг заказа не найден - ошибка будет залогирована автоматически
  console.error('Заказ не найден в маппинге');
  // Пропустить создание отгрузки
}
```

## Логирование

Сервис автоматически логирует следующие события:

- **INFO**: Успешная инициализация, загрузка маппингов
- **ERROR**: Отсутствующие маппинги (с идентификаторами), ошибки API, ошибки файлов

Пример лога ошибки:
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "level": "error",
  "message": "Маппинг не найден для offerId_M2",
  "errorType": "MAPPING_ERROR",
  "offerId_M2": "OFFER-123",
  "identifiers": {
    "offerId_M2": "OFFER-123"
  }
}
```

## Требования

- Атрибут `offerId_M2` должен быть создан в МойСклад
- Товары должны иметь заполненные поля `externalCode` и атрибут `offerId_M2`
- Файл маппингов заказов должен быть доступен для записи

## Связанные требования

- **1.5**: Чтение externalCode и offerId_M2 из МойСклад
- **2.2**: Маппинг позиций заказа при создании заказа
- **8.1**: Сохранение маппингов заказов
- **8.2**: Получение маппингов заказов для обработки отгрузок
