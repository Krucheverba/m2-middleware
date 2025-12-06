# Синхронизация остатков с минимизацией данных

## Концепция безопасности

При синхронизации остатков с МойСклад на Яндекс.Маркет (M2) передаются **только** следующие данные:
- `offerId` - идентификатор товара в M2 (из файлового маппинга)
- `count` - количество доступного товара

**Скрыты от M2:**
- `product.id` - UUID товара в МойСклад
- `product.offerId` - стандартное поле МойСклад (используется M1)
- Название товара
- Цена
- Другие атрибуты товара
- Информация о складах

## Архитектура защиты данных

```
┌─────────────────┐
│   МойСклад      │
│                 │
│ product.id      │──┐
│ name            │  │
│ price           │  │  Middleware
│ product.offerId │  │  фильтрует
│ stock           │  │  данные
└─────────────────┘  │
                     ↓
              ┌──────────────┐
              │  Middleware  │
              │              │
              │  Маппинг:    │
              │  product.id  │
              │  → offerId   │
              │  (из файла)  │
              │              │
              │  Извлекает:  │
              │  - offerId   │
              │  - count     │
              └──────────────┘
                     ↓
              ┌──────────────┐
              │ Яндекс.Маркет│
              │     (M2)     │
              │              │
              │ offerId: XXX │
              │ count: 10    │
              └──────────────┘
```

## Пример реализации

### 1. Получение остатков из МойСклад

```javascript
// В StockService
async syncAllStocks() {
  // Получить список product.id из файлового маппинга
  const productIds = this.mapperService.getAllProductIds();
  
  const stockUpdates = [];
  
  for (const productId of productIds) {
    // Получить остатки из МойСклад по product.id
    const stockData = await this.moySkladClient.getProductStock(productId);
    
    // Получить offerId для M2 через файловый маппинг
    const offerId = this.mapperService.mapProductIdToOfferId(productId);
    
    if (!offerId) {
      logger.warn('Товар без маппинга пропущен', { productId });
      continue;
    }
    
    // Подготовить данные ТОЛЬКО с offerId и количеством
    stockUpdates.push({
      offerId: offerId,     // Только ID для M2
      count: stockData.availableStock  // Только количество
      // product.id НЕ передается!
      // product.offerId НЕ передается!
      // name НЕ передается!
      // price НЕ передается!
    });
  }
  
  // Отправить в M2 только offerId и count
  await this.yandexClient.updateStocks(stockUpdates);
}
```

### 2. Обработка webhook от МойСклад

```javascript
// В StockService
async handleStockWebhook(webhookData) {
  // Извлечь product.id из webhook payload
  const productId = webhookData.meta.href.split('/').pop();
  
  // Получить остатки по product.id
  const stockData = await this.moySkladClient.getProductStock(productId);
  
  // Маппинг product.id → offerId через файл
  const offerId = this.mapperService.mapProductIdToOfferId(productId);
  
  if (!offerId) {
    logger.error('Товар без маппинга', { productId });
    return;
  }
  
  // Отправить в M2 ТОЛЬКО offerId и количество
  await this.yandexClient.updateStocks([{
    offerId: offerId,                    // Только ID
    count: stockData.availableStock      // Только количество
  }]);
  
  // product.id остается в middleware и не передается в M2
}
```

## Что видит M2

M2 получает только минимальные данные через API Яндекс.Маркет:

```json
{
  "skus": [
    {
      "sku": "OFFER-123",
      "warehouseId": 0,
      "items": [
        {
          "count": 15,
          "type": "FIT",
          "updatedAt": "2024-01-01T12:00:00Z"
        }
      ]
    }
  ]
}
```

**M2 НЕ видит:**
- `product.id` (например, "f8a2da33-bf0a-11ef-0a80-17e3002d7201")
- `product.offerId` (используется M1)
- Название товара (например, "Товар премиум класса")
- Цену в МойСклад
- Информацию о складах
- Другие атрибуты товара

## Преимущества

1. **Безопасность**: Внутренние коды и данные МойСклад не раскрываются
2. **Минимизация данных**: Передается только необходимая информация
3. **Соответствие GDPR**: Принцип минимизации данных
4. **Производительность**: Меньше данных = быстрее передача

## Логирование

При логировании также соблюдается принцип минимизации:

```javascript
// ✅ Правильно - раздельное логирование
logger.info('Остатки получены из МойСклад', {
  productId: 'f8a2da33-bf0a-11ef-0a80-17e3002d7201',
  count: 15
});

logger.info('Остатки отправлены в M2', {
  offerId: '8100-X-clean-EFE-5w-30-5L_DBSA',
  count: 15
});

// ❌ Неправильно - не логируем внутренние данные вместе с offerId
logger.info('Остатки обновлены', {
  productId: 'f8a2da33-bf0a-11ef-0a80-17e3002d7201',  // Не должно быть вместе!
  offerId: '8100-X-clean-EFE-5w-30-5L_DBSA',          // Не должно быть вместе!
  name: 'Товар',                                       // Не нужно!
  count: 15
});
```

## Методы MapperService для безопасной работы

```javascript
// Получить только список offerId (без других данных)
const offerIds = mapperService.getAllOfferIds();
// Результат: ['8100-X-clean_DBSA', '8100-X-clean-C3_DBSA', ...]

// Получить только список product.id (для внутреннего использования)
const productIds = mapperService.getAllProductIds();
// Результат: ['f8a2da33-bf0a-11ef-0a80-17e3002d7201', ...]

// Маппинг один-к-одному без раскрытия дополнительных данных
const offerId = mapperService.mapProductIdToOfferId('f8a2da33-bf0a-11ef-0a80-17e3002d7201');
// Результат: '8100-X-clean_DBSA' (только ID, без других данных товара)

// Обратный маппинг для заказов
const productId = mapperService.mapOfferIdToProductId('8100-X-clean_DBSA');
// Результат: 'f8a2da33-bf0a-11ef-0a80-17e3002d7201' (только ID)
```

## Проверка безопасности

Убедитесь, что в коде:

1. ✅ API запросы к M2 содержат только `offerId` и `count`
2. ✅ Логи не содержат `product.id` вместе с `offerId` в одном сообщении
3. ✅ Webhook обработчики не передают лишние данные
4. ✅ Ошибки логируются с минимальным контекстом
5. ✅ Middleware не читает `product.offerId` (используется M1)

## Заключение

Middleware действует как **фильтр данных**, обеспечивая:
- Маппинг между системами
- Минимизацию передаваемых данных
- Защиту внутренней информации МойСклад
- Соблюдение принципов безопасности
