/**
 * Property-Based тест для сохранения маппинга заказов
 * 
 * Feature: product-id-mapping-refactor, Property 6: Order mapping preservation
 * Validates: Requirements 7.2, 7.3
 * 
 * Property: Для любого offerId в заказе M2, если существует маппинг на product.id,
 * то создание заказа в МойСклад должно использовать именно этот product.id.
 * 
 * Формально: ∀ offerId ∈ order.items: 
 *   mapping(offerId) = productId ⇒ moySkladOrder.positions[i].assortment.meta.href.includes(productId)
 */

// Установить переменные окружения перед загрузкой модулей
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign';
process.env.YANDEX_TOKEN = 'test-token';
process.env.MS_TOKEN = 'test-ms-token';
process.env.MS_BASE = 'https://api.moysklad.ru/api/remap/1.2';
process.env.LOG_LEVEL = 'error'; // Минимизировать вывод логов

const fc = require('fast-check');
const OrderService = require('./src/services/orderService');

// Мок для YandexClient
class MockYandexClient {}

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
  constructor(mappings = new Map()) {
    this.offerToProductMap = new Map(mappings);
    this.orderMappings = new Map();
  }

  mapOfferIdToProductId(offerId) {
    return this.offerToProductMap.get(offerId) || null;
  }

  async saveOrderMapping(m2OrderId, moySkladOrderId) {
    this.orderMappings.set(m2OrderId, moySkladOrderId);
  }

  async getMoySkladOrderId(m2OrderId) {
    return this.orderMappings.get(m2OrderId) || null;
  }
}

// Генератор UUID для product.id
const uuidArbitrary = fc.uuid();

// Генератор offerId (строка из букв, цифр и дефисов)
const offerIdArbitrary = fc.stringMatching(/^[A-Z0-9][A-Z0-9\-_]{3,20}$/);

// Генератор маппинга offerId -> product.id
const mappingArbitrary = fc.dictionary(
  offerIdArbitrary,
  uuidArbitrary,
  { minKeys: 1, maxKeys: 10 }
);

// Генератор позиции заказа
const orderItemArbitrary = (offerId) => fc.record({
  offerId: fc.constant(offerId),
  count: fc.integer({ min: 1, max: 10 }),
  price: fc.integer({ min: 100, max: 10000 }),
  shopSku: fc.string({ minLength: 3, maxLength: 20 }),
  offerName: fc.string({ minLength: 5, maxLength: 50 })
});

// Генератор заказа M2 с маппированными товарами
const m2OrderArbitrary = (mappings) => {
  const offerIds = Array.from(mappings.keys());
  
  return fc.record({
    id: fc.string({ minLength: 5, maxLength: 20 }),
    status: fc.constant('PROCESSING'),
    items: fc.array(
      fc.oneof(...offerIds.map(offerId => orderItemArbitrary(offerId))),
      { minLength: 1, maxLength: 5 }
    )
  });
};

/**
 * Property 6: Order mapping preservation
 * 
 * Для любого offerId в заказе M2, если существует маппинг на product.id,
 * то создание заказа в МойСклад должно использовать именно этот product.id.
 */
async function testOrderMappingPreservation() {
  console.log('🧪 Property Test: Order mapping preservation\n');
  
  const property = fc.asyncProperty(
    mappingArbitrary,
    async (mappingsObj) => {
      // Преобразовать объект в Map
      const mappings = new Map(Object.entries(mappingsObj));
      
      // Пропустить если нет маппингов
      if (mappings.size === 0) {
        return true;
      }
      
      // Создать моки
      const mockYandexClient = new MockYandexClient();
      const mockMoySkladClient = new MockMoySkladClient();
      const mockMapperService = new MockMapperService(mappings);
      
      const orderService = new OrderService(
        mockYandexClient,
        mockMoySkladClient,
        mockMapperService
      );
      
      // Сгенерировать заказ с маппированными товарами
      const m2Order = await fc.sample(m2OrderArbitrary(mappings), 1)[0];
      
      // Создать заказ в МойСклад
      const moySkladOrder = await orderService.createMoySkladOrder(m2Order);
      
      // Проверить что каждая позиция использует правильный product.id
      for (let i = 0; i < m2Order.items.length; i++) {
        const item = m2Order.items[i];
        const expectedProductId = mappings.get(item.offerId);
        
        // Если маппинг существует, проверить что он использован
        if (expectedProductId) {
          const position = moySkladOrder.positions[i];
          const href = position.assortment.meta.href;
          
          // Проверить что href содержит правильный product.id
          if (!href.includes(expectedProductId)) {
            console.error(`❌ Ошибка: offerId ${item.offerId} должен маппиться на product.id ${expectedProductId}`);
            console.error(`   Но href = ${href}`);
            return false;
          }
        }
      }
      
      return true;
    }
  );
  
  try {
    await fc.assert(property, {
      numRuns: 100,
      verbose: false
    });
    
    console.log('✅ Property Test пройден: Order mapping preservation');
    console.log('   Проверено 100 случайных заказов с маппингами');
    console.log('   Все позиции используют правильные product.id\n');
    
    return true;
  } catch (error) {
    console.error('❌ Property Test провален:', error.message);
    if (error.counterexample) {
      console.error('   Контрпример:', JSON.stringify(error.counterexample, null, 2));
    }
    return false;
  }
}

// Запустить тест
async function runTests() {
  console.log('🚀 Запуск Property-Based тестов для OrderService\n');
  
  const success = await testOrderMappingPreservation();
  
  if (success) {
    console.log('✅ Все Property-Based тесты пройдены успешно!');
    process.exit(0);
  } else {
    console.error('❌ Некоторые Property-Based тесты провалены');
    process.exit(1);
  }
}

runTests();
