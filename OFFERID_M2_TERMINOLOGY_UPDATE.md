# Обновление терминологии: offerId → offerId_M2

## Цель

Привести всю кодовую базу, тесты и документацию к единой терминологии `offerId_M2` вместо просто `offerId`, так как мы работаем исключительно с атрибутом `offerId_M2` из МойСклад.

## Что было изменено

### 1. Логгер (src/logger.js)

**Обновлены комментарии в JSDoc:**
- `logMappingError()` - параметр `identifiers` теперь описан как `(offerId_M2, externalCode, productId и т.д.)`
- `logOrderError()` - параметр переименован с `unmappedOfferIds` на `unmappedOfferIds_M2`

### 2. Тесты

**test-stock-service.js:**
- Тест 1: `offerId должен совпадать` → `offerId_M2 должен совпадать`
- Тест 2: `null offerId` → `null offerId_M2`
- Тест 4: `offerId должен совпадать` → `offerId_M2 должен совпадать`
- Тест 7: `только offerId и count` → `только offerId_M2 и count`

**test-logging.js:**
- Уже использовал `offerId_M2` ✅

**test-logging-detailed.js:**
- Уже использовал `offerId_M2` ✅

### 3. Документация

**docs/stock-service-usage.md:**
- Описание: `offerId` → `offerId_M2`
- Параметры методов: `offerId` → `offerId_M2`
- Примеры кода: все `offerId` → `offerId_M2`
- Диаграммы: `(offerId, count)` → `(offerId_M2, count)`
- Логирование: `offerId` → `offerId_M2`

**docs/order-service-usage.md:**
- Маппинг: `offerId -> externalCode` → `offerId_M2 -> externalCode`
- Примеры: `offerId: 'OFFER001'` → `offerId_M2: 'OFFER001'`
- Требования: `offerId` → `offerId_M2`

**docs/architecture-data-flow.md:**
- Диаграммы: `(по offerId)` → `(по offerId_M2)`
- Потоки данных: все `offerId` → `offerId_M2`
- Примеры JSON: `"offerId"` → `"offerId_M2"`
- Маппинг: `offerId ↔ externalCode` → `offerId_M2 ↔ externalCode`
- Что знает M2: `offerId` → `offerId_M2`

**docs/webhook-endpoint-usage.md:**
- Описание компонентов: `offerId` → `offerId_M2`

**docs/stock-sync-privacy.md:**
- Диаграммы: `offerId` → `offerId_M2`
- Примеры кода: все `offerId` → `offerId_M2`

**docs/logging-guide.md:**
- Примеры: `offerId` → `offerId_M2`
- Лучшие практики: `offerId` → `offerId_M2`
- Структура логов: `offerId` → `offerId_M2`

**LOGGING_IMPLEMENTATION_SUMMARY.md:**
- Описание методов: `offerId` → `offerId_M2`

## Почему это важно

1. **Точность терминологии**: `offerId_M2` - это конкретный атрибут в МойСклад, а не просто ID товара
2. **Избежание путаницы**: Ясно показывает что это значение атрибута из МойСклад, а не ID из M2
3. **Соответствие архитектуре**: Подчеркивает что мы работаем с маппингом через атрибут offerId_M2
4. **Консистентность**: Единая терминология во всей кодовой базе

## Ключевые концепции

### Маппинг товаров
```
МойСклад                    M2 (Яндекс.Маркет)
┌─────────────────┐         ┌──────────────┐
│ externalCode    │ ←────→  │ offerId_M2   │
│ (EXT-123)       │         │ (OFFER-999)  │
└─────────────────┘         └──────────────┘
        ↓
┌─────────────────┐
│ Атрибут:        │
│ offerId_M2      │
│ = "OFFER-999"   │
└─────────────────┘
```

### Изоляция данных
В M2 передаются **ТОЛЬКО**:
- `offerId_M2` - значение атрибута из МойСклад
- `count` - количество товара
- `warehouseId` - ID склада (опционально)

**НЕ передаются:**
- `externalCode` - внутренний код МойСклад
- `name` - название товара
- `price` - цена
- Любые другие данные из МойСклад

## Проверка

Все тесты проходят успешно:
```bash
✅ test-stock-service.js - все тесты пройдены
✅ test-logging-detailed.js - все тесты пройдены
✅ test-mapper.js - все тесты пройдены
✅ test-order-service.js - все тесты пройдены
```

## Файлы изменены

### Код
1. `src/logger.js` - обновлены комментарии JSDoc

### Тесты
1. `test-stock-service.js` - обновлена терминология в 4 местах

### Документация
1. `docs/stock-service-usage.md` - 15+ обновлений
2. `docs/order-service-usage.md` - 3 обновления
3. `docs/architecture-data-flow.md` - 10+ обновлений
4. `docs/webhook-endpoint-usage.md` - 1 обновление
5. `docs/stock-sync-privacy.md` - 4 обновления
6. `docs/logging-guide.md` - 3 обновления
7. `LOGGING_IMPLEMENTATION_SUMMARY.md` - 2 обновления

## Итог

Теперь вся кодовая база, тесты и документация используют единую и точную терминологию `offerId_M2`, что отражает реальную архитектуру системы где мы работаем с атрибутом `offerId_M2` из МойСклад для маппинга товаров на M2.
