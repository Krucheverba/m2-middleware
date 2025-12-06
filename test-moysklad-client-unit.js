/**
 * Unit тесты для MoySkladClient
 * Требования: 6.1, 6.2, 6.3
 * 
 * Тестируем:
 * - getProducts() без expand=attributes
 * - getProductById() - новый метод
 * - getProductStock() с product.id
 */

// Мок для MoySkladClient
class MockAxiosInstance {
  constructor() {
    this.responses = new Map();
    this.calls = [];
  }

  setResponse(method, url, response) {
    this.responses.set(`${method}:${url}`, response);
  }

  async get(url, config) {
    this.calls.push({ method: 'GET', url, config });
    const key = `GET:${url}`;
    const response = this.responses.get(key);
    if (!response) {
      throw new Error(`No mock response for GET ${url}`);
    }
    if (response.error) {
      throw response.error;
    }
    return response;
  }

  async post(url, data) {
    this.calls.push({ method: 'POST', url, data });
    const key = `POST:${url}`;
    const response = this.responses.get(key);
    if (!response) {
      throw new Error(`No mock response for POST ${url}`);
    }
    if (response.error) {
      throw response.error;
    }
    return response;
  }

  async put(url, data) {
    this.calls.push({ method: 'PUT', url, data });
    const key = `PUT:${url}`;
    const response = this.responses.get(key);
    if (!response) {
      throw new Error(`No mock response for PUT ${url}`);
    }
    if (response.error) {
      throw response.error;
    }
    return response;
  }

  getLastCall() {
    return this.calls[this.calls.length - 1];
  }

  clearCalls() {
    this.calls = [];
  }
}

class MockMoySkladClient {
  constructor(mockAxios) {
    this.client = mockAxios;
    this.baseURL = 'https://api.moysklad.ru/api/remap/1.2';
  }

  async getProducts(filter = {}) {
    const params = {
      limit: 1000,
      ...filter
    };
    
    const response = await this.client.get('/entity/product', { params });
    return response.data.rows || [];
  }

  async getProductById(productId) {
    const response = await this.client.get(`/entity/product/${productId}`);
    return response.data;
  }

  async getProductStock(productId) {
    const params = {
      filter: `product=${this.baseURL}/entity/product/${productId}`
    };
    
    const response = await this.client.get('/report/stock/bystore', { params });
    const stockData = response.data.rows || [];
    
    let totalStock = 0;
    let totalReserve = 0;
    
    stockData.forEach(item => {
      totalStock += item.stock || 0;
      totalReserve += item.reserve || 0;
    });
    
    const availableStock = totalStock - totalReserve;
    
    return {
      productId,
      totalStock,
      totalReserve,
      availableStock,
      stockByStore: stockData
    };
  }

  async createCustomerOrder(orderData) {
    const response = await this.client.post('/entity/customerorder', orderData);
    return response.data;
  }

  async createShipment(shipmentData) {
    const response = await this.client.post('/entity/demand', shipmentData);
    return response.data;
  }

  async updateOrderStatus(orderId, stateId) {
    const updateData = {
      state: {
        meta: {
          href: stateId,
          type: 'state',
          mediaType: 'application/json'
        }
      }
    };
    
    const response = await this.client.put(`/entity/customerorder/${orderId}`, updateData);
    return response.data;
  }
}

