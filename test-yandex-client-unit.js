/**
 * Unit тесты для YandexClient
 * Проверяем корректность работы с offerId (вместо offerId_M2)
 * 
 * Требования: 2.5, 5.4
 */

// Установить переменные окружения перед загрузкой модулей
process.env.YANDEX_CAMPAIGN_ID = 'test-campaign-123';
process.env.YANDEX_TOKEN = 'test-token-456';
process.env.LOG_LEVEL = 'error'; // Минимизировать вывод логов

const YandexClient = require('./src/api/yandexClient');

// Мок для axios
class MockAxiosInstance {
  constructor() {
    this.requests = [];
    this.responses = [];
    this.shouldFail = false;
    this.failureResponse = null;
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
    
    if (this.shouldFail && this.failureResponse) {
      throw this.failureResponse;
    }
    
    const response = this.responses.shift() || { status: 200, data: { status: 'OK' } };
    return response;
  }

  async get(url, config) {
    this.requests.push({ method: 'GET', url, config });
    
    if (this.shouldFail && this.failureResponse) {
      throw this.failureResponse;
    }
    
    const response = this.responses.shift() || { status: 200, data: { orders: [] } };
    return response;
  }

  setResponse(response) {
    this.responses.push(response);
  }

  setFailure(error) {
    this.shouldFail = true;
    this.failureResponse = error;
  }

  getLastRequest() {
    return this.requests[this.requests.length - 1];
  }

  reset() {
    this.requests = [];
    this.responses = [];
    this.shouldFail = false;
    this.failureResponse = null;
  }
}

// Подменяем axios.create
const originalAxios = require('axios');
const mockAxiosInstance = new MockAxiosInstance();
originalAxios.create = () => mockAxiosInstance;

