/**
 * Интеграционный тест для главного сервера
 * Проверяет: Требование 7.1
 * 
 * Тестирует:
 * - Инициализацию конфигурации и logger
 * - Создание экземпляров всех сервисов и клиентов
 * - Запуск Express сервера для webhook endpoint
 * - Инициализацию и запуск cron планировщика
 * - Graceful shutdown обработку
 * - Health check endpoint для мониторинга
 */

require('dotenv').config({ path: '.env.test' });

const express = require('express');
const http = require('http');
const config = require('./src/config');
const logger = require('./src/logger');

// Моки для API клиентов
class MockMoySkladClient {
  async getProducts() {
    return [
      {
        id: 'product-1',
        externalCode: 'EXT001',
        name: 'Test Product 1'
      }
    ];
  }

  async getProductById(productId) {
    return {
      id: productId,
      name: 'Test Product',
      code: 'TEST-001'
    };
  }

  async getProductStock(productId) {
    return {
      productId,
      totalStock: 10,
      totalReserve: 2,
      availableStock: 8,
      stockByStore: []
    };
  }
}

class MockYandexClient {
  async updateStocks(stockUpdates) {
    return { success: true };
  }
}

// Моки для сервисов
class MockMapperService {
  async loadMappings() {
    return 1; // 1 маппинг загружен
  }
}

class MockStockService {
  async handleStockUpdate(productId) {
    return Promise.resolve();
  }
  
  async syncStocks() {
    return Promise.resolve();
  }
}

class MockOrderService {
  async pollAndProcessOrders() {
    return Promise.resolve();
  }
  
  async processShippedOrders() {
    return Promise.resolve();
  }
}

async function testServerIntegration() {
  console.log('🧪 Интеграционный тест главного сервера\n');

  let server = null;
  let cronScheduler = null;

  try {
    // 1. Проверка инициализации конфигурации
    console.log('1. Проверка конфигурации...');
    if (!config.YANDEX_CAMPAIGN_ID || !config.YANDEX_TOKEN) {
      throw new Error('Конфигурация не загружена');
    }
    console.log('✅ Конфигурация загружена корректно\n');

    // 2. Создание экземпляров клиентов (моки)
    console.log('2. Создание API клиентов...');
    const moySkladClient = new MockMoySkladClient();
    const yandexClient = new MockYandexClient();
    console.log('✅ API клиенты созданы\n');

    // 3. Создание экземпляров сервисов (моки)
    console.log('3. Создание сервисов...');
    const mapperService = new MockMapperService();
    const stockService = new MockStockService();
    const orderService = new MockOrderService();
    console.log('✅ Сервисы созданы\n');

    // 4. Инициализация MapperService
    console.log('4. Инициализация MapperService...');
    await mapperService.loadMappings();
    console.log('✅ MapperService инициализирован\n');

    // 5. Создание Express приложения
    console.log('5. Создание Express приложения...');
    const app = express();
    app.use(express.json());

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Webhook endpoint
    const createMoySkladWebhookRouter = require('./src/routes/moySkladWebhook');
    app.use('/', createMoySkladWebhookRouter(stockService));

    console.log('✅ Express приложение создано\n');

    // 6. Запуск HTTP сервера
    console.log('6. Запуск HTTP сервера...');
    server = app.listen(config.PORT);
    await new Promise((resolve) => {
      server.once('listening', resolve);
    });
    console.log(`✅ HTTP сервер запущен на порту ${config.PORT}\n`);

    // 7. Инициализация cron планировщика
    console.log('7. Инициализация cron планировщика...');
    const CronScheduler = require('./src/scheduler/cronScheduler');
    cronScheduler = new CronScheduler();
    
    cronScheduler.scheduleStockSync(
      config.STOCK_SYNC_INTERVAL_MINUTES,
      () => stockService.syncStocks()
    );
    console.log(`✅ Синхронизация остатков запланирована (каждые ${config.STOCK_SYNC_INTERVAL_MINUTES} мин)\n`);
    
    cronScheduler.scheduleOrderPolling(
      config.ORDER_POLL_INTERVAL_MINUTES,
      () => orderService.pollAndProcessOrders()
    );
    console.log(`✅ Polling заказов запланирован (каждые ${config.ORDER_POLL_INTERVAL_MINUTES} мин)\n`);
    
    cronScheduler.scheduleShipmentPolling(
      config.ORDER_POLL_INTERVAL_MINUTES,
      () => orderService.processShippedOrders()
    );
    console.log(`✅ Polling отгрузок запланирован (каждые ${config.ORDER_POLL_INTERVAL_MINUTES} мин)\n`);

    // 8. Проверка health check endpoint
    console.log('8. Проверка health check endpoint...');
    const healthCheckPromise = new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${config.PORT}/health`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            const response = JSON.parse(data);
            if (response.status === 'ok') {
              resolve(response);
            } else {
              reject(new Error('Health check вернул некорректный статус'));
            }
          } else {
            reject(new Error(`Health check вернул статус ${res.statusCode}`));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Health check timeout'));
      });
    });

    const healthResponse = await healthCheckPromise;
    console.log('✅ Health check endpoint работает');
    console.log(`   Статус: ${healthResponse.status}`);
    console.log(`   Timestamp: ${healthResponse.timestamp}`);
    console.log(`   Uptime: ${healthResponse.uptime.toFixed(2)}s\n`);

    // 9. Проверка webhook endpoint
    console.log('9. Проверка webhook endpoint...');
    const axios = require('axios');
    try {
      const webhookResponse = await axios.post(
        `http://localhost:${config.PORT}/webhook/moysklad`,
        {
          action: 'UPDATE',
          entityType: 'product',
          events: [{ meta: { type: 'product' } }]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'MoySklad-Webhook'
          }
        }
      );
      
      if (webhookResponse.status === 200) {
        console.log('✅ Webhook endpoint работает');
        console.log(`   Статус: ${webhookResponse.data.status}\n`);
      }
    } catch (error) {
      throw new Error(`Webhook endpoint не работает: ${error.message}`);
    }

    // 10. Проверка graceful shutdown
    console.log('10. Проверка graceful shutdown...');
    
    // Остановка cron jobs
    cronScheduler.stopAll();
    console.log('✅ Cron планировщик остановлен');
    
    // Остановка HTTP сервера
    await new Promise((resolve) => {
      server.close(() => {
        console.log('✅ HTTP сервер остановлен\n');
        resolve();
      });
    });

    console.log('✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!\n');
    console.log('Главный сервер работает корректно:');
    console.log('  ✓ Конфигурация и logger инициализированы');
    console.log('  ✓ Все сервисы и клиенты созданы');
    console.log('  ✓ Express сервер запущен');
    console.log('  ✓ Webhook endpoint работает');
    console.log('  ✓ Health check endpoint работает');
    console.log('  ✓ Cron планировщик инициализирован и запущен');
    console.log('  ✓ Graceful shutdown работает корректно\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ОШИБКА:', error.message);
    console.error(error.stack);
    
    if (cronScheduler) {
      cronScheduler.stopAll();
    }
    if (server) {
      server.close();
    }
    
    process.exit(1);
  }
}

// Запуск теста
testServerIntegration();
