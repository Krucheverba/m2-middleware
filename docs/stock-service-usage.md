# StockService - Руководство по использованию

## Обзор

`StockService` отвечает за синхронизацию остатков товаров между МойСклад и Яндекс.Маркет (M2). Сервис обеспечивает:

- Обработку webhook событий от МойСклад в реальном времени
- Резервную синхронизацию через cron job
- Изоляцию данных (в M2 передаются только `offerId_M2` и `count`)

## Инициализация

```javascript
const StockService = require('./src/services/stockService');

const stockService = new StockService(
  moySkladClient,   // Клиент для работы с API МойСклад
  yandexClient,     // Клиент для работы с API Яндекс.Маркет
  mapperService     // Сервис маппинга между системами
);
```

## Основные методы

### 1. handleStockWebhook(webhookData)

Обрабатывает webhook события от МойСклад о изменении остатков.

**Параметры:**
- `webhookData` - Данные webhook от МойСклад

**Пример использования:**
```javascript
// В Express endpoint
app.post('/webhook/moysklad', async (req, res) => {
  try {
    await stockService.handleStockWebhook(req.body);
    res.status(200).json({ status: 'OK' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Что происходит:**
1. Извлекается ID товара из webhook
2. Получаются остатки из МойСклад
3. Выполняется маппинг `externalCode` → `offerId_M2`
4. Обновляется остаток в M2 (только `offerId_M2` и `count`)

**Проверяет требования:** 1.1

### 2. syncAllStocks()

Выполняет полную синхронизацию всех остатков (резервный механизм).

**Возвращает:**
```javascript
{
  total: 100,      // Всего товаров для синхронизации
  synced: 95,      // Успешно синхронизировано
  skipped: 3,      // Пропущено (нет маппинга)
  errors: 2        // Ошибки при синхронизации
}
```

**Пример использования:**
```javascript
// В cron job
cron.schedule('*/10 * * * *', async () => {
  try {
    const stats = await stockService.syncAllStocks();
    logger.info('Синхронизация остатков завершена', stats);
  } catch (error) {
    logger.error('Ошибка синхронизации остатков', { error: error.message });
  }
});
```

**Что происходит:**
1. Получается список всех `externalCode` из `MapperService`
2. Для каждого товара запрашиваются остатки из МойСклад
3. Выполняется маппинг `externalCode` → `offerId_M2`
4. Обновляются остатки в M2 (только `offerId_M2` и `count`)

**Проверяет требования:** 1.2, 1.3, 5.2

### 3. updateM2Stock(offerId_M2, availableStock)

Обновляет остаток одного товара в Яндекс.Маркет.

**Параметры:**
- `offerId_M2` - Значение атрибута offerId_M2 из МойСклад (ID товара в M2, обязательный)
- `availableStock` - Доступный остаток (число >= 0)

**Пример использования:**
```javascript
await stockService.updateM2Stock('EXT-12345', 'OFFER-999', 20);
```

**Валидация:**
- `offerId_M2` не может быть `null` или пустым
- `availableStock` должен быть числом >= 0

**Что передается в M2:**
```javascript
{
  offerId_M2: 'OFFER-999',  // Только ID товара
  count: 20,                // Только количество
  warehouseId: 0            // ID склада (по умолчанию 0)
}
```

**Что НЕ передается:**
- ❌ `externalCode` (внутренний код МойСклад)
- ❌ Название товара
- ❌ Цена
- ❌ Другие атрибуты

**Проверяет требования:** 1.1, 1.4

## Обработка ошибок

### Товары без маппинга

Если товар не имеет маппинга `offerId_M2`, он пропускается с логированием ошибки:

```javascript
logger.error('Маппинг не найден для товара, пропускаем', {
  errorType: 'MAPPING_ERROR',
  externalCode: 'EXT-12345',
  productId: 'product-uuid',
  identifiers: { externalCode: 'EXT-12345', productId: 'product-uuid' }
});
```

**Проверяет требования:** 1.4, 6.1

### Ошибки API

При ошибках API операция логируется, но система продолжает работу:

```javascript
logger.error('Ошибка при обновлении остатка в M2', {
  errorType: 'API_ERROR',
  externalCode: 'EXT-12345',
  offerId_M2: 'OFFER-999',
  availableStock: 20,
  error: error.message
});
```

### Ошибки webhook

При ошибках обработки webhook система полагается на cron job для eventual consistency:

```javascript
logger.error('Ошибка при обработке webhook остатков', {
  errorType: 'WEBHOOK_ERROR',
  error: error.message,
  webhookData: webhookData
});
// Ошибка не пробрасывается - cron job синхронизирует позже
```

## Изоляция данных

`StockService` строго соблюдает принцип изоляции данных:

### ✅ Что передается в M2
```javascript
{
  offerId_M2: 'OFFER-999',
  count: 20
}
```

### ❌ Что НЕ передается в M2
- `externalCode` (внутренний код МойСклад)
- Название товара
- Цена
- Описание
- Категория
- Любые другие атрибуты

### Логирование

Логи также соблюдают изоляцию:

```javascript
// ✅ Правильно - раздельное логирование
logger.info('Остатки получены из МойСклад', {
  externalCode: 'EXT-12345',
  availableStock: 20
});

