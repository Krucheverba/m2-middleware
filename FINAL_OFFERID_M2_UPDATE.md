# Финальное обновление терминологии: offerId → offerId_M2

## Цель

Завершить обновление всей кодовой базы, спецификаций и документации для использования единой терминологии `offerId_M2` вместо просто `offerId`.

## Обоснование

1. **Точность**: `offerId_M2` - это конкретный атрибут в МойСклад, а не просто ID
2. **Ясность**: Четко показывает что это значение атрибута из МойСклад для маппинга на M2
3. **Избежание путаницы**: Отличает от других возможных ID в системе
4. **Консистентность**: Единая терминология во всей кодовой базе

## Что было обновлено в этом раунде

### 1. Спецификация дизайна (.kiro/specs/moysklad-yandex-integration/design.md)

**Обновлено 12 вхождений:**

1. Overview: `offerId ↔ externalCode` → `offerId_M2 ↔ externalCode`
2. MoySkladClient комментарий: `offerId mapping` → `offerId_M2 mapping`
3. MoySkladClient метод: `updateM2Stock(externalCode, offerId, quantity)` → `updateM2Stock(externalCode, offerId_M2, quantity)`
4. MapperService методы:
   - `mapOfferIdToExternalCode(offerId)` → `mapOfferIdToExternalCode(offerId_M2)`
   - `mapExternalCodeToOfferId(externalCode)` → `mapExternalCodeToOfferId(externalCode)` (возвращает offerId_M2)
5. Product Mapping модель: `offerId: string` → `offerId_M2: string`
6. M2 Order модель: `offerId: string` → `offerId_M2: string`
7. Property 1: `offerId mapping` → `offerId_M2 mapping`
8. Property 2: `offerId populated` → `offerId_M2 populated`
9. Property 4: `maps to offerId correctly` → `maps to offerId_M2 correctly`
10. Property 7: `each offerId` → `each offerId_M2`
11. Property 18: `offerId and externalCode` → `offerId_M2 and externalCode`
12. Property 20: `unmapped offerIds` → `unmapped offerIds_M2`
13. Error Categories: `offerId and externalCode` → `offerId_M2 and externalCode`
14. Mapping Errors: `offerId, externalCode` → `offerId_M2, externalCode`
15. Пример теста: `p.offerId` → `p.offerId_M2`

### 2. Список задач (.kiro/specs/moysklad-yandex-integration/tasks.md)

**Обновлено 1 вхождение:**

1. Задача 4.1: `ExternalCode правильно маппится на offerId` → `ExternalCode правильно маппится на offerId_M2`

### 3. Требования (.kiro/specs/moysklad-yandex-integration/requirements.md)

**Обновлено 5 вхождений:**

1. Glossary: Объединены определения `offerId` и `offerId_M2` в одно четкое определение
2. Glossary: `SKU Mapping` обновлен для использования `offerId_M2`
3. Требование 1.1: `using the offerId` → `using the offerId_M2`
4. Требование 2.2: `map each offerId from M2` → `map each offerId_M2 from M2`
5. Требование 6.1: `offerId from M2` → `offerId_M2 from M2`
6. Требование 6.3: `unmapped offerIds` → `unmapped offerIds_M2`

## Ключевые концепции (обновлено)

### Маппинг товаров
```
МойСклад                         M2 (Яндекс.Маркет)
┌──────────────────┐            ┌───────────────┐
│ externalCode     │ ←────────→ │ offerId_M2    │
│ (EXT-123)        │            │ (OFFER-999)   │
└──────────────────┘            └───────────────┘
         ↓
┌──────────────────┐
│ Атрибут товара:  │
│ offerId_M2       │
│ = "OFFER-999"    │
└──────────────────┘
```

### Что передается в M2

**ТОЛЬКО эти данные:**
- `offerId_M2` - значение атрибута из МойСклад
- `count` - количество товара
- `warehouseId` - ID склада (опционально)

**НЕ передаются:**
- `externalCode` - внутренний код МойСклад
- `name` - название товара
- `price` - цена
- Любые другие данные из МойСклад

### Методы MapperService

