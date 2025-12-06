# OrderService - Документация по использованию

## Обзор

OrderService отвечает за перенос заказов из Яндекс.Маркет (M2) в МойСклад. Сервис выполняет polling новых заказов, маппинг товаров и создание заказов покупателя с резервированием.

## Основные функции

### 1. Polling и обработка новых заказов

```javascript
const results = await orderService.pollAndProcessOrders();
```

**Что делает:**
- Получает новые заказы из M2 со статусом PROCESSING
- Обрабатывает каждый заказ (маппинг товаров, создание в МойСклад)
- Сохраняет маппинг заказов для последующей обработки отгрузок
- Предотвращает дублирование обработки

**Возвращает:**
```javascript
{
  processed: 1,      // Количество обработанных заказов
  successful: 1,     // Успешно созданных
  failed: 0,         // Неудачных
  errors: []         // Массив ошибок
}
```

### 2. Создание заказа в МойСклад

```javascript
const moySkladOrder = await orderService.createMoySkladOrder(m2Order);
```

**Что делает:**
- Маппит все позиции заказа (offerId_M2 -> externalCode)
- Валидирует что все товары маппированы
- Создает заказ покупателя в МойСклад с резервированием
- Сохраняет маппинг заказа (M2 ID -> МойСклад ID)

**Выбрасывает ошибку если:**
- Заказ содержит немаппированные товары
- Не удалось создать заказ в МойСклад
- Не удалось сохранить маппинг заказа

### 3. Polling и обработка отгруженных заказов

```javascript
const results = await orderService.processShippedOrders();
```

**Что делает:**
- Получает заказы из M2 со статусом SHIPPED
- Для каждого отгруженного заказа создает отгрузку в МойСклад
- Использует сохраненный маппинг заказов для связи с заказом покупателя
- Автоматически закрывает заказ покупателя после создания отгрузки

**Возвращает:**
```javascript
{
  processed: 1,      // Количество обработанных отгрузок
  successful: 1,     // Успешно созданных
  failed: 0,         // Неудачных
  errors: []         // Массив ошибок
}
```

### 4. Создание отгрузки в МойСклад

```javascript
const shipment = await orderService.createShipment(m2OrderId);
```

**Что делает:**
- Находит маппинг заказа (M2 ID -> МойСклад ID)
- Создает отгрузку (Demand) в МойСклад, ссылающуюся на заказ покупателя
- Декрементирует остатки товаров в МойСклад
- Заказ покупателя автоматически закрывается при создании отгрузки

**Выбрасывает ошибку если:**
- Маппинг заказа не найден (неизвестный M2 order ID)
- Не удалось создать отгрузку в МойСклад

## Обработка ошибок

### Немаппированные товары

Если заказ содержит товары без маппинга, сервис:
1. Логирует ошибку с деталями (M2 order ID, список unmapped offerIds)
2. Выбрасывает исключение
3. Помечает заказ для ручной обработки

```javascript
// Пример лога ошибки
{
  errorType: 'MAPPING_ERROR',
  m2OrderId: '12345',
  unmappedOfferIds: ['OFFER999', 'OFFER888'],
  identifiers: {
    m2OrderId: '12345',
    unmappedOfferIds: ['OFFER999', 'OFFER888']
  }
}
```

### Неизвестные заказы при отгрузке

Если отгрузка получена для заказа без маппинга, сервис:
1. Логирует ошибку с деталями (M2 order ID)
2. Выбрасывает исключение
3. Пропускает создание отгрузки

```javascript
// Пример лога ошибки
{
  errorType: 'MAPPING_ERROR',
  m2OrderId: 'unknown-123',
  identifiers: {
    m2OrderId: 'unknown-123'
  }
}
```

### Изоляция ошибок

При polling заказов или отгрузок, если один элемент не удалось обработать:
- Ошибка логируется
- Обработка продолжается для остальных элементов
- Результат содержит информацию об ошибках

## Формат заказа M2

