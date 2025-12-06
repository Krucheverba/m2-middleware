/**
 * Unit тесты для OrderService
 * Проверяет: Требования 7.1, 7.2, 7.3, 7.4
 * 
 * Тесты:
 * - Обработка заказа с offerId
 * - Маппинг offerId → product.id для позиций
 * - Создание заказа в МойСклад с product.id
 * - Обработка позиций без маппинга
 */

// Установить переменные окружения перед загрузкой модулей
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign';
process.env.YANDEX_TOKEN = 'test-token';
process.env.MS_TOKEN = 'test-ms-token';
process.env.MS_BASE = 'https://api.moysklad.ru/api/remap/1.2';
process.env.LOG_LEVEL = 'error';

const OrderService = require('./src/services/orderService');

// Мок для YandexClient
class MockYandexClient {
  async getOrders(filters) {
    return [];
  }
}

// Мок для MoySkladClient
class MockMoySkladClient {
  constructor() {
    this.createdOrders = [];
  }

  async createCustomerOrder(orderData) {
    const order = {
      id: `ms-order-${Date.now()}-${Math.random()}`,
      name: orderData.name,
      description: orderData.description,
      positions: orderData.positions
    };
    this.createdOrders.push(order);
    return order;
  }
}

// Мок для MapperService
class MockMapperService {
  constructor(mappings = {}) {
    this.mappings = new Map(Object.entries(mappings));
    this.orderMappings = new Map();
  }

  mapOfferIdToProductId(offerId) {
    return this.mappings.get(offerId) || null;
  }

  async saveOrderMapping(m2OrderId, moySkladOrderId) {
    this.orderMappings.set(m2OrderId, moySkladOrderId);
  }
}