async function runTests() {
  console.log('🧪 Unit тесты для YandexClient\n');

  try {
    const yandexClient = new YandexClient();

    // Тест 1: Отправка запроса с offerId (не offerId_M2)
    console.log('✓ Тест 1: Отправка запроса с offerId (не offerId_M2)');
    {
      mockAxiosInstance.reset();
      const stockUpdates = [
        { offerId: '8100-X-clean-EFE-5w-30-5L_DBSA', count: 10 },
        { offerId: '8100-X-clean-C3-5w-40-5L_DBSA', count: 5 }
      ];

      await yandexClient.updateStocks(stockUpdates);

      const lastRequest = mockAxiosInstance.getLastRequest();
      console.assert(lastRequest.method === 'PUT', 'Должен быть PUT запрос');
      console.assert(lastRequest.url === '/campaigns/test-campaign-123/offers/stocks', 'Правильный endpoint');
      
      const requestData = lastRequest.data;
      console.assert(requestData.skus.length === 2, 'Должно быть 2 товара');
      console.assert(requestData.skus[0].sku === '8100-X-clean-EFE-5w-30-5L_DBSA', 'Первый offerId правильный');
      console.assert(requestData.skus[1].sku === '8100-X-clean-C3-5w-40-5L_DBSA', 'Второй offerId правильный');
      console.assert(requestData.skus[0].items[0].count === 10, 'Количество правильное');
      console.assert(requestData.skus[0].items[0].type === 'FIT', 'Тип правильный');
      console.log('  ✓ Запрос отправлен с offerId');
    }

    // Тест 2: Использование warehouseId если указан
    console.log('\n✓ Тест 2: Использование warehouseId если указан');
    {
      mockAxiosInstance.reset();
      const stockUpdates = [
        { offerId: 'OFFER001', count: 10, warehouseId: 123 }
      ];

      await yandexClient.updateStocks(stockUpdates);

      const requestData = mockAxiosInstance.getLastRequest().data;
      console.assert(requestData.skus[0].warehouseId === 123, 'warehouseId должен быть 123');
      console.log('  ✓ warehouseId используется');
    }

    // Тест 3: warehouseId = 0 по умолчанию
    console.log('\n✓ Тест 3: warehouseId = 0 по умолчанию');
    {
      mockAxiosInstance.reset();
      const stockUpdates = [
        { offerId: 'OFFER001', count: 10 }
      ];

      await yandexClient.updateStocks(stockUpdates);

      const requestData = mockAxiosInstance.getLastRequest().data;
      console.assert(requestData.skus[0].warehouseId === 0, 'warehouseId должен быть 0 по умолчанию');
      console.log('  ✓ warehouseId = 0 по умолчанию');
    }

    // Тест 4: Ошибка при попытке обновить больше 2000 товаров
    console.log('\n✓ Тест 4: Ошибка при попытке обновить больше 2000 товаров');
    {
      mockAxiosInstance.reset();
      const stockUpdates = Array(2001).fill({ offerId: 'OFFER001', count: 10 });

      try {
        await yandexClient.updateStocks(stockUpdates);
        console.error('  ❌ Должна была быть выброшена ошибка');
        process.exit(1);
      } catch (error) {
        console.assert(error.message.includes('2000'), 'Ошибка должна упоминать лимит 2000');
        console.assert(mockAxiosInstance.requests.length === 0, 'Запрос не должен быть отправлен');
        console.log('  ✓ Ошибка корректно выброшена');
      }
    }

    // Тест 5: Обработка пустого массива
    console.log('\n✓ Тест 5: Обработка пустого массива');
    {
      mockAxiosInstance.reset();
      const stockUpdates = [];

      await yandexClient.updateStocks(stockUpdates);

      const requestData = mockAxiosInstance.getLastRequest().data;
      console.assert(requestData.skus.length === 0, 'Массив skus должен быть пустым');
      console.log('  ✓ Пустой массив обработан');
    }

    // Тест 6: Корректность формата запроса для API Яндекс.Маркет
    console.log('\n✓ Тест 6: Корректность формата запроса для API Яндекс.Маркет');
    {
      mockAxiosInstance.reset();
      const stockUpdates = [
        { offerId: 'TEST-OFFER-123', count: 42, warehouseId: 5 }
      ];

      await yandexClient.updateStocks(stockUpdates);

      const requestData = mockAxiosInstance.getLastRequest().data;
      
      // Проверяем корневую структуру
      console.assert(requestData.skus !== undefined, 'Должно быть поле skus');
      console.assert(Array.isArray(requestData.skus), 'skus должен быть массивом');
      
      // Проверяем структуру SKU
      const sku = requestData.skus[0];
      console.assert(sku.sku === 'TEST-OFFER-123', 'sku должен быть правильным');
      console.assert(sku.warehouseId === 5, 'warehouseId должен быть 5');
      console.assert(Array.isArray(sku.items), 'items должен быть массивом');
      console.assert(sku.items[0].count === 42, 'count должен быть 42');
      console.assert(sku.items[0].type === 'FIT', 'type должен быть FIT');
      
      // Проверяем что updatedAt в формате ISO
      const updatedAt = sku.items[0].updatedAt;
      const date = new Date(updatedAt);
      console.assert(!isNaN(date.getTime()), 'updatedAt должен быть валидной датой');
      console.assert(date.toISOString() === updatedAt, 'updatedAt должен быть в формате ISO');
      
      console.log('  ✓ Формат запроса корректный');
    }

    // Тест 7: Запрос НЕ должен содержать поле offerId_M2
    console.log('\n✓ Тест 7: Запрос НЕ должен содержать поле offerId_M2');
    {
      mockAxiosInstance.reset();
      const stockUpdates = [
        { offerId: 'OFFER001', count: 10 }
      ];

      await yandexClient.updateStocks(stockUpdates);

      const requestData = mockAxiosInstance.getLastRequest().data;
      const requestString = JSON.stringify(requestData);
      
      console.assert(!requestString.includes('offerId_M2'), 'Запрос НЕ должен содержать offerId_M2');
      console.assert(requestData.skus[0].sku !== undefined, 'Должно быть поле sku');
      console.assert(requestData.skus[0].offerId_M2 === undefined, 'НЕ должно быть поля offerId_M2');
      console.log('  ✓ offerId_M2 отсутствует в запросе');
    }

    // Тест 8: Получение заказов с фильтрами
    console.log('\n✓ Тест 8: Получение заказов с фильтрами');
    {
      mockAxiosInstance.reset();
      const mockOrders = [
        { id: '12345', status: 'PROCESSING' },
        { id: '67890', status: 'DELIVERY' }
      ];
      
      mockAxiosInstance.setResponse({
        status: 200,
        data: { orders: mockOrders }
      });

      const filters = { status: 'PROCESSING' };
      const orders = await yandexClient.getOrders(filters);

      console.assert(orders.length === 2, 'Должно быть 2 заказа');
      console.assert(orders[0].id === '12345', 'Первый заказ правильный');
      
      const lastRequest = mockAxiosInstance.getLastRequest();
      console.assert(lastRequest.method === 'GET', 'Должен быть GET запрос');
      console.assert(lastRequest.url === '/campaigns/test-campaign-123/orders', 'Правильный endpoint');
      console.log('  ✓ Заказы получены с фильтрами');
    }

    // Тест 9: Возврат пустого массива если заказов нет
    console.log('\n✓ Тест 9: Возврат пустого массива если заказов нет');
    {
      mockAxiosInstance.reset();
      mockAxiosInstance.setResponse({
        status: 200,
        data: {}
      });

      const orders = await yandexClient.getOrders();

      console.assert(Array.isArray(orders), 'Должен быть массив');
      console.assert(orders.length === 0, 'Массив должен быть пустым');
      console.log('  ✓ Пустой массив возвращен');
    }

    // Тест 10: Получение деталей заказа по ID
    console.log('\n✓ Тест 10: Получение деталей заказа по ID');
    {
      mockAxiosInstance.reset();
      const mockOrder = { id: '12345', status: 'PROCESSING' };
      
      mockAxiosInstance.setResponse({
        status: 200,
        data: { order: mockOrder }
      });

      const order = await yandexClient.getOrder('12345');

      console.assert(order.id === '12345', 'ID заказа правильный');
      console.assert(order.status === 'PROCESSING', 'Статус правильный');
      
      const lastRequest = mockAxiosInstance.getLastRequest();
      console.assert(lastRequest.url === '/campaigns/test-campaign-123/orders/12345', 'Правильный endpoint');
      console.log('  ✓ Детали заказа получены');
    }

    // Тест 11: Проверка формата заголовка Api-Key (не Authorization: Bearer)
    // **Feature: yandex-api-key-migration, Property 1: API-key header format**
    console.log('\n✓ Тест 11: Проверка формата заголовка Api-Key');
    {
      // Создаем новый клиент и проверяем что axios.create был вызван с правильными заголовками
      // Сохраняем оригинальный axios.create
      const createCalls = [];
      const originalCreate = originalAxios.create;
      originalAxios.create = (config) => {
        createCalls.push(config);
        return mockAxiosInstance;
      };
      
      // Создаем новый клиент
      const testClient = new YandexClient();
      
      // Восстанавливаем оригинальный create
      originalAxios.create = originalCreate;
      
      // Проверяем что axios.create был вызван с правильными заголовками
      console.assert(createCalls.length > 0, 'axios.create должен быть вызван');
      const headers = createCalls[createCalls.length - 1].headers;
      
      console.assert(headers['Api-Key'] !== undefined, 'Заголовок Api-Key должен присутствовать');
      console.assert(headers['Api-Key'] === 'test-token-456', 'Api-Key должен содержать токен');
      console.assert(headers['Authorization'] === undefined, 'Заголовок Authorization НЕ должен присутствовать');
      console.assert(!headers['Api-Key'].includes('Bearer'), 'Api-Key НЕ должен содержать Bearer');
      console.assert(headers['Content-Type'] === 'application/json', 'Content-Type должен быть application/json');
      
      console.log('  ✓ Формат заголовка Api-Key корректный');
      console.log('  ✓ Заголовок Authorization отсутствует');
      console.log('  ✓ Токен передается без префикса Bearer');
    }

    console.log('\n✅ Все тесты пройдены успешно!');
  } catch (error) {
    console.error('\n❌ Ошибка при выполнении тестов:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