```javascript
{
  id: '12345',
  status: 'PROCESSING',
  items: [
    {
      offerId_M2: 'OFFER001',
      count: 2,
      price: 1000,
      shopSku: 'SKU001',
      offerName: 'Товар 1'
    }
  ],
  delivery: {
    address: {
      postcode: '123456',
      city: 'Москва',
      street: 'Ленина',
      house: '10',
      apartment: '5'
    },
    recipient: {
      firstName: 'Иван',
      lastName: 'Иванов',
      phone: '+79001234567'
    }
  }
}
```

## Формат заказа МойСклад

```javascript
{
  name: 'M2-12345',
  description: 'Заказ из Яндекс.Маркет M2, ID: 12345\nАдрес доставки: ...\nПолучатель: ...',
  positions: [
    {
      assortment: {
        meta: {
          href: 'https://api.moysklad.ru/api/remap/1.2/entity/product/metadata?filter=externalCode=EXT001',
          type: 'product',
          mediaType: 'application/json'
        }
      },
      quantity: 2,
      price: 100000,  // В копейках
      reserve: 2      // Резервирование
    }
  ]
}
```

## Формат отгрузки МойСклад

```javascript
{
  customerOrder: {
    meta: {
      href: 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/uuid-here',
      type: 'customerorder',
      mediaType: 'application/json'
    }
  }
}
```

## Использование в cron job

```javascript
const cron = require('node-cron');

// Polling новых заказов каждые 5 минут
cron.schedule('*/5 * * * *', async () => {
  try {
    const results = await orderService.pollAndProcessOrders();
    logger.info('Order polling completed', results);
  } catch (error) {
    logger.error('Order polling failed', { error: error.message });
  }
});

// Polling отгруженных заказов каждые 5 минут
cron.schedule('*/5 * * * *', async () => {
  try {
    const results = await orderService.processShippedOrders();
    logger.info('Shipment polling completed', results);
  } catch (error) {
    logger.error('Shipment polling failed', { error: error.message });
  }
});
```

## Статистика и управление

### Получить статистику

```javascript
const stats = orderService.getStats();
// { processedOrdersCount: 42 }
```

### Очистить кэш обработанных заказов

```javascript
orderService.clearProcessedOrders();
```

Полезно для:
- Тестирования
- Периодической очистки памяти
- Повторной обработки заказов

## Требования

Сервис проверяет следующие требования:
- **2.1**: Создание заказов покупателя в МойСклад с резервированием
- **2.2**: Маппинг позиций заказа (offerId_M2 -> externalCode)
- **2.3**: Обработка заказов с немаппированными товарами
- **2.4**: Сохранение маппинга заказов
- **3.1**: Создание отгрузок для заказов со статусом SHIPPED
- **3.2**: Ссылка на заказ покупателя при создании отгрузки
- **3.4**: Закрытие заказа покупателя после отгрузки
- **3.5**: Обработка неизвестных ID заказов при отгрузке
- **5.3**: Polling заказов с настроенным интервалом

## Зависимости

- **YandexClient**: Для получения заказов из M2
- **MoySkladClient**: Для создания заказов в МойСклад
- **MapperService**: Для маппинга товаров и сохранения маппингов заказов

## Пример инициализации

```javascript
const YandexClient = require('./api/yandexClient');
const MoySkladClient = require('./api/moySkladClient');
const MapperService = require('./services/mapperService');
const OrderService = require('./services/orderService');

const yandexClient = new YandexClient();
const moySkladClient = new MoySkladClient();
const mapperService = new MapperService(moySkladClient, orderMappingStore);

const orderService = new OrderService(
  yandexClient,
  moySkladClient,
  mapperService
);

// Инициализация маппингов
await mapperService.getOfferIdAttributeId();
await mapperService.loadMappings();

// Запуск polling новых заказов
await orderService.pollAndProcessOrders();

// Запуск polling отгруженных заказов
await orderService.processShippedOrders();
```