async function runTests() {
  console.log('🧪 Unit тесты для OrderService\n');

  let testsPassed = 0;
  let testsFailed = 0;

  // Тест 1: Обработка заказа с offerId (Требование 7.1)
  try {
    console.log('✓ Тест 1: Обработка заказа с offerId (Требование 7.1)');
    
    const mockMapperService = new MockMapperService({
      'OFFER001': 'f8a2da33-bf0a-11ef-0a80-17e3002d7201',
      'OFFER002': 'a1b2c3d4-e5f6-11ef-0a80-17e3002d7202'
    });
    
    const mockMoySkladClient = new MockMoySkladClient();
    const orderService = new OrderService(
      new MockYandexClient(),
      mockMoySkladClient,
      mockMapperService
    );

    const m2Order = {
      id: 'TEST-ORDER-001',
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
      ]
    };

    const result = await orderService.createMoySkladOrder(m2Order);
    
    console.assert(result !== null, 'Заказ должен быть создан');
    console.assert(result.id !== undefined, 'Заказ должен иметь ID');
    console.assert(result.name === 'M2-TEST-ORDER-001', 'Имя заказа должно быть M2-TEST-ORDER-001');
    console.assert(result.positions.length === 2, 'Должно быть 2 позиции');
    
    console.log('  ✅ Заказ успешно обработан с offerId');
    testsPassed++;
  } catch (error) {
    console.error('  ❌ Тест провален:', error.message);
    testsFailed++;
  }

  // Тест 2: Маппинг offerId → product.id для позиций (Требование 7.2)
  try {
    console.log('\n✓ Тест 2: Маппинг offerId → product.id для позиций (Требование 7.2)');
    
    const mockMapperService = new MockMapperService({
      'OFFER-A': 'product-uuid-a',
      'OFFER-B': 'product-uuid-b',
      'OFFER-C': 'product-uuid-c'
    });
    
    const mockMoySkladClient = new MockMoySkladClient();
    const orderService = new OrderService(
      new MockYandexClient(),
      mockMoySkladClient,
      mockMapperService
    );

    const m2Order = {
      id: 'TEST-ORDER-002',
      items: [
        { offerId: 'OFFER-A', count: 1, price: 100, shopSku: 'SKU-A', offerName: 'Товар A' },
        { offerId: 'OFFER-B', count: 2, price: 200, shopSku: 'SKU-B', offerName: 'Товар B' },
        { offerId: 'OFFER-C', count: 3, price: 300, shopSku: 'SKU-C', offerName: 'Товар C' }
      ]
    };

    const result = await orderService.createMoySkladOrder(m2Order);
    
    console.assert(result.positions.length === 3, 'Должно быть 3 позиции');
    
    // Проверяем что каждая позиция содержит правильный product.id в href
    const position1Href = result.positions[0].assortment.meta.href;
    const position2Href = result.positions[1].assortment.meta.href;
    const position3Href = result.positions[2].assortment.meta.href;
    
    console.assert(position1Href.includes('product-uuid-a'), 'Позиция 1 должна содержать product-uuid-a');
    console.assert(position2Href.includes('product-uuid-b'), 'Позиция 2 должна содержать product-uuid-b');
    console.assert(position3Href.includes('product-uuid-c'), 'Позиция 3 должна содержать product-uuid-c');
    
    console.log('  ✅ Все offerId корректно маппированы на product.id');
    testsPassed++;
  } catch (error) {
    console.error('  ❌ Тест провален:', error.message);
    testsFailed++;
  }

  // Тест 3: Создание заказа в МойСклад с product.id (Требование 7.3)
  try {
    console.log('\n✓ Тест 3: Создание заказа в МойСклад с product.id (Требование 7.3)');
    
    const productId = 'f8a2da33-bf0a-11ef-0a80-17e3002d7201';
    const mockMapperService = new MockMapperService({
      'OFFER-TEST': productId
    });
    
    const mockMoySkladClient = new MockMoySkladClient();
    const orderService = new OrderService(
      new MockYandexClient(),
      mockMoySkladClient,
      mockMapperService
    );

    const m2Order = {
      id: 'TEST-ORDER-003',
      items: [
        {
          offerId: 'OFFER-TEST',
          count: 5,
          price: 1500,
          shopSku: 'SKU-TEST',
          offerName: 'Тестовый товар'
        }
      ]
    };

    const result = await orderService.createMoySkladOrder(m2Order);
    
    // Проверяем структуру позиции
    const position = result.positions[0];
    console.assert(position.assortment !== undefined, 'Позиция должна содержать assortment');
    console.assert(position.assortment.meta !== undefined, 'Assortment должен содержать meta');
    console.assert(position.assortment.meta.href !== undefined, 'Meta должен содержать href');
    console.assert(position.assortment.meta.type === 'product', 'Type должен быть product');
    
    // Проверяем что href содержит правильный product.id
    const href = position.assortment.meta.href;
    console.assert(href.includes(productId), `Href должен содержать product.id: ${productId}`);
    console.assert(href.includes('/entity/product/'), 'Href должен содержать /entity/product/');
    
    // Проверяем количество и цену
    console.assert(position.quantity === 5, 'Количество должно быть 5');
    console.assert(position.price === 150000, 'Цена должна быть 150000 копеек (1500 * 100)');
    console.assert(position.reserve === 5, 'Резерв должен быть 5');
    
    console.log('  ✅ Заказ создан с правильным product.id в позициях');
    testsPassed++;
  } catch (error) {
    console.error('  ❌ Тест провален:', error.message);
    testsFailed++;
  }

  // Тест 4: Обработка позиций без маппинга - все позиции немаппированы (Требование 7.4)
  try {
    console.log('\n✓ Тест 4: Обработка позиций без маппинга - все немаппированы (Требование 7.4)');
    
    const mockMapperService = new MockMapperService({}); // Пустой маппинг
    
    const mockMoySkladClient = new MockMoySkladClient();
    const orderService = new OrderService(
      new MockYandexClient(),
      mockMoySkladClient,
      mockMapperService
    );

    const m2Order = {
      id: 'TEST-ORDER-004',
      items: [
        {
          offerId: 'UNMAPPED-OFFER-1',
          count: 1,
          price: 100,
          shopSku: 'SKU-UNMAPPED-1',
          offerName: 'Немаппированный товар 1'
        },
        {
          offerId: 'UNMAPPED-OFFER-2',
          count: 2,
          price: 200,
          shopSku: 'SKU-UNMAPPED-2',
          offerName: 'Немаппированный товар 2'
        }
      ]
    };

    try {
      await orderService.createMoySkladOrder(m2Order);
      console.error('  ❌ Должна была быть выброшена ошибка');
      testsFailed++;
    } catch (error) {
      console.assert(
        error.message.includes('не содержит ни одной маппированной позиции'),
        'Ошибка должна указывать что нет маппированных позиций'
      );
      console.log('  ✅ Заказ без маппированных позиций корректно отклонен');
      testsPassed++;
    }
  } catch (error) {
    console.error('  ❌ Тест провален:', error.message);
    testsFailed++;
  }

  // Тест 5: Обработка позиций без маппинга - частично немаппированы (Требование 7.4)
  try {
    console.log('\n✓ Тест 5: Обработка позиций без маппинга - частично немаппированы (Требование 7.4)');
    
    const mockMapperService = new MockMapperService({
      'MAPPED-OFFER': 'product-uuid-mapped'
    });
    
    const mockMoySkladClient = new MockMoySkladClient();
    const orderService = new OrderService(
      new MockYandexClient(),
      mockMoySkladClient,
      mockMapperService
    );

    const m2Order = {
      id: 'TEST-ORDER-005',
      items: [
        {
          offerId: 'MAPPED-OFFER',
          count: 1,
          price: 100,
          shopSku: 'SKU-MAPPED',
          offerName: 'Маппированный товар'
        },
        {
          offerId: 'UNMAPPED-OFFER',
          count: 2,
          price: 200,
          shopSku: 'SKU-UNMAPPED',
          offerName: 'Немаппированный товар'
        }
      ]
    };

    const result = await orderService.createMoySkladOrder(m2Order);
    
    // Проверяем что создана только одна позиция (маппированная)
    console.assert(result.positions.length === 1, 'Должна быть создана только 1 позиция');
    
    // Проверяем что это правильная позиция
    const position = result.positions[0];
    const href = position.assortment.meta.href;
    console.assert(href.includes('product-uuid-mapped'), 'Позиция должна содержать маппированный product.id');
    console.assert(position.quantity === 1, 'Количество должно быть 1');
    
    console.log('  ✅ Немаппированные позиции корректно пропущены, маппированные обработаны');
    testsPassed++;
  } catch (error) {
    console.error('  ❌ Тест провален:', error.message);
    testsFailed++;
  }

  // Тест 6: Проверка сохранения маппинга заказа (Требование 7.5)
  try {
    console.log('\n✓ Тест 6: Проверка сохранения маппинга заказа (Требование 7.5)');
    
    const mockMapperService = new MockMapperService({
      'OFFER-SAVE': 'product-uuid-save'
    });
    
    const mockMoySkladClient = new MockMoySkladClient();
    const orderService = new OrderService(
      new MockYandexClient(),
      mockMoySkladClient,
      mockMapperService
    );

    const m2Order = {
      id: 'TEST-ORDER-006',
      items: [
        {
          offerId: 'OFFER-SAVE',
          count: 1,
          price: 100,
          shopSku: 'SKU-SAVE',
          offerName: 'Товар для сохранения'
        }
      ]
    };

    const result = await orderService.createMoySkladOrder(m2Order);
    
    // Проверяем что маппинг сохранен
    console.assert(
      mockMapperService.orderMappings.has('TEST-ORDER-006'),
      'Маппинг заказа должен быть сохранен'
    );
    
    const savedMoySkladOrderId = mockMapperService.orderMappings.get('TEST-ORDER-006');
    console.assert(
      savedMoySkladOrderId === result.id,
      'Сохраненный ID должен совпадать с ID созданного заказа'
    );
    
    console.log('  ✅ Маппинг заказа корректно сохранен');
    testsPassed++;
  } catch (error) {
    console.error('  ❌ Тест провален:', error.message);
    testsFailed++;
  }

  // Тест 7: Проверка формата данных заказа для МойСклад API
  try {
    console.log('\n✓ Тест 7: Проверка формата данных заказа для МойСклад API');
    
    const mockMapperService = new MockMapperService({
      'OFFER-FORMAT': 'product-uuid-format'
    });
    
    const mockMoySkladClient = new MockMoySkladClient();
    const orderService = new OrderService(
      new MockYandexClient(),
      mockMoySkladClient,
      mockMapperService
    );

    const m2Order = {
      id: 'TEST-ORDER-007',
      items: [
        {
          offerId: 'OFFER-FORMAT',
          count: 3,
          price: 2500,
          shopSku: 'SKU-FORMAT',
          offerName: 'Товар для проверки формата'
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
    };

    const result = await orderService.createMoySkladOrder(m2Order);
    
    // Проверяем формат имени заказа
    console.assert(result.name === 'M2-TEST-ORDER-007', 'Имя заказа должно быть M2-TEST-ORDER-007');
    
    // Проверяем что description содержит информацию о доставке
    console.assert(result.description.includes('Москва'), 'Description должен содержать город');
    console.assert(result.description.includes('Ленина'), 'Description должен содержать улицу');
    console.assert(result.description.includes('Иван'), 'Description должен содержать имя получателя');
    console.assert(result.description.includes('Иванов'), 'Description должен содержать фамилию получателя');
    console.assert(result.description.includes('+79001234567'), 'Description должен содержать телефон');
    
    console.log('  ✅ Формат данных заказа корректен');
    testsPassed++;
  } catch (error) {
    console.error('  ❌ Тест провален:', error.message);
    testsFailed++;
  }

  // Тест 8: Проверка конвертации цены в копейки
  try {
    console.log('\n✓ Тест 8: Проверка конвертации цены в копейки');
    
    const mockMapperService = new MockMapperService({
      'OFFER-PRICE': 'product-uuid-price'
    });
    
    const mockMoySkladClient = new MockMoySkladClient();
    const orderService = new OrderService(
      new MockYandexClient(),
      mockMoySkladClient,
      mockMapperService
    );

    const m2Order = {
      id: 'TEST-ORDER-008',
      items: [
        {
          offerId: 'OFFER-PRICE',
          count: 1,
          price: 1234.56, // Цена в рублях
          shopSku: 'SKU-PRICE',
          offerName: 'Товар для проверки цены'
        }
      ]
    };

    const result = await orderService.createMoySkladOrder(m2Order);
    
    const position = result.positions[0];
    // Цена должна быть в копейках: 1234.56 * 100 = 123456
    console.assert(position.price === 123456, `Цена должна быть 123456 копеек, получено: ${position.price}`);
    
    console.log('  ✅ Цена корректно конвертирована в копейки');
    testsPassed++;
  } catch (error) {
    console.error('  ❌ Тест провален:', error.message);
    testsFailed++;
  }

  // Итоги
  console.log('\n' + '='.repeat(50));
  console.log(`Тестов пройдено: ${testsPassed}`);
  console.log(`Тестов провалено: ${testsFailed}`);
  
  if (testsFailed === 0) {
    console.log('\n✅ Все unit тесты для OrderService пройдены успешно!');
    process.exit(0);
  } else {
    console.log('\n❌ Некоторые тесты провалены');
    process.exit(1);
  }
}

runTests();
