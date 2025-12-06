# MapperService - Быстрый старт

## Что это?

`MapperService` - сервис для маппинга товаров и заказов между МойСклад и Яндекс.Маркет (M2).

## Быстрый старт

```javascript
const MapperService = require('./src/services/mapperService');
const MoySkladClient = require('./src/api/moySkladClient');
const OrderMappingStore = require('./src/storage/orderMappingStore');

// Инициализация
const mapper = new MapperService(
  new MoySkladClient(),
  new OrderMappingStore()
);

// Загрузка маппингов (при запуске приложения)
await mapper.getOfferIdAttributeId();
await mapper.loadMappings();

// Использование
const externalCode = mapper.mapOfferIdToExternalCode('OFFER-123');
const offerId = mapper.mapExternalCodeToOfferId('EXT-456');
```

## Основные методы

| Метод | Описание |
|-------|----------|
| `getOfferIdAttributeId()` | Получить ID атрибута offerId_M2 |
| `loadMappings()` | Загрузить маппинги товаров |
| `mapOfferIdToExternalCode(offerId)` | M2 → МойСклад |
| `mapExternalCodeToOfferId(externalCode)` | МойСклад → M2 |
| `saveOrderMapping(m2OrderId, msOrderId)` | Сохранить маппинг заказа |
| `getMoySkladOrderId(m2OrderId)` | Получить маппинг заказа |

## Тестирование

```bash
# Базовые тесты
node test-mapper.js

# Интеграционные тесты
node test-mapper-integration.js

# Граничные случаи
node test-mapper-edge-cases.js
```

## Документация

Полная документация: [docs/mapper-service-usage.md](docs/mapper-service-usage.md)

## Требования

- Node.js 18+
- Атрибут `offerId_M2` в МойСклад
- Товары с заполненными `externalCode` и `offerId_M2`
