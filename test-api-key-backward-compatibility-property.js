/**
 * Property-based тест для обратной совместимости API методов после миграции на API-key
 * **Feature: yandex-api-key-migration, Property 2: Backward compatibility of API methods**
 * **Validates: Requirements 1.4**
 * 
 * Проверяем что все методы YandexClient работают корректно с новым форматом токена
 */

// Установить переменные окружения перед загрузкой модулей
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign-123';
process.env.YANDEX_TOKEN = 'ACMA:test-key:12345'; // API-key формат
process.env.LOG_LEVEL = 'error';

const fc = require('fast-check');
const YandexClient = require('./src/api/yandexClient');

// Мок для axios
class MockAxiosInstance {
  constructor() {
    this.requests = [];
    this.responses = [];
    this.interceptors = {
      response: {
        use: (successHandler, errorHandler) => {
          this.errorHandler = errorHandler;
        }
      }
    };
  }

  async put(url, data, config) {
    this.requests.push({ method: 'PUT', url, data, config });
    const response = this.responses.shift() || { status: 200, data: { status: 'OK' } };
    return response;
  }

  async get(url, config) {
    this.requests.push({ method: 'GET', url, config });
    const response = this.responses.shift() || { status: 200, data: { orders: [] } };
    return response;
  }

  setResponse(response) {
    this.responses.push(response);
  }

  getLastRequest() {
    return this.requests[this.requests.length - 1];
  }

  reset() {
    this.requests = [];
    this.responses = [];
  }
}

// Подменяем axios.create
const originalAxios = require('axios');
const mockAxiosInstance = new MockAxiosInstance();
originalAxios.create = () => mockAxiosInstance;

// Генераторы для property-based testing
const offerIdGen = fc.string({ minLength: 1, maxLength: 50 });
const countGen = fc.integer({ min: 0, max: 1000 });
const warehouseIdGen = fc.integer({ min: 0, max: 100 });

const stockUpdateGen = fc.record({
  offerId: offerIdGen,
  count: countGen,
  warehouseId: fc.option(warehouseIdGen, { nil: undefined })
});

const stockUpdatesArrayGen = fc.array(stockUpdateGen, { minLength: 0, maxLength: 100 });

const orderIdGen = fc.string({ minLength: 1, maxLength: 20 });
const orderStatusGen = fc.constantFrom('PROCESSING', 'DELIVERY', 'DELIVERED', 'CANCELLED');

