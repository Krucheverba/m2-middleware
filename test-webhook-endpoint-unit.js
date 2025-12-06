/**
 * Unit тесты для webhook endpoint
 * Проверяет: Требования 4.1, 4.2, 4.4, 4.5
 * 
 * Тесты:
 * - Парсинг product.id из payload
 * - Обработка webhook с product.id
 * - Обработка невалидного payload
 * - Возврат HTTP 200 OK
 */

require('dotenv').config({ path: '.env.test' });

const express = require('express');
const axios = require('axios');
const createMoySkladWebhookRouter = require('./src/routes/moySkladWebhook');

// Мок StockService для изоляции тестов
class MockStockService {
  constructor() {
    this.calls = [];
  }

  async handleStockUpdate(productId) {
    this.calls.push({ method: 'handleStockUpdate', productId });
    return Promise.resolve();
  }

  getLastCall() {
    return this.calls[this.calls.length - 1];
  }

  reset() {
    this.calls = [];
  }
}

// Утилита для ожидания асинхронных операций
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Счетчики тестов
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

// Функция для запуска теста
async function runTest(name, testFn) {
  testsRun++;
  try {
    await testFn();
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    testsFailed++;
    console.log(`  ✗ ${name}`);
    console.log(`    Ошибка: ${error.message}`);
  }
}

