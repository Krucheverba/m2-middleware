/**
 * End-to-End Integration тесты для рефакторинга product.id → offerId
 * 
 * Проверяет:
 * - End-to-end синхронизацию остатков (product.id → offerId → M2)
 * - End-to-end обработку заказов (M2 offerId → product.id → МойСклад)
 * - Обработку webhook с product.id
 * - Миграцию данных из атрибутов в файл
 * 
 * Требования: 1.5, 2.5, 4.5, 5.5, 7.5, 10.5
 */

require('dotenv').config({ path: '.env.test' });

const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const axios = require('axios');

// Импорт реальных компонентов
const ProductMappingStore = require('./src/storage/productMappingStore');
const OrderMappingStore = require('./src/storage/orderMappingStore');
const MapperService = require('./src/services/mapperService');
const StockService = require('./src/services/stockService');
const OrderService = require('./src/services/orderService');
const MigrationService = require('./src/services/migrationService');
const createMoySkladWebhookRouter = require('./src/routes/moySkladWebhook');

// Mock клиенты для изоляции от внешних API
class MockMoySkladClient {
  constructor() {
    this.products = new Map();
    this.stocks = new Map();
    this.orders = [];
    this.shipments = [];
    
    // Симуляция товаров с атрибутами для миграции
    this.productsWithAttributes = [
      {
        id: 'f8a2da33-bf0a-11ef-0a80-17e3002d7201',
        name: 'Test Product 1',
        attributes: [
          { name: 'offerId', value: 'OFFER-001-M2' }
        ]
      },
      {
        id: 'a1b2c3d4-e5f6-11ef-0a80-17e3002d7202',
        name: 'Test Product 2',
        attributes: [
          { name: 'offerId', value: 'OFFER-002-M2' }
        ]
      },
      {
        id: 'b2c3d4e5-f6a7-11ef-0a80-17e3002d7203',
        name: 'Test Product 3',
        attributes: [] // Нет атрибута offerId
      }
    ];
  }

  async getProductById(productId) {
    return {
      id: productId,
      name: `Product ${productId}`,
      code: `CODE-${productId}`
    };
  }

  async getProductStock(productId) {
    const stock = this.stocks.get(productId) || 10;
    return {
      productId,
      totalStock: stock,
      totalReserve: 2,
      availableStock: stock - 2,
      stockByStore: []
    };
  }

  async createCustomerOrder(orderData) {
    const order = {
      id: `ms-order-${Date.now()}`,
      name: orderData.name,
      description: orderData.description,
      positions: orderData.positions,
      created: new Date().toISOString()
    };
    this.orders.push(order);
    return order;
  }

  async createShipment(shipmentData) {
    const shipment = {
      id: `ms-shipment-${Date.now()}`,
      name: `Shipment ${this.shipments.length + 1}`,
      customerOrder: shipmentData.customerOrder,
      created: new Date().toISOString()
    };
    this.shipments.push(shipment);
    return shipment;
  }

  // Для миграции
  get client() {
    return {
      get: async (endpoint, options) => {
        if (endpoint === '/entity/product') {
          return {
            data: {
              rows: this.productsWithAttributes
            }
          };
        }
        throw new Error(`Unknown endpoint: ${endpoint}`);
      }
    };
  }
}

class MockYandexClient {
  constructor() {
    this.stockUpdates = [];
    this.orders = [];
  }

  async updateStocks(stockUpdates) {
    this.stockUpdates.push(...stockUpdates);
    return { success: true };
  }

  async getOrders(filters) {
    return this.orders.filter(order => {
      if (filters.status) {
        return order.status === filters.status;
      }
      return true;
    });
  }
}

// Утилиты для тестов
async function cleanupTestFiles(files) {
  for (const file of files) {
    try {
      await fs.unlink(file);
    } catch (e) {
      // Игнорировать если файл не существует
    }
  }
}