async function runPropertyTests() {
  console.log('🧪 Property-based тесты для обратной совместимости API-key\n');

  const yandexClient = new YandexClient();

  try {
    // Property 1: updateStocks всегда возвращает успешный результат для валидных данных
    console.log('✓ Property 1: updateStocks работает для любых валидных данных');
    await fc.assert(
      fc.asyncProperty(stockUpdatesArrayGen, async (stockUpdates) => {
        mockAxiosInstance.reset();
        
        // Пропускаем если больше 2000 товаров (это валидная ошибка)
        if (stockUpdates.length > 2000) {
          return true;
        }

        try {
          await yandexClient.updateStocks(stockUpdates);
          
          // Проверяем что запрос был отправлен
          const lastRequest = mockAxiosInstance.getLastRequest();
          if (!lastRequest) return false;
          
          // Проверяем метод и endpoint
          if (lastRequest.method !== 'PUT') return false;
          if (!lastRequest.url.includes('/offers/stocks')) return false;
          
          // Проверяем структуру данных
          const requestData = lastRequest.data;
          if (!requestData.skus || !Array.isArray(requestData.skus)) return false;
          if (requestData.skus.length !== stockUpdates.length) return false;
          
          // Проверяем что каждый элемент правильно преобразован
          for (let i = 0; i < stockUpdates.length; i++) {
            const sku = requestData.skus[i];
            const update = stockUpdates[i];
            
            if (sku.sku !== update.offerId) return false;
            if (sku.warehouseId !== (update.warehouseId || 0)) return false;
            if (!Array.isArray(sku.items)) return false;
            if (sku.items[0].count !== update.count) return false;
            if (sku.items[0].type !== 'FIT') return false;
          }
          
          return true;
        } catch (error) {
          // Любая ошибка - это провал теста
          console.error('Unexpected error:', error.message);
          return false;
        }
      }),
      { numRuns: 100 }
    );
    console.log('  ✓ updateStocks работает корректно для 100 случайных наборов данных\n');

    // Property 2: getOrders всегда возвращает массив
    console.log('✓ Property 2: getOrders всегда возвращает массив');
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          status: fc.option(orderStatusGen, { nil: undefined }),
          fromDate: fc.option(fc.date(), { nil: undefined }),
          toDate: fc.option(fc.date(), { nil: undefined })
        }),
        async (filters) => {
          mockAxiosInstance.reset();
          
          // Мокируем ответ с заказами
          const mockOrders = [
            { id: '123', status: 'PROCESSING' },
            { id: '456', status: 'DELIVERY' }
          ];
          mockAxiosInstance.setResponse({
            status: 200,
            data: { orders: mockOrders }
          });

          const orders = await yandexClient.getOrders(filters);
          
          // Проверяем что результат - массив
          if (!Array.isArray(orders)) return false;
          
          // Проверяем что запрос был отправлен
          const lastRequest = mockAxiosInstance.getLastRequest();
          if (!lastRequest) return false;
          if (lastRequest.method !== 'GET') return false;
          if (!lastRequest.url.includes('/orders')) return false;
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
    console.log('  ✓ getOrders возвращает массив для 100 различных фильтров\n');

    // Property 3: getOrder всегда возвращает объект заказа для валидного ID
    console.log('✓ Property 3: getOrder возвращает объект заказа');
    await fc.assert(
      fc.asyncProperty(orderIdGen, async (orderId) => {
        mockAxiosInstance.reset();
        
        // Мокируем ответ с заказом
        const mockOrder = { id: orderId, status: 'PROCESSING' };
        mockAxiosInstance.setResponse({
          status: 200,
          data: { order: mockOrder }
        });

        const order = await yandexClient.getOrder(orderId);
        
        // Проверяем что результат - объект с правильным ID
        if (typeof order !== 'object') return false;
        if (order.id !== orderId) return false;
        
        // Проверяем что запрос был отправлен
        const lastRequest = mockAxiosInstance.getLastRequest();
        if (!lastRequest) return false;
        if (lastRequest.method !== 'GET') return false;
        if (!lastRequest.url.includes(`/orders/${orderId}`)) return false;
        
        return true;
      }),
      { numRuns: 100 }
    );
    console.log('  ✓ getOrder работает корректно для 100 различных ID\n');

    // Property 4: Все методы используют правильный Campaign ID
    console.log('✓ Property 4: Все методы используют правильный Campaign ID');
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('updateStocks', 'getOrders', 'getOrder'),
        async (methodName) => {
          mockAxiosInstance.reset();
          
          if (methodName === 'updateStocks') {
            await yandexClient.updateStocks([{ offerId: 'TEST', count: 10 }]);
          } else if (methodName === 'getOrders') {
            mockAxiosInstance.setResponse({ status: 200, data: { orders: [] } });
            await yandexClient.getOrders();
          } else if (methodName === 'getOrder') {
            mockAxiosInstance.setResponse({ status: 200, data: { order: { id: '123' } } });
            await yandexClient.getOrder('123');
          }
          
          const lastRequest = mockAxiosInstance.getLastRequest();
          if (!lastRequest) return false;
          
          // Проверяем что URL содержит правильный Campaign ID
          return lastRequest.url.includes('/campaigns/test-campaign-123/');
        }
      ),
      { numRuns: 50 }
    );
    console.log('  ✓ Все методы используют правильный Campaign ID\n');

    console.log('✅ Все property-based тесты пройдены успешно!');
    console.log('   Проверено 350+ случайных комбинаций параметров');
  } catch (error) {
    console.error('\n❌ Property-based тест провален:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

runPropertyTests();