// Функция для проверки условия
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Функция для проверки равенства
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, but got ${actual}`);
  }
}

// Функция для проверки что значение больше
function assertGreaterThan(actual, expected, message) {
  if (actual <= expected) {
    throw new Error(message || `Expected ${actual} to be greater than ${expected}`);
  }
}

// Функция для проверки что массив содержит значение
function assertContains(array, value, message) {
  if (!array.includes(value)) {
    throw new Error(message || `Expected array to contain ${value}`);
  }
}

async function runAllTests() {
  console.log('Запуск unit тестов для webhook endpoint...\n');

  const mockStockService = new MockStockService();
  
  // Создание тестового приложения с полным набором middleware (как в server.js)
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Обработка ошибок парсинга JSON (как в server.js)
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: 'Invalid JSON in request body'
      });
    }
    next(err);
  });
  
  app.use('/', createMoySkladWebhookRouter(mockStockService));
  
  const server = app.listen(3002);
  const baseUrl = 'http://localhost:3002';

  try {
    console.log('=== Тест парсинга product.id из payload (Требование 4.1, 4.2) ===\n');

    await runTest('должен корректно извлечь product.id из event.meta.href', async () => {
      mockStockService.reset();
      
      const payload = {
        events: [{
          action: 'UPDATE',
          meta: {
            href: 'https://api.moysklad.ru/api/remap/1.2/entity/product/f8a2da33-bf0a-11ef-0a80-17e3002d7201',
            type: 'product'
          }
        }]
      };

      const response = await axios.post(`${baseUrl}/webhook/moysklad`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MoySklad-Webhook/1.0'
        }
      });

      assertEqual(response.status, 200, 'Статус должен быть 200');
      assertEqual(response.data.productId, 'f8a2da33-bf0a-11ef-0a80-17e3002d7201', 'product.id должен быть извлечен');
      assertEqual(response.data.status, 'accepted', 'Статус должен быть accepted');

      // Ждем асинхронную обработку
      await wait(50);

      // Проверяем что StockService был вызван с правильным productId
      const lastCall = mockStockService.getLastCall();
      assert(lastCall, 'StockService должен быть вызван');
      assertEqual(lastCall.method, 'handleStockUpdate', 'Должен быть вызван handleStockUpdate');
      assertEqual(lastCall.productId, 'f8a2da33-bf0a-11ef-0a80-17e3002d7201', 'productId должен совпадать');
    });

    await runTest('должен извлечь product.id из альтернативного формата', async () => {
      mockStockService.reset();
      
      const payload = {
        meta: {
          href: 'https://api.moysklad.ru/api/remap/1.2/entity/product/a1b2c3d4-e5f6-11ef-0a80-17e3002d7202',
          type: 'product'
        },
        action: 'UPDATE',
        entityType: 'product'
      };

      const response = await axios.post(`${baseUrl}/webhook/moysklad`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MoySklad-Webhook/1.0'
        }
      });

      assertEqual(response.status, 200, 'Статус должен быть 200');
      assertEqual(response.data.productId, 'a1b2c3d4-e5f6-11ef-0a80-17e3002d7202', 'product.id должен быть извлечен');
    });

    await runTest('должен обработать различные форматы UUID', async () => {
      const testCases = [
        'f8a2da33-bf0a-11ef-0a80-17e3002d7201',
        'A1B2C3D4-E5F6-11EF-0A80-17E3002D7202', // uppercase
        '12345678-1234-1234-1234-123456789abc'  // mixed
      ];

      for (const uuid of testCases) {
        mockStockService.reset();
        
        const payload = {
          events: [{
            action: 'UPDATE',
            meta: {
              href: `https://api.moysklad.ru/api/remap/1.2/entity/product/${uuid}`,
              type: 'product'
            }
          }]
        };

        const response = await axios.post(`${baseUrl}/webhook/moysklad`, payload, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'MoySklad-Webhook/1.0'
          }
        });

        assertEqual(response.status, 200, `Статус должен быть 200 для UUID ${uuid}`);
        assertEqual(response.data.productId, uuid, `product.id должен быть ${uuid}`);
      }
    });

    console.log('\n=== Тест обработки webhook с product.id (Требование 4.2, 4.3, 4.4) ===\n');

    await runTest('должен обработать валидный webhook с типом product', async () => {
      mockStockService.reset();
      
      const payload = {
        events: [{
          action: 'UPDATE',
          meta: {
            href: 'https://api.moysklad.ru/api/remap/1.2/entity/product/f8a2da33-bf0a-11ef-0a80-17e3002d7201',
            type: 'product'
          }
        }]
      };

      const response = await axios.post(`${baseUrl}/webhook/moysklad`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MoySklad-Webhook/1.0'
        }
      });

      assertEqual(response.status, 200, 'Статус должен быть 200');
      assertEqual(response.data.status, 'accepted', 'Статус должен быть accepted');
      assertEqual(response.data.message, 'Webhook received and processing', 'Сообщение должно быть корректным');
      assertEqual(response.data.productId, 'f8a2da33-bf0a-11ef-0a80-17e3002d7201', 'product.id должен быть в ответе');

      // Ждем асинхронную обработку
      await wait(50);

      // Проверяем что StockService был вызван
      assertEqual(mockStockService.calls.length, 1, 'StockService должен быть вызван один раз');
    });

    await runTest('должен обработать различные типы событий связанных с остатками', async () => {
      const stockRelatedTypes = ['product', 'stock', 'enter', 'loss', 'move', 'customerorder', 'demand'];

      for (const entityType of stockRelatedTypes) {
        mockStockService.reset();

        const payload = {
          events: [{
            action: 'UPDATE',
            meta: {
              href: `https://api.moysklad.ru/api/remap/1.2/entity/${entityType}/test-id-123`,
              type: entityType
            }
          }]
        };

        const response = await axios.post(`${baseUrl}/webhook/moysklad`, payload, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'MoySklad-Webhook/1.0'
          }
        });

        assertEqual(response.status, 200, `Статус должен быть 200 для типа ${entityType}`);
        assertEqual(response.data.status, 'accepted', `Статус должен быть accepted для типа ${entityType}`);

        // Ждем асинхронную обработку
        await wait(50);

        // Проверяем что StockService был вызван для каждого типа
        assertGreaterThan(mockStockService.calls.length, 0, `StockService должен быть вызван для типа ${entityType}`);
      }
    });

    await runTest('должен обработать различные actions (CREATE, UPDATE, DELETE)', async () => {
      const actions = ['CREATE', 'UPDATE', 'DELETE'];

      for (const action of actions) {
        mockStockService.reset();

        const payload = {
          events: [{
            action: action,
            meta: {
              href: 'https://api.moysklad.ru/api/remap/1.2/entity/product/test-id-456',
              type: 'product'
            }
          }]
        };

        const response = await axios.post(`${baseUrl}/webhook/moysklad`, payload, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'MoySklad-Webhook/1.0'
          }
        });

        assertEqual(response.status, 200, `Статус должен быть 200 для action ${action}`);
        assertEqual(response.data.status, 'accepted', `Статус должен быть accepted для action ${action}`);

        // Ждем асинхронную обработку
        await wait(50);

        // Проверяем что StockService был вызван для каждого action
        assertGreaterThan(mockStockService.calls.length, 0, `StockService должен быть вызван для action ${action}`);
      }
    });

    await runTest('должен проигнорировать webhook не связанный с остатками', async () => {
      mockStockService.reset();
      
      const payload = {
        events: [{
          action: 'UPDATE',
          meta: {
            href: 'https://api.moysklad.ru/api/remap/1.2/entity/counterparty/a1b2c3d4-e5f6-11ef-0a80-17e3002d7202',
            type: 'counterparty'
          }
        }]
      };

      const response = await axios.post(`${baseUrl}/webhook/moysklad`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MoySklad-Webhook/1.0'
        }
      });

      assertEqual(response.status, 200, 'Статус должен быть 200');
      assertEqual(response.data.status, 'ignored', 'Статус должен быть ignored');
      assertEqual(response.data.message, 'Not a stock change event', 'Сообщение должно быть корректным');

      // Ждем немного
      await wait(50);

      // Проверяем что StockService НЕ был вызван
      assertEqual(mockStockService.calls.length, 0, 'StockService не должен быть вызван');
    });

    console.log('\n=== Тест обработки невалидного payload (Требование 4.1, 4.2, 4.5) ===\n');

    await runTest('должен отклонить webhook с некорректным Content-Type', async () => {
      mockStockService.reset();
      
      const payload = {
        events: [{
          action: 'UPDATE',
          meta: {
            href: 'https://api.moysklad.ru/api/remap/1.2/entity/product/f8a2da33-bf0a-11ef-0a80-17e3002d7201',
            type: 'product'
          }
        }]
      };

      try {
        await axios.post(`${baseUrl}/webhook/moysklad`, JSON.stringify(payload), {
          headers: {
            'Content-Type': 'text/plain',
            'User-Agent': 'MoySklad-Webhook/1.0'
          }
        });
        throw new Error('Запрос должен был быть отклонен');
      } catch (error) {
        if (error.response) {
          assertEqual(error.response.status, 401, 'Статус должен быть 401');
          assertEqual(error.response.data.error, 'Unauthorized', 'Ошибка должна быть Unauthorized');
          assertEqual(error.response.data.message, 'Webhook validation failed', 'Сообщение должно быть корректным');

          // Проверяем что StockService НЕ был вызван
          await wait(50);
          assertEqual(mockStockService.calls.length, 0, 'StockService не должен быть вызван');
        } else {
          throw error;
        }
      }
    });

    await runTest('должен обработать невалидный JSON (ошибка парсинга)', async () => {
      mockStockService.reset();
      
      try {
        // Отправляем невалидный JSON напрямую, без автоматической сериализации axios
        await axios({
          method: 'post',
          url: `${baseUrl}/webhook/moysklad`,
          data: 'invalid json {',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'MoySklad-Webhook/1.0'
          },
          transformRequest: [(data) => data] // Отключаем автоматическую сериализацию
        });
        throw new Error('Запрос должен был быть отклонен');
      } catch (error) {
        if (error.response) {
          // Express middleware обрабатывает ошибку парсинга JSON
          assertEqual(error.response.status, 400, 'Статус должен быть 400');
          assertEqual(error.response.data.error, 'Bad Request', 'Ошибка должна быть Bad Request');
          assertEqual(error.response.data.message, 'Invalid JSON in request body', 'Сообщение должно быть корректным');

          // Проверяем что StockService НЕ был вызван
          await wait(50);
          assertEqual(mockStockService.calls.length, 0, 'StockService не должен быть вызван');
        } else {
          throw error;
        }
      }
    });

    await runTest('должен отклонить webhook с пустым объектом', async () => {
      mockStockService.reset();
      
      try {
        await axios.post(`${baseUrl}/webhook/moysklad`, {}, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'MoySklad-Webhook/1.0'
          }
        });
        throw new Error('Запрос должен был быть отклонен');
      } catch (error) {
        if (error.response) {
          assertEqual(error.response.status, 400, 'Статус должен быть 400');
          assertEqual(error.response.data.error, 'Bad Request', 'Ошибка должна быть Bad Request');

          // Проверяем что StockService НЕ был вызван
          await wait(50);
          assertEqual(mockStockService.calls.length, 0, 'StockService не должен быть вызван');
        } else {
          throw error;
        }
      }
    });

    await runTest('должен вернуть 200 OK если не удалось извлечь product.id (Требование 4.5)', async () => {
      mockStockService.reset();
      
      const payload = {
        events: [{
          action: 'UPDATE',
          meta: {
            // href отсутствует
            type: 'product'
          }
        }]
      };

      const response = await axios.post(`${baseUrl}/webhook/moysklad`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MoySklad-Webhook/1.0'
        }
      });

      // Должен вернуть 200 OK чтобы МойСклад не повторял webhook
      assertEqual(response.status, 200, 'Статус должен быть 200');
      assertEqual(response.data.status, 'ignored', 'Статус должен быть ignored');
      assertEqual(response.data.message, 'Could not extract product.id from webhook', 'Сообщение должно быть корректным');

      // Проверяем что StockService НЕ был вызван
      await wait(50);
      assertEqual(mockStockService.calls.length, 0, 'StockService не должен быть вызван');
    });

    await runTest('должен вернуть 200 OK если events массив пустой', async () => {
      mockStockService.reset();
      
      const payload = {
        events: []
      };

      const response = await axios.post(`${baseUrl}/webhook/moysklad`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MoySklad-Webhook/1.0'
        }
      });

      assertEqual(response.status, 200, 'Статус должен быть 200');
      assertEqual(response.data.status, 'ignored', 'Статус должен быть ignored');

      // Проверяем что StockService НЕ был вызван
      await wait(50);
      assertEqual(mockStockService.calls.length, 0, 'StockService не должен быть вызван');
    });

    await runTest('должен вернуть 200 OK если meta.href имеет некорректный формат', async () => {
      mockStockService.reset();
      
      const payload = {
        events: [{
          action: 'UPDATE',
          meta: {
            href: 'invalid-url-format',
            type: 'product'
          }
        }]
      };

      const response = await axios.post(`${baseUrl}/webhook/moysklad`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MoySklad-Webhook/1.0'
        }
      });

      assertEqual(response.status, 200, 'Статус должен быть 200');
      // Даже с некорректным форматом, product.id будет извлечен (последняя часть URL)
      assertEqual(response.data.productId, 'invalid-url-format', 'product.id должен быть извлечен');
    });

    console.log('\n=== Тест возврата HTTP 200 OK (Требование 4.5) ===\n');

    await runTest('должен всегда возвращать 200 OK для валидных webhook', async () => {
      mockStockService.reset();
      
      const payload = {
        events: [{
          action: 'UPDATE',
          meta: {
            href: 'https://api.moysklad.ru/api/remap/1.2/entity/product/f8a2da33-bf0a-11ef-0a80-17e3002d7201',
            type: 'product'
          }
        }]
      };

      const response = await axios.post(`${baseUrl}/webhook/moysklad`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MoySklad-Webhook/1.0'
        }
      });

      assertEqual(response.status, 200, 'Статус должен быть 200');
      assert(response.data.status, 'Ответ должен содержать status');
      assert(response.data.message, 'Ответ должен содержать message');
    });

    await runTest('должен возвращать 200 OK даже если товар не найден в маппинге', async () => {
      mockStockService.reset();
      
      const payload = {
        events: [{
          action: 'UPDATE',
          meta: {
            href: 'https://api.moysklad.ru/api/remap/1.2/entity/product/nonexistent-product-id',
            type: 'product'
          }
        }]
      };

      const response = await axios.post(`${baseUrl}/webhook/moysklad`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MoySklad-Webhook/1.0'
        }
      });

      assertEqual(response.status, 200, 'Статус должен быть 200');
      assertEqual(response.data.status, 'accepted', 'Статус должен быть accepted');
    });

    await runTest('должен возвращать 200 OK для игнорируемых событий', async () => {
      mockStockService.reset();
      
      const payload = {
        events: [{
          action: 'UPDATE',
          meta: {
            href: 'https://api.moysklad.ru/api/remap/1.2/entity/counterparty/test-id',
            type: 'counterparty'
          }
        }]
      };

      const response = await axios.post(`${baseUrl}/webhook/moysklad`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MoySklad-Webhook/1.0'
        }
      });

      assertEqual(response.status, 200, 'Статус должен быть 200');
      assertEqual(response.data.status, 'ignored', 'Статус должен быть ignored');
    });

    await runTest('должен возвращать корректную структуру ответа', async () => {
      mockStockService.reset();
      
      const payload = {
        events: [{
          action: 'UPDATE',
          meta: {
            href: 'https://api.moysklad.ru/api/remap/1.2/entity/product/f8a2da33-bf0a-11ef-0a80-17e3002d7201',
            type: 'product'
          }
        }]
      };

      const response = await axios.post(`${baseUrl}/webhook/moysklad`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MoySklad-Webhook/1.0'
        }
      });

      assertEqual(response.status, 200, 'Статус должен быть 200');
      assert(response.headers['content-type'].includes('json'), 'Content-Type должен быть json');
      assert(response.data.status, 'Ответ должен содержать status');
      assert(response.data.message, 'Ответ должен содержать message');
      assertContains(['accepted', 'ignored', 'error'], response.data.status, 'status должен быть одним из accepted, ignored, error');
    });

    console.log('\n' + '='.repeat(60));
    console.log(`Всего тестов: ${testsRun}`);
    console.log(`Пройдено: ${testsPassed}`);
    console.log(`Провалено: ${testsFailed}`);
    console.log('='.repeat(60));

    if (testsFailed === 0) {
      console.log('\n✅ Все unit тесты пройдены успешно!\n');
      process.exit(0);
    } else {
      console.log('\n❌ Некоторые тесты провалены\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Критическая ошибка при выполнении тестов:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    server.close();
    console.log('Тестовый сервер остановлен');
  }
}

// Запуск тестов
if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
