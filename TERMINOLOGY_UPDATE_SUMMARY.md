# Сводка обновления терминологии

## Обзор

Обновлена терминология в коде для большей ясности: переменные `offerId` переименованы в `offerId_M2`, чтобы явно указать, что это значение атрибута `offerId_M2` из МойСклад, которое содержит ID товара в M2 (Яндекс.Маркет).

## Причина изменения

В системе используется кастомный атрибут `offerId_M2` в МойСклад для хранения ID товара в M2. Для ясности и избежания путаницы, все переменные, которые хранят это значение, теперь называются `offerId_M2` вместо просто `offerId`.

## Изменённые файлы

### src/services/mapperService.js
- ✓ `mapOfferIdToExternalCode(offerId)` → `mapOfferIdToExternalCode(offerId_M2)`
- ✓ `mapExternalCodeToOfferId(externalCode)` → возвращает `offerId_M2`
- ✓ Внутренние переменные `offerId` → `offerId_M2`
- ✓ Обновлены комментарии и JSDoc

### src/services/stockService.js
- ✓ `updateM2Stock(offerId, ...)` → `updateM2Stock(offerId_M2, ...)`
- ✓ Все переменные `offerId` → `offerId_M2`
- ✓ Обновлены комментарии: "ТОЛЬКО offerId_M2 и count"
- ✓ Обновлены логи для использования `offerId_M2`

### src/services/orderService.js
- ✓ Переменные `offerId` → `offerId_M2` в методе `_mapOrderItems()`
- ✓ `unmappedOfferIds` → `unmappedOfferIds_M2`
- ✓ Обновлены комментарии: "Маппинг offerId_M2 -> externalCode"

### src/api/yandexClient.js
- ✓ Обновлены комментарии в методе `updateStocks()`
- ✓ Добавлено пояснение: "offerId содержит значение атрибута offerId_M2 из МойСклад"

### docs/resilience-guide.md
- ✓ Обновлены примеры кода для использования `offerId_M2`
- ✓ Добавлены комментарии о том, что это значение атрибута из МойСклад

### RESILIENCE_IMPLEMENTATION_SUMMARY.md
- ✓ Добавлен раздел "Важно" с пояснением терминологии
- ✓ Указано, что `offerId_M2` - это значение атрибута offerId_M2 из МойСклад

## Структура данных

### Маппинг товаров

```
МойСклад                          M2 (Яндекс.Маркет)
┌─────────────────────┐          ┌──────────────┐
│ Product             │          │ Offer        │
│ - externalCode      │◄────────►│ - sku        │
│ - attributes:       │          └──────────────┘
│   - offerId_M2 ─────┼──────────────────┘
│     (значение)      │
└─────────────────────┘
```

### Поток данных

1. **Загрузка маппингов** (MapperService.loadMappings):
   ```javascript
   // Получаем товары из МойСклад
   const products = await moySkladClient.getProducts();
   
   // Извлекаем значение атрибута offerId_M2
   const offerId_M2 = product.attributes.find(
     attr => attr.id === offerIdAttributeId
   )?.value;
   
   // Сохраняем маппинг
   offerIdToExternalCodeMap.set(offerId_M2, externalCode);
   ```

2. **Синхронизация остатков** (StockService.syncAllStocks):
   ```javascript
   // Получаем externalCode из маппинга
   const externalCodes = mapperService.getAllExternalCodes();
   
   // Для каждого externalCode получаем offerId_M2
   const offerId_M2 = mapperService.mapExternalCodeToOfferId(externalCode);
   
   // Обновляем остаток в M2 используя offerId_M2
   await updateM2Stock(offerId_M2, availableStock);
   ```

3. **Обработка заказов** (OrderService.createMoySkladOrder):
   ```javascript
   // Заказ из M2 содержит item.offerId (это и есть offerId_M2)
   const offerId_M2 = item.offerId;
   
   // Маппим на externalCode для создания заказа в МойСклад
   const externalCode = mapperService.mapOfferIdToExternalCode(offerId_M2);
   ```

## Терминология

### Правильно ✓

- `offerId_M2` - значение атрибута offerId_M2 из МойСклад (ID товара в M2)
- `externalCode` - идентификатор товара в МойСклад
- `offerId_M2` используется для обновления остатков в M2
- `externalCode` используется для получения остатков из МойСклад

### Неправильно ✗

- ~~`offerId`~~ - неясно, откуда это значение
- ~~"ID товара в M2"~~ - лучше использовать `offerId_M2`
- ~~"offerId из M2"~~ - на самом деле это значение хранится в МойСклад

## Тестирование

Все тесты обновлены и проходят успешно:

```bash
✓ test-mapper.js - 12/12 тестов пройдено
✓ test-stock-service.js - 7/7 тестов пройдено
✓ test-order-service.js - 13/13 тестов пройдено
✓ test-resilience.js - 6/6 тестов пройдено
✓ test-mapper-edge-cases.js - все тесты пройдены
✓ test-mapper-integration.js - все тесты пройдены
✓ test-logging.js - все тесты пройдены
✓ test-logging-detailed.js - все тесты пройдены
```

### Обновлённые тестовые файлы:

- **test-mapper.js** - обновлены переменные `offerId` → `offerId_M2`
- **test-resilience.js** - обновлены mock методы и переменные
- **test-logging.js** - обновлены примеры логирования
- **test-logging-detailed.js** - обновлены примеры логирования
- **test-mapper-edge-cases.js** - обновлены сообщения об ошибках

## Обратная совместимость

Изменения касаются только внутренних переменных и комментариев. API методов не изменился:

- `mapOfferIdToExternalCode()` - имя метода осталось прежним
- `mapExternalCodeToOfferId()` - имя метода осталось прежним
- `updateM2Stock()` - имя метода осталось прежним

Только параметры и внутренние переменные переименованы для ясности.

## Заключение

Обновление терминологии делает код более понятным и явно указывает на источник данных:
- `offerId_M2` - всегда значение атрибута offerId_M2 из МойСклад
- Это значение используется как ID товара (sku) в M2 (Яндекс.Маркет)
- Маппинг: `offerId_M2` ↔ `externalCode`

Все тесты проходят, обратная совместимость сохранена.
