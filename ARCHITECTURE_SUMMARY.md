# Сводка архитектуры: Изоляция данных

## ✅ Реализованный принцип

Middleware обеспечивает **строгую изоляцию данных** между МойСклад и Яндекс.Маркет (M2) через однонаправленные специализированные потоки.

## Потоки данных

### 1. МойСклад → M2 (Остатки)

**Что передаётся:**
```javascript
{
  offerId: "OFFER-123",  // Только ID товара в M2
  count: 15              // Только количество
}
```

**Что НЕ передаётся:**
- ❌ externalCode (внутренний код МойСклад)
- ❌ Название товара
- ❌ Цена
- ❌ Любые другие атрибуты

**Механизмы:**
- Webhook (реального времени)
- Cron Job (резервный, каждые 10-15 минут)

### 2. M2 → МойСклад (Заказы)

**Что передаётся:**
```javascript
{
  orderId: "M2-ORDER-123",
  items: [
    {
      offerId: "OFFER-123",  // Преобразуется в externalCode
      quantity: 2
    }
  ]
}
```

**Механизм:**
- Polling (каждые 5-10 минут)

### 3. M2 → МойСклад (Отгрузки)

**Что передаётся:**
- Статус SHIPPED
- Ссылка на заказ (через маппинг)

**Механизм:**
- Polling статусов заказов

## Роль MapperService

MapperService выполняет функцию **изолирующего слоя**:

```javascript
// Для синхронизации остатков (МойСклад → M2)
const externalCodes = mapperService.getAllExternalCodes();
// ['EXT-001', 'EXT-002', ...]

for (const externalCode of externalCodes) {
  const stock = await moySkladClient.getProductStock(externalCode);
  const offerId = mapperService.mapExternalCodeToOfferId(externalCode);
  
  // В M2 отправляется ТОЛЬКО offerId и count
  await yandexClient.updateStocks([{
    offerId: offerId,    // Только ID
    count: stock.available  // Только количество
  }]);
}
```

```javascript
// Для создания заказов (M2 → МойСклад)
const m2Orders = await yandexClient.getOrders();

for (const order of m2Orders) {
  const mappedItems = order.items.map(item => {
    const externalCode = mapperService.mapOfferIdToExternalCode(item.offerId);
    return {
      externalCode: externalCode,  // Преобразовано для МойСклад
      quantity: item.quantity
    };
  });
  
  await moySkladClient.createCustomerOrder(mappedItems);
}
```

## Методы изоляции

### 1. Раздельное хранение маппингов

```javascript
class MapperService {
  // Два отдельных Map для изоляции
  offerIdToExternalCodeMap = new Map();  // M2 → МойСклад
  externalCodeToOfferIdMap = new Map();  // МойСклад → M2
}
```

### 2. Методы для безопасного доступа

```javascript
// Получить только offerId (без externalCode)
getAllOfferIds() {
  return Array.from(this.externalCodeToOfferIdMap.values());
}

// Получить только externalCode (без offerId)
getAllExternalCodes() {
  return Array.from(this.offerIdToExternalCodeMap.values());
}
```

### 3. Раздельное логирование

```javascript
// ✅ Правильно - логируем раздельно
logger.info('Остатки из МойСклад', { externalCode: 'EXT-001', count: 15 });
logger.info('Остатки в M2', { offerId: 'OFFER-123', count: 15 });

// ❌ Неправильно - связываем данные
logger.info('Синхронизация', { 
  externalCode: 'EXT-001',  // Не должно быть вместе!
  offerId: 'OFFER-123'      // Не должно быть вместе!
});
```

## Что видит каждая система

### M2 видит:
- ✅ Свои offerId
- ✅ Остатки товаров (count)
- ✅ Статусы своих заказов

### M2 НЕ видит:
- ❌ externalCode из МойСклад
- ❌ Названия товаров из МойСклад
- ❌ Цены в МойСклад
- ❌ ID заказов МойСклад
- ❌ Структуру складов

### МойСклад видит:
- ✅ Свои externalCode
- ✅ Свои товары со всеми атрибутами
- ✅ Атрибут offerId_M2 (для маппинга)
- ✅ Заказы покупателей

### МойСклад НЕ видит:
- ❌ Внутреннюю структуру M2
- ❌ Другие магазины на M2
- ❌ Детали работы M2

## Преимущества архитектуры

1. **Безопасность**: Внутренние данные систем изолированы
2. **Минимизация данных**: Передаётся только необходимое
3. **Простота отладки**: Чёткие границы между системами
4. **Масштабируемость**: Легко добавить другие магазины
5. **Соответствие GDPR**: Принцип минимизации данных

## Проверка соответствия

### Контрольный список

- [x] API запросы к M2 содержат только offerId и count
- [x] API запросы к МойСклад используют externalCode
- [x] Маппинг происходит только в middleware
- [x] Логи не связывают offerId и externalCode
- [x] MapperService изолирует данные
- [x] Документация описывает принципы изоляции

## Тестирование изоляции

```bash
# Проверить что MapperService корректно изолирует данные
node test-mapper.js

# Проверить интеграцию с реальными компонентами
node test-mapper-integration.js

# Проверить граничные случаи
node test-mapper-edge-cases.js
```

Все тесты должны пройти успешно! ✅

## Заключение

Реализованная архитектура обеспечивает:
- ✅ Строгую изоляцию данных между системами
- ✅ Однонаправленные специализированные потоки
- ✅ Минимизацию передаваемых данных
- ✅ Безопасность и соответствие best practices