```javascript
// Маппинг offerId_M2 → externalCode
async mapOfferIdToExternalCode(offerId_M2) {
  // Возвращает externalCode для данного offerId_M2
}

// Маппинг externalCode → offerId_M2
async mapExternalCodeToOfferId(externalCode) {
  // Возвращает offerId_M2 для данного externalCode
}
```

## Предыдущие обновления (из OFFERID_M2_TERMINOLOGY_UPDATE.md)

### Код
1. `src/logger.js` - обновлены комментарии JSDoc

### Тесты
1. `test-stock-service.js` - обновлена терминология в 4 местах
2. `test-logging.js` - уже использовал `offerId_M2` ✅
3. `test-logging-detailed.js` - уже использовал `offerId_M2` ✅

### Документация
1. `docs/stock-service-usage.md` - 15+ обновлений
2. `docs/order-service-usage.md` - 3 обновления
3. `docs/architecture-data-flow.md` - 10+ обновлений
4. `docs/webhook-endpoint-usage.md` - 1 обновление
5. `docs/stock-sync-privacy.md` - 4 обновления
6. `docs/logging-guide.md` - 3 обновления
7. `LOGGING_IMPLEMENTATION_SUMMARY.md` - 2 обновления

## Статус обновления

### ✅ Полностью обновлено
- Спецификация дизайна (design.md)
- Список задач (tasks.md)
- Основной код (src/)
- Тесты (test-*.js)
- Документация (docs/)
- Резюме (SUMMARY.md файлы)

### Проверка консистентности

Выполнен поиск по всей кодовой базе:
```bash
grep -r "offerId[^_]" --include="*.js" --include="*.md" .
```

Все найденные вхождения проверены и обновлены где необходимо.

## Примеры использования (обновлено)

### Синхронизация остатков

```javascript
// Получить offerId_M2 для товара
const offerId_M2 = mapperService.mapExternalCodeToOfferId(externalCode);

if (!offerId_M2) {
  logger.logMappingError(
    'Маппинг не найден для товара',
    { externalCode, offerId_M2: null }
  );
  return;
}

// Обновить остаток в M2 (передаём ТОЛЬКО offerId_M2 и count)
await yandexClient.updateStocks([{
  offerId_M2: offerId_M2,
  count: availableStock,
  warehouseId: 0
}]);
```

### Обработка заказов

```javascript
// Маппинг позиций заказа
for (const item of order.items) {
  const externalCode = mapperService.mapOfferIdToExternalCode(item.offerId_M2);
  
  if (!externalCode) {
    unmappedOfferIds_M2.push(item.offerId_M2);
  }
}

if (unmappedOfferIds_M2.length > 0) {
  logger.logOrderError(
    'Заказ содержит немаппированные товары',
    order.id,
    unmappedOfferIds_M2
  );
}
```

### Логирование ошибок

```javascript
logger.logMappingError(
  'Маппинг не найден для offerId_M2',
  { 
    offerId_M2: 'OFFER-123', 
    externalCode: null 
  }
);

logger.logOrderError(
  'Заказ содержит немаппированные товары',
  'm2-order-456',
  ['OFFER-111', 'OFFER-222']  // unmappedOfferIds_M2
);
```

## Итог

Теперь **вся кодовая база** использует единую и точную терминологию `offerId_M2`:

- ✅ Спецификации (requirements.md, design.md, tasks.md)
- ✅ Исходный код (src/)
- ✅ Тесты (test-*.js)
- ✅ Документация (docs/)
- ✅ Резюме и руководства

Это обеспечивает:
1. **Ясность** - понятно что это атрибут из МойСклад
2. **Точность** - отражает реальную архитектуру
3. **Консистентность** - единая терминология везде
4. **Избежание путаницы** - нет двусмысленности

## Файлы обновлены в этом раунде

1. `.kiro/specs/moysklad-yandex-integration/design.md` - 15 обновлений
2. `.kiro/specs/moysklad-yandex-integration/tasks.md` - 1 обновление
3. `.kiro/specs/moysklad-yandex-integration/requirements.md` - 6 обновлений
4. `FINAL_OFFERID_M2_UPDATE.md` - этот документ

## Следующие шаги

Обновление терминологии завершено. Все файлы теперь используют `offerId_M2` для обозначения идентификатора товара из M2 (Яндекс.Маркет), который хранится как атрибут в МойСклад.
