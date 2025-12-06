/**
 * Простой тест для проверки OrderService
 */

// Установить переменные окружения перед загрузкой модулей
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign';
process.env.YANDEX_TOKEN = 'test-token';
process.env.MS_TOKEN = 'test-ms-token';
process.env.MS_BASE = 'https://api.moysklad.ru/api/remap/1.2';
process.env.LOG_LEVEL = 'error'; // Минимизировать вывод логов

const OrderService = require('./src/services/orderService');

// Мок для YandexClient
class MockYandexClient {
  constructor() {
    this.orders = [
      {
        id: '12345',
        status: 'PROCESSING',
        items: [
          {
            offerId: 'OFFER001',
            count: 2,
            price: 1000,
            shopSku: 'SKU001',
            offerName: 'Товар 1'
          },
          {
            offerId: 'OFFER002',
            count: 1,
            price: 2000,
            shopSku: 'SKU002',
            offerName: 'Товар 2'
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
    ];
    this.shippedOrders = [];
  }

  async getOrders(filters) {
    if (filters.status === 'PROCESSING') {
      return this.orders;
    }
    if (filters.status === 'SHIPPED') {
      return this.shippedOrders;
    }
    return [];
  }

  async getOrder(orderId) {
    return this.orders.find(o => o.id === orderId) || 
           this.shippedOrders.find(o => o.id === orderId);
  }

  // Вспомогательный метод для тестов - пометить заказ как отгруженный
  markAsShipped(orderId) {
    const orderIndex = this.orders.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
      const order = this.orders[orderIndex];
      order.status = 'SHIPPED';
      this.shippedOrders.push(order);
    }
  }
}

// Мок для MoySkladClient
class MockMoySkladClient {
  constructor() {
    this.createdOrders = [];
    this.createdShipments = [];
  }

  async createCustomerOrder(orderData) {
    const order = {
      id: `ms-order-${Date.now()}`,
      name: orderData.name,
      description: orderData.description,
      positions: orderData.positions
    };
    this.createdOrders.push(order);
    return order;
  }

  async createShipment(shipmentData) {
    const shipment = {
      id: `ms-shipment-${Date.now()}`,
      name: `Отгрузка ${this.createdShipments.length + 1}`,
      customerOrder: shipmentData.customerOrder
    };
    this.createdShipments.push(shipment);
    return shipment;
  }
}

// Мок для MapperService
class MockMapperService {
  constructor() {
    // Маппинг offerId -> product.id (UUID)
    this.mappings = new Map([
      ['OFFER001', 'f8a2da33-bf0a-11ef-0a80-17e3002d7201'],
      ['OFFER002', 'a1b2c3d4-e5f6-11ef-0a80-17e3002d7202']
    ]);
    this.orderMappings = new Map();
  }

  // Обратный маппинг offerId -> product.id
  mapOfferIdToProductId(offerId) {
    return this.mappings.get(offerId) || null;
  }

  // Прямой маппинг product.id -> offerId
  mapProductIdToOfferId(productId) {
    for (const [offerId, prodId] of this.mappings.entries()) {
      if (prodId === productId) {
        return offerId;
      }
    }
    return null;
  }

  async saveOrderMapping(m2OrderId, moySkladOrderId) {
    this.orderMappings.set(m2OrderId, moySkladOrderId);
  }

  async getMoySkladOrderId(m2OrderId) {
    return this.orderMappings.get(m2OrderId) || null;
  }
}

async function runTests() {
  console.log('🧪 Тестирование OrderService...\n');

  const mockYandexClient = new MockYandexClient();
  const mockMoySkladClient = new MockMoySkladClient();
  const mockMapperService = new MockMapperService();
  
  const orderService = new OrderService(
    mockYandexClient,
    mockMoySkladClient,
    mockMapperService
  );

  try {
    // Тест 1: Polling и обработка заказов
    console.log('✓ Тест 1: Polling и обработка заказов');
    const results = await orderService.pollAndProcessOrders();
    console.log(`  Обработано: ${results.processed}`);
    console.log(`  Успешно: ${results.successful}`);
    console.log(`  Неудачно: ${results.failed}`);
    console.assert(results.processed === 1, 'Должен быть обработан 1 заказ');
    console.assert(results.successful === 1, 'Должен быть успешно создан 1 заказ');
    console.assert(results.failed === 0, 'Не должно быть неудачных заказов');

    // Тест 2: Проверка созданного заказа в МойСклад
    console.log('\n✓ Тест 2: Проверка созданного заказа в МойСклад');
    console.assert(mockMoySkladClient.createdOrders.length === 1, 'Должен быть создан 1 заказ');
    const createdOrder = mockMoySkladClient.createdOrders[0];
    console.log(`  Имя заказа: ${createdOrder.name}`);
    console.log(`  Позиций: ${createdOrder.positions.length}`);
    console.assert(createdOrder.name === 'M2-12345', 'Имя заказа должно быть M2-12345');
    console.assert(createdOrder.positions.length === 2, 'Должно быть 2 позиции');

    // Тест 3: Проверка маппинга заказа
    console.log('\n✓ Тест 3: Проверка маппинга заказа');
    const moySkladOrderId = await mockMapperService.getMoySkladOrderId('12345');
    console.log(`  M2 Order ID: 12345 -> МойСклад Order ID: ${moySkladOrderId}`);
    console.assert(moySkladOrderId !== null, 'Маппинг заказа должен быть сохранен');
    console.assert(moySkladOrderId === createdOrder.id, 'ID заказа должен совпадать');

    // Тест 4: Повторный polling не должен создавать дубликаты
    console.log('\n✓ Тест 4: Повторный polling не создает дубликаты');
    const results2 = await orderService.pollAndProcessOrders();
    console.log(`  Обработано: ${results2.processed}`);
    console.log(`  Успешно: ${results2.successful}`);
    console.assert(results2.processed === 0, 'Не должно быть обработано заказов (уже обработан)');
    console.assert(mockMoySkladClient.createdOrders.length === 1, 'Должен остаться 1 заказ');

    // Тест 5: Обработка заказа только с немаппированными товарами
    console.log('\n✓ Тест 5: Обработка заказа только с немаппированными товарами');
    const unmappedOrder = {
      id: '67890',
      status: 'PROCESSING',
      items: [
        {
          offerId: 'OFFER999', // Немаппированный товар
          count: 1,
          price: 500,
          shopSku: 'SKU999',
          offerName: 'Немаппированный товар'
        }
      ]
    };
    
    try {
      await orderService.createMoySkladOrder(unmappedOrder);
      console.error('  ❌ Должна была быть выброшена ошибка');
      process.exit(1);
    } catch (error) {
      console.log(`  Ошибка поймана: ${error.message}`);
      console.assert(
        error.message.includes('не содержит ни одной маппированной позиции'),
        'Ошибка должна указывать что нет маппированных позиций'
      );
    }

    // Тест 5.1: Обработка заказа с частично немаппированными товарами
    console.log('\n✓ Тест 5.1: Обработка заказа с частично немаппированными товарами');
    const partiallyMappedOrder = {
      id: '67891',
      status: 'PROCESSING',
      items: [
        {
          offerId: 'OFFER001', // Маппированный товар
          count: 1,
          price: 1000,
          shopSku: 'SKU001',
          offerName: 'Товар 1'
        },
        {
          offerId: 'OFFER999', // Немаппированный товар
          count: 1,
          price: 500,
          shopSku: 'SKU999',
          offerName: 'Немаппированный товар'
        }
      ]
    };
    
    const partialOrder = await orderService.createMoySkladOrder(partiallyMappedOrder);
    console.log(`  Создан заказ: ${partialOrder.name}`);
    console.log(`  Позиций в заказе: ${partialOrder.positions.length}`);
    console.assert(partialOrder.positions.length === 1, 'Должна быть создана 1 позиция (немаппированная пропущена)');
    console.assert(mockMoySkladClient.createdOrders.length === 3, 'Должно быть 3 заказа')

    // Тест 6: Статистика
    console.log('\n✓ Тест 6: Статистика обработки');
    const stats = orderService.getStats();
    console.log(`  Обработано заказов: ${stats.processedOrdersCount}`);
    console.assert(stats.processedOrdersCount === 1, 'Должен быть 1 обработанный заказ');

    // Тест 7: Очистка кэша
    console.log('\n✓ Тест 7: Очистка кэша обработанных заказов');
    orderService.clearProcessedOrders();
    const stats2 = orderService.getStats();
    console.log(`  Обработано заказов после очистки: ${stats2.processedOrdersCount}`);
    console.assert(stats2.processedOrdersCount === 0, 'Кэш должен быть очищен');

    // Тест 8: После очистки кэша заказ можно обработать снова
    console.log('\n✓ Тест 8: После очистки кэша заказ обрабатывается снова');
    const results3 = await orderService.pollAndProcessOrders();
    console.log(`  Обработано: ${results3.processed}`);
    console.log(`  Успешно: ${results3.successful}`);
    console.assert(results3.processed === 1, 'Должен быть обработан 1 заказ');
    console.assert(mockMoySkladClient.createdOrders.length === 4, 'Должно быть 4 заказа');

    // Тест 9: Обработка отгруженных заказов - нет отгруженных заказов
    console.log('\n✓ Тест 9: Обработка отгруженных заказов - нет отгруженных');
    const shipmentResults1 = await orderService.processShippedOrders();
    console.log(`  Обработано: ${shipmentResults1.processed}`);
    console.log(`  Успешно: ${shipmentResults1.successful}`);
    console.assert(shipmentResults1.processed === 0, 'Не должно быть отгруженных заказов');

    // Тест 10: Создание отгрузки для существующего заказа
    console.log('\n✓ Тест 10: Создание отгрузки для существующего заказа');
    mockYandexClient.markAsShipped('12345');
    const shipmentResults2 = await orderService.processShippedOrders();
    console.log(`  Обработано: ${shipmentResults2.processed}`);
    console.log(`  Успешно: ${shipmentResults2.successful}`);
    console.log(`  Неудачно: ${shipmentResults2.failed}`);
    console.assert(shipmentResults2.processed === 1, 'Должен быть обработан 1 отгруженный заказ');
    console.assert(shipmentResults2.successful === 1, 'Отгрузка должна быть создана успешно');
    console.assert(mockMoySkladClient.createdShipments.length === 1, 'Должна быть создана 1 отгрузка');

    // Тест 11: Проверка созданной отгрузки
    console.log('\n✓ Тест 11: Проверка созданной отгрузки');
    const createdShipment = mockMoySkladClient.createdShipments[0];
    console.log(`  ID отгрузки: ${createdShipment.id}`);
    console.log(`  Имя отгрузки: ${createdShipment.name}`);
    console.assert(createdShipment.customerOrder !== undefined, 'Отгрузка должна ссылаться на заказ');
    console.assert(
      createdShipment.customerOrder.meta.href.includes('customerorder'),
      'Отгрузка должна ссылаться на customerorder'
    );

    // Тест 12: Попытка создать отгрузку для неизвестного заказа
    console.log('\n✓ Тест 12: Попытка создать отгрузку для неизвестного заказа');
    try {
      await orderService.createShipment('unknown-order-id');
      console.error('  ❌ Должна была быть выброшена ошибка');
      process.exit(1);
    } catch (error) {
      console.log(`  Ошибка поймана: ${error.message}`);
      console.assert(
        error.message.includes('Маппинг для заказа'),
        'Ошибка должна содержать информацию о маппинге'
      );
      console.assert(
        error.message.includes('не найден'),
        'Ошибка должна указывать что маппинг не найден'
      );
    }

    // Тест 13: Создание отгрузки напрямую для существующего маппинга
    console.log('\n✓ Тест 13: Создание отгрузки напрямую для существующего маппинга');
    const shipment = await orderService.createShipment('12345');
    console.log(`  ID отгрузки: ${shipment.id}`);
    console.assert(shipment.id !== undefined, 'Отгрузка должна иметь ID');
    console.assert(mockMoySkladClient.createdShipments.length === 2, 'Должно быть 2 отгрузки');

    console.log('\n✅ Все тесты пройдены успешно!');
  } catch (error) {
    console.error('\n❌ Ошибка при выполнении тестов:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