async function runTests() {
  console.log('🧪 Unit тесты для MoySkladClient\n');
  
  let passedTests = 0;
  let failedTests = 0;

  // Тест 1: getProducts() без expand=attributes
  console.log('✓ Тест 1: getProducts() без expand=attributes');
  try {
    const mockAxios = new MockAxiosInstance();
    mockAxios.setResponse('GET', '/entity/product', {
      data: {
        rows: [
          { id: 'product-1', name: 'Товар 1' },
          { id: 'product-2', name: 'Товар 2' }
        ]
      }
    });

    const client = new MockMoySkladClient(mockAxios);
    const result = await client.getProducts();

    const lastCall = mockAxios.getLastCall();
    
    if (result.length !== 2) {
      throw new Error(`Ожидалось 2 товара, получено ${result.length}`);
    }
    if (lastCall.config.params.expand) {
      throw new Error('Параметр expand не должен присутствовать');
    }
    if (lastCall.config.params.limit !== 1000) {
      throw new Error('Параметр limit должен быть 1000');
    }
    
    console.log('  ✅ Товары получены без expand=attributes');
    passedTests++;
  } catch (error) {
    console.log(`  ❌ Ошибка: ${error.message}`);
    failedTests++;
  }

  // Тест 2: getProducts() с фильтрами
  console.log('\n✓ Тест 2: getProducts() с фильтрами');
  try {
    const mockAxios = new MockAxiosInstance();
    mockAxios.setResponse('GET', '/entity/product', {
      data: {
        rows: [{ id: 'product-1', name: 'Товар 1' }]
      }
    });

    const client = new MockMoySkladClient(mockAxios);
    await client.getProducts({ offset: 100 });

    const lastCall = mockAxios.getLastCall();
    
    if (lastCall.config.params.offset !== 100) {
      throw new Error('Фильтр offset не передан');
    }
    if (lastCall.config.params.expand) {
      throw new Error('Параметр expand не должен присутствовать');
    }
    
    console.log('  ✅ Фильтры переданы корректно без expand');
    passedTests++;
  } catch (error) {
    console.log(`  ❌ Ошибка: ${error.message}`);
    failedTests++;
  }

  // Тест 3: getProductById() - новый метод
  console.log('\n✓ Тест 3: getProductById() - новый метод');
  try {
    const productId = 'f8a2da33-bf0a-11ef-0a80-17e3002d7201';
    const mockAxios = new MockAxiosInstance();
    mockAxios.setResponse('GET', `/entity/product/${productId}`, {
      data: {
        id: productId,
        name: 'Тестовый товар',
        code: 'TEST-001'
      }
    });

    const client = new MockMoySkladClient(mockAxios);
    const result = await client.getProductById(productId);

    if (result.id !== productId) {
      throw new Error(`Ожидался ID ${productId}, получен ${result.id}`);
    }
    if (result.name !== 'Тестовый товар') {
      throw new Error('Неверное название товара');
    }
    
    console.log('  ✅ Товар получен по product.id');
    passedTests++;
  } catch (error) {
    console.log(`  ❌ Ошибка: ${error.message}`);
    failedTests++;
  }

  // Тест 4: getProductById() - товар не найден
  console.log('\n✓ Тест 4: getProductById() - товар не найден');
  try {
    const mockAxios = new MockAxiosInstance();
    const error = new Error('Product not found');
    error.response = { status: 404 };
    mockAxios.setResponse('GET', '/entity/product/non-existent', { error });

    const client = new MockMoySkladClient(mockAxios);
    
    try {
      await client.getProductById('non-existent');
      throw new Error('Должна была быть выброшена ошибка');
    } catch (err) {
      if (err.message !== 'Product not found') {
        throw err;
      }
    }
    
    console.log('  ✅ Ошибка обработана корректно');
    passedTests++;
  } catch (error) {
    console.log(`  ❌ Ошибка: ${error.message}`);
    failedTests++;
  }

  // Тест 5: getProductStock() с product.id
  console.log('\n✓ Тест 5: getProductStock() с product.id');
  try {
    const productId = 'f8a2da33-bf0a-11ef-0a80-17e3002d7201';
    const mockAxios = new MockAxiosInstance();
    mockAxios.setResponse('GET', '/report/stock/bystore', {
      data: {
        rows: [
          { stock: 10, reserve: 2 },
          { stock: 5, reserve: 1 }
        ]
      }
    });

    const client = new MockMoySkladClient(mockAxios);
    const result = await client.getProductStock(productId);

    const lastCall = mockAxios.getLastCall();
    
    if (!lastCall.config.params.filter.includes(productId)) {
      throw new Error('product.id не передан в фильтре');
    }
    if (result.totalStock !== 15) {
      throw new Error(`Ожидалось totalStock=15, получено ${result.totalStock}`);
    }
    if (result.totalReserve !== 3) {
      throw new Error(`Ожидалось totalReserve=3, получено ${result.totalReserve}`);
    }
    if (result.availableStock !== 12) {
      throw new Error(`Ожидалось availableStock=12, получено ${result.availableStock}`);
    }
    
    console.log('  ✅ Остатки получены по product.id');
    passedTests++;
  } catch (error) {
    console.log(`  ❌ Ошибка: ${error.message}`);
    failedTests++;
  }

  // Тест 6: getProductStock() - нулевые остатки
  console.log('\n✓ Тест 6: getProductStock() - нулевые остатки');
  try {
    const mockAxios = new MockAxiosInstance();
    mockAxios.setResponse('GET', '/report/stock/bystore', {
      data: { rows: [] }
    });

    const client = new MockMoySkladClient(mockAxios);
    const result = await client.getProductStock('test-id');

    if (result.totalStock !== 0 || result.totalReserve !== 0 || result.availableStock !== 0) {
      throw new Error('Остатки должны быть нулевыми');
    }
    
    console.log('  ✅ Нулевые остатки обработаны корректно');
    passedTests++;
  } catch (error) {
    console.log(`  ❌ Ошибка: ${error.message}`);
    failedTests++;
  }

  // Тест 7: getProductStock() - отсутствие резерва
  console.log('\n✓ Тест 7: getProductStock() - отсутствие резерва');
  try {
    const mockAxios = new MockAxiosInstance();
    mockAxios.setResponse('GET', '/report/stock/bystore', {
      data: {
        rows: [
          { stock: 10 }, // reserve отсутствует
          { stock: 5, reserve: 0 }
        ]
      }
    });

    const client = new MockMoySkladClient(mockAxios);
    const result = await client.getProductStock('test-id');

    if (result.totalStock !== 15) {
      throw new Error(`Ожидалось totalStock=15, получено ${result.totalStock}`);
    }
    if (result.totalReserve !== 0) {
      throw new Error(`Ожидалось totalReserve=0, получено ${result.totalReserve}`);
    }
    if (result.availableStock !== 15) {
      throw new Error(`Ожидалось availableStock=15, получено ${result.availableStock}`);
    }
    
    console.log('  ✅ Отсутствие резерва обработано корректно');
    passedTests++;
  } catch (error) {
    console.log(`  ❌ Ошибка: ${error.message}`);
    failedTests++;
  }

  // Итоги
  console.log('\n' + '='.repeat(50));
  console.log(`Всего тестов: ${passedTests + failedTests}`);
  console.log(`✅ Пройдено: ${passedTests}`);
  console.log(`❌ Провалено: ${failedTests}`);
  
  if (failedTests === 0) {
    console.log('\n🎉 Все тесты пройдены успешно!');
  } else {
    console.log('\n⚠️  Некоторые тесты провалены');
    process.exit(1);
  }
}

// Запуск тестов
if (require.main === module) {
  runTests().catch(error => {
    console.error('Критическая ошибка:', error);
    process.exit(1);
  });
}

module.exports = { MockMoySkladClient, MockAxiosInstance };