logger.info('Остатки отправлены в M2', {
  offerId_M2: 'OFFER-999',
  count: 20
});

// ❌ Неправильно - связывание данных
logger.info('Синхронизация', {
  externalCode: 'EXT-12345',  // Не должно быть вместе!
  offerId_M2: 'OFFER-999',    // Не должно быть вместе!
  count: 20
});
```

## Поток данных

### Webhook (реального времени)

```
МойСклад                Middleware                    M2
    |                        |                         |
    |--- Webhook ----------->|                         |
    |  (product ID)          |                         |
    |                        |                         |
    |<-- Get Stock ----------|                         |
    |--- Stock Data -------->|                         |
    |  (externalCode,        |                         |
    |   totalStock,          |                         |
    |   totalReserve)        |                         |
    |                        |                         |
    |                        |-- Map ----------------->|
    |                        |  externalCode → offerId_M2 |
    |                        |                         |
    |                        |-- Update Stock -------->|
    |                        |  (offerId_M2, count)    |
    |                        |                         |
    |                        |<----- OK ---------------|
```

### Cron Job (резервный механизм)

```
Cron                    Middleware                    M2
 |                          |                          |
 |-- Trigger -------------->|                          |
 |                          |                          |
 |                          |-- Get All ExternalCodes -|
 |                          |  (from MapperService)    |
 |                          |                          |
 |                          |-- Get Stocks ----------->|
 |                          |  (for each externalCode) |
 |                          |<-- Stock Data -----------|
 |                          |                          |
 |                          |-- Map ------------------>|
 |                          |  externalCode → offerId_M2  |
 |                          |                          |
 |                          |-- Batch Update --------->|
 |                          |  (offerId_M2, count) x N |
 |                          |                          |
 |                          |<----- OK ----------------|
```

## Расчет доступного остатка

Доступный остаток рассчитывается как:

```
availableStock = totalStock - totalReserve
```

Где:
- `totalStock` - сумма остатков по всем складам
- `totalReserve` - сумма резервов по всем складам

Пример:
```javascript
// Данные из МойСклад
stockByStore = [
  { stock: 20, reserve: 5 },  // Склад 1
  { stock: 10, reserve: 5 }   // Склад 2
]

// Расчет
totalStock = 20 + 10 = 30
totalReserve = 5 + 5 = 10
availableStock = 30 - 10 = 20

// В M2 отправляется: count = 20
```

## Тестирование

Запустить тесты:

```bash
node test-stock-service.js
```

Тесты проверяют:
- ✅ Обновление остатка одного товара
- ✅ Валидацию параметров
- ✅ Полную синхронизацию всех остатков
- ✅ Обработку webhook событий
- ✅ Изоляцию данных (только offerId_M2 и count в M2)

## Требования

Сервис реализует следующие требования:

- **1.1** - Webhook остатков обновляет M2 немедленно
- **1.2** - Cron job синхронизирует все остатки каждые 10-15 минут
- **1.3** - Синхронизируются только товары с маппингом
- **1.4** - Товары без маппинга пропускаются с ошибкой
- **5.2** - Резервная синхронизация через cron job

## Примеры использования

### Полный пример интеграции

```javascript
const MoySkladClient = require('./src/api/moySkladClient');
const YandexClient = require('./src/api/yandexClient');
const MapperService = require('./src/services/mapperService');
const StockService = require('./src/services/stockService');
const OrderMappingStore = require('./src/storage/orderMappingStore');
const cron = require('node-cron');
const express = require('express');

// Инициализация
const moySkladClient = new MoySkladClient();
const yandexClient = new YandexClient();
const orderMappingStore = new OrderMappingStore();
const mapperService = new MapperService(moySkladClient, orderMappingStore);
const stockService = new StockService(moySkladClient, yandexClient, mapperService);

// Загрузить маппинги при старте
async function init() {
  await mapperService.getOfferIdAttributeId();
  await mapperService.loadMappings();
  console.log('Маппинги загружены');
}

// Webhook endpoint
const app = express();
app.use(express.json());

app.post('/webhook/moysklad', async (req, res) => {
  try {
    await stockService.handleStockWebhook(req.body);
    res.status(200).json({ status: 'OK' });
  } catch (error) {
    logger.error('Ошибка webhook', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Cron job для резервной синхронизации (каждые 10 минут)
cron.schedule('*/10 * * * *', async () => {
  try {
    const stats = await stockService.syncAllStocks();
    logger.info('Синхронизация завершена', stats);
  } catch (error) {
    logger.error('Ошибка синхронизации', { error: error.message });
  }
});

// Запуск
init().then(() => {
  app.listen(3000, () => {
    console.log('Сервер запущен на порту 3000');
  });
});
```

## См. также

- [Архитектура потоков данных](./architecture-data-flow.md)
- [Синхронизация остатков с минимизацией данных](./stock-sync-privacy.md)
- [Использование MapperService](./mapper-service-usage.md)