async function createTestMappingFile(filePath, mappings) {
  const data = {
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    mappings
  };
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// Тесты
async function runIntegrationTests() {
  console.log('🧪 End-to-End Integration тесты\n');
  console.log('='.repeat(60));

  const testFiles = [
    './data/test-e2e-product-mappings.json',
    './data/test-e2e-order-mappings.json',
    './data/test-e2e-migration.json'
  ];

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Очистка перед тестами
    await cleanupTestFiles(testFiles);

    // ========================================
    // Тест 1: End-to-end синхронизация остатков
    // ========================================
    console.log('\n📦 Тест 1: End-to-end синхронизация остатков');
    console.log('-'.repeat(60));

    try {
      // Подготовка
      const productMappingFile = testFiles[0];
      await createTestMappingFile(productMappingFile, {
        'f8a2da33-bf0a-11ef-0a80-17e3002d7201': 'OFFER-001-M2',
        'a1b2c3d4-e5f6-11ef-0a80-17e3002d7202': 'OFFER-002-M2',
        'b2c3d4e5-f6a7-11ef-0a80-17e3002d7203': 'OFFER-003-M2'
      });

      const mockMoySklad = new MockMoySkladClient();
      const mockYandex = new MockYandexClient();
      const productStore = new ProductMappingStore(productMappingFile);
      const orderStore = new OrderMappingStore(testFiles[1]);
      const mapper = new MapperService(mockMoySklad, productStore, orderStore);
      const stockService = new StockService(mockMoySklad, mockYandex, mapper);

      // Установить остатки в МойСклад
      mockMoySklad.stocks.set('f8a2da33-bf0a-11ef-0a80-17e3002d7201', 15);
      mockMoySklad.stocks.set('a1b2c3d4-e5f6-11ef-0a80-17e3002d7202', 20);
      mockMoySklad.stocks.set('b2c3d4e5-f6a7-11ef-0a80-17e3002d7203', 5);

      // Загрузить маппинги
      await mapper.loadMappings();
      console.log('  ✓ Маппинги загружены');

      // Выполнить синхронизацию
      const syncResult = await stockService.syncStocks();
      
      console.log(`  ✓ Синхронизация завершена: ${syncResult.synced}/${syncResult.total} товаров`);

      // Проверки
      if (syncResult.total !== 3) {
        throw new Error(`Ожидалось 3 товара, получено ${syncResult.total}`);
      }
      if (syncResult.synced !== 3) {
        throw new Error(`Ожидалось 3 синхронизированных товара, получено ${syncResult.synced}`);
      }
      if (mockYandex.stockUpdates.length !== 3) {
        throw new Error(`Ожидалось 3 обновления в M2, получено ${mockYandex.stockUpdates.length}`);
      }

      // Проверить что правильные offerId отправлены в M2
      const offerIds = mockYandex.stockUpdates.map(u => u.offerId).sort();
      const expectedOfferIds = ['OFFER-001-M2', 'OFFER-002-M2', 'OFFER-003-M2'].sort();
      if (JSON.stringify(offerIds) !== JSON.stringify(expectedOfferIds)) {
        throw new Error(`Неправильные offerId отправлены в M2: ${offerIds.join(', ')}`);
      }

      // Проверить правильность остатков
      const update1 = mockYandex.stockUpdates.find(u => u.offerId === 'OFFER-001-M2');
      if (update1.count !== 13) { // 15 - 2 (резерв)
        throw new Error(`Неправильный остаток для OFFER-001-M2: ${update1.count}`);
      }

      console.log('  ✓ Все остатки корректно синхронизированы в M2');
      console.log('  ✓ Маппинг product.id → offerId работает корректно');
      console.log('✅ Тест 1 ПРОЙДЕН\n');
      testsPassed++;

    } catch (error) {
      console.error('❌ Тест 1 ПРОВАЛЕН:', error.message);
      testsFailed++;
    }

    // ========================================
    // Тест 2: End-to-end обработка заказов
    // ========================================
    console.log('\n📋 Тест 2: End-to-end обработка заказов');
    console.log('-'.repeat(60));

    try {
      // Подготовка
      const productMappingFile = testFiles[0];
      const orderMappingFile = testFiles[1];

      const mockMoySklad = new MockMoySkladClient();
      const mockYandex = new MockYandexClient();
      const productStore = new ProductMappingStore(productMappingFile);
      const orderStore = new OrderMappingStore(orderMappingFile);
      const mapper = new MapperService(mockMoySklad, productStore, orderStore);
      const orderService = new OrderService(mockYandex, mockMoySklad, mapper);

      // Загрузить маппинги
      await mapper.loadMappings();
      console.log('  ✓ Маппинги загружены');

      // Создать тестовый заказ из M2
      const m2Order = {
        id: 'M2-ORDER-12345',
        status: 'PROCESSING',
        items: [
          {
            offerId: 'OFFER-001-M2',
            count: 2,
            price: 1500,
            shopSku: 'SKU-001',
            offerName: 'Test Product 1'
          },
          {
            offerId: 'OFFER-002-M2',
            count: 1,
            price: 2000,
            shopSku: 'SKU-002',
            offerName: 'Test Product 2'
          },
          {
            offerId: 'OFFER-UNKNOWN',
            count: 1,
            price: 500,
            shopSku: 'SKU-999',
            offerName: 'Unknown Product'
          }
        ],
        delivery: {
          address: {
            city: 'Москва',
            street: 'Тестовая',
            house: '1'
          },
          recipient: {
            firstName: 'Иван',
            lastName: 'Иванов',
            phone: '+79991234567'
          }
        }
      };

      // Обработать заказ
      const msOrder = await orderService.createMoySkladOrder(m2Order);
      
      console.log(`  ✓ Заказ создан в МойСклад: ${msOrder.id}`);

      // Проверки
      if (!msOrder.id) {
        throw new Error('Заказ не создан в МойСклад');
      }
      if (msOrder.positions.length !== 2) {
        throw new Error(`Ожидалось 2 позиции (1 пропущена), получено ${msOrder.positions.length}`);
      }

      // Проверить что маппинг заказа сохранен
      const savedMsOrderId = await mapper.getMoySkladOrderId(m2Order.id);
      if (savedMsOrderId !== msOrder.id) {
        throw new Error('Маппинг заказа не сохранен');
      }

      console.log('  ✓ Маппинг offerId → product.id работает корректно');
      console.log('  ✓ Позиции без маппинга пропущены');
      console.log('  ✓ Маппинг заказа сохранен');
      console.log('✅ Тест 2 ПРОЙДЕН\n');
      testsPassed++;

    } catch (error) {
      console.error('❌ Тест 2 ПРОВАЛЕН:', error.message);
      testsFailed++;
    }

    // ========================================
    // Тест 3: Обработка webhook с product.id
    // ========================================
    console.log('\n🔔 Тест 3: Обработка webhook с product.id');
    console.log('-'.repeat(60));

    try {
      // Подготовка
      const productMappingFile = testFiles[0];
      const mockMoySklad = new MockMoySkladClient();
      const mockYandex = new MockYandexClient();
      const productStore = new ProductMappingStore(productMappingFile);
      const orderStore = new OrderMappingStore(testFiles[1]);
      const mapper = new MapperService(mockMoySklad, productStore, orderStore);
      const stockService = new StockService(mockMoySklad, mockYandex, mapper);

      // Загрузить маппинги
      await mapper.loadMappings();

      // Установить остаток
      mockMoySklad.stocks.set('f8a2da33-bf0a-11ef-0a80-17e3002d7201', 25);

      // Создать Express приложение для webhook
      const app = express();
      app.use(express.json());
      app.use('/', createMoySkladWebhookRouter(stockService));

      const server = app.listen(0); // Случайный порт
      const port = server.address().port;

      console.log(`  ✓ Webhook сервер запущен на порту ${port}`);

      // Отправить webhook
      const webhookPayload = {
        events: [
          {
            meta: {
              type: 'product',
              href: 'https://api.moysklad.ru/api/remap/1.2/entity/product/f8a2da33-bf0a-11ef-0a80-17e3002d7201'
            },
            action: 'UPDATE',
            accountId: 'test-account'
          }
        ]
      };

      const response = await axios.post(
        `http://localhost:${port}/webhook/moysklad`,
        webhookPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'MoySklad-Webhook'
          }
        }
      );

      console.log(`  ✓ Webhook отправлен, статус: ${response.status}`);

      // Подождать обработки (асинхронная)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Проверки
      if (response.status !== 200) {
        throw new Error(`Ожидался статус 200, получен ${response.status}`);
      }
      if (response.data.status !== 'accepted') {
        throw new Error(`Webhook не принят: ${response.data.status}`);
      }
      if (mockYandex.stockUpdates.length === 0) {
        throw new Error('Остатки не обновлены в M2');
      }

      const stockUpdate = mockYandex.stockUpdates[0];
      if (stockUpdate.offerId !== 'OFFER-001-M2') {
        throw new Error(`Неправильный offerId: ${stockUpdate.offerId}`);
      }
      if (stockUpdate.count !== 23) { // 25 - 2 (резерв)
        throw new Error(`Неправильный остаток: ${stockUpdate.count}`);
      }

      server.close();

      console.log('  ✓ product.id извлечен из webhook');
      console.log('  ✓ Маппинг product.id → offerId выполнен');
      console.log('  ✓ Остатки обновлены в M2');
      console.log('✅ Тест 3 ПРОЙДЕН\n');
      testsPassed++;

    } catch (error) {
      console.error('❌ Тест 3 ПРОВАЛЕН:', error.message);
      testsFailed++;
    }

    // ========================================
    // Тест 4: Миграция данных из атрибутов
    // ========================================
    console.log('\n🔄 Тест 4: Миграция данных из атрибутов');
    console.log('-'.repeat(60));

    try {
      // Подготовка
      const migrationFile = testFiles[2];
      const mockMoySklad = new MockMoySkladClient();
      const productStore = new ProductMappingStore(migrationFile);
      const migrationService = new MigrationService(mockMoySklad, productStore);

      console.log('  ✓ MigrationService создан');

      // Выполнить миграцию
      const migrationResult = await migrationService.migrateFromAttributes();

      console.log(`  ✓ Миграция завершена: ${migrationResult.migratedMappings}/${migrationResult.totalProducts} товаров`);

      // Проверки
      if (migrationResult.totalProducts !== 3) {
        throw new Error(`Ожидалось 3 товара, получено ${migrationResult.totalProducts}`);
      }
      if (migrationResult.migratedMappings !== 2) {
        throw new Error(`Ожидалось 2 маппинга, получено ${migrationResult.migratedMappings}`);
      }
      if (migrationResult.skippedProducts !== 1) {
        throw new Error(`Ожидался 1 пропущенный товар, получено ${migrationResult.skippedProducts}`);
      }

      // Проверить что файл создан
      const fileContent = await fs.readFile(migrationFile, 'utf8');
      const data = JSON.parse(fileContent);

      if (!data.mappings) {
        throw new Error('Файл маппинга не содержит mappings');
      }
      if (Object.keys(data.mappings).length !== 2) {
        throw new Error(`Ожидалось 2 маппинга в файле, получено ${Object.keys(data.mappings).length}`);
      }

      // Проверить корректность маппингов
      if (data.mappings['f8a2da33-bf0a-11ef-0a80-17e3002d7201'] !== 'OFFER-001-M2') {
        throw new Error('Неправильный маппинг для f8a2da33-bf0a-11ef-0a80-17e3002d7201');
      }
      if (data.mappings['a1b2c3d4-e5f6-11ef-0a80-17e3002d7202'] !== 'OFFER-002-M2') {
        throw new Error('Неправильный маппинг для a1b2c3d4-e5f6-11ef-0a80-17e3002d7202');
      }

      // Проверить валидацию
      const validation = await migrationService.validateMappings();
      if (!validation.isValid) {
        console.log('  ⚠️  Детали валидации:', JSON.stringify(validation, null, 2));
        throw new Error('Валидация маппингов не прошла');
      }
      if (validation.totalMappings !== 2) {
        throw new Error(`Валидация: ожидалось 2 маппинга, получено ${validation.totalMappings}`);
      }

      console.log('  ✓ Маппинги извлечены из атрибутов');
      console.log('  ✓ Файл маппинга создан');
      console.log('  ✓ Валидация маппингов пройдена');
      console.log('✅ Тест 4 ПРОЙДЕН\n');
      testsPassed++;

    } catch (error) {
      console.error('❌ Тест 4 ПРОВАЛЕН:', error.message);
      testsFailed++;
    }

    // ========================================
    // Итоги
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 ИТОГИ ТЕСТИРОВАНИЯ');
    console.log('='.repeat(60));
    console.log(`✅ Пройдено: ${testsPassed}`);
    console.log(`❌ Провалено: ${testsFailed}`);
    console.log(`📝 Всего: ${testsPassed + testsFailed}`);

    if (testsFailed === 0) {
      console.log('\n🎉 ВСЕ INTEGRATION ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!');
      console.log('\nПроверенные сценарии:');
      console.log('  ✓ End-to-end синхронизация остатков (product.id → offerId → M2)');
      console.log('  ✓ End-to-end обработка заказов (M2 offerId → product.id → МойСклад)');
      console.log('  ✓ Обработка webhook с product.id');
      console.log('  ✓ Миграция данных из атрибутов в файл');
      console.log('\nСистема готова к продакшену! 🚀\n');
    } else {
      console.log('\n⚠️  НЕКОТОРЫЕ ТЕСТЫ НЕ ПРОШЛИ');
      console.log('Проверьте ошибки выше для деталей\n');
    }

  } catch (error) {
    console.error('\n💥 КРИТИЧЕСКАЯ ОШИБКА:', error.message);
    console.error(error.stack);
  } finally {
    // Очистка после тестов
    await cleanupTestFiles(testFiles);
    console.log('🧹 Тестовые файлы очищены\n');
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Запуск тестов
if (require.main === module) {
  runIntegrationTests();
}

module.exports = { runIntegrationTests };
