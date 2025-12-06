/**
 * Упрощённый тест для webhook endpoint
 * Проверяет маршруты без полной инициализации сервисов
 */

require('dotenv').config({ path: '.env.test' });

const express = require('express');
const axios = require('axios');
const createMoySkladWebhookRouter = require('./src/routes/moySkladWebhook');

// Мок StockService
class MockStockService {
  async handleStockUpdate(productId) {
    console.log('  [Mock] handleStockUpdate вызван с productId:', productId);
    return;
  }
  
  async handleStockWebhook(webhookData) {
    console.log('  [Mock] handleStockWebhook вызван с:', {
      action: webhookData.action,
      entityType: webhookData.entityType
    });
    return Promise.resolve();
  }
}

async function testWebhook() {
  console.log('Запуск упрощённого теста webhook endpoint...\n');

  const app = express();
  app.use(express.json());
  
  const mockStockService = new MockStockService();
  app.use('/', createMoySkladWebhookRouter(mockStockService));

  const server = app.listen(3001);
  const baseUrl = 'http://localhost:3001';

  try {
    console.log('✓ Тестовый сервер запущен на порту 3001\n');

    // Тест 1: Валидный webhook с изменением остатков
    console.log('1. Тест валидного webhook (изменение остатков)...');
    const validWebhook = {
      events: [{
        action: 'UPDATE',
        meta: {
          href: 'https://api.moysklad.ru/api/remap/1.2/entity/product/f8a2da33-bf0a-11ef-0a80-17e3002d7201',
          type: 'product'
        }
      }]
    };

    const response1 = await axios.post(
      `${baseUrl}/webhook/moysklad`,
      validWebhook,
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MoySklad-Webhook/1.0'
        }
      }
    );
    
    console.log('✓ Статус:', response1.status);
    console.log('✓ Ответ:', response1.data);
    if (response1.data.status === 'accepted' && response1.data.productId === 'f8a2da33-bf0a-11ef-0a80-17e3002d7201') {
      console.log('✓ product.id корректно извлечен:', response1.data.productId);
    }
    console.log();

    // Тест 2: Webhook с некорректным Content-Type
    console.log('2. Тест webhook с некорректным Content-Type...');
    try {
      await axios.post(
        `${baseUrl}/webhook/moysklad`,
        'plain text data',
        {
          headers: {
            'Content-Type': 'text/plain',
            'User-Agent': 'MoySklad-Webhook/1.0'
          }
        }
      );
      console.log('✗ Webhook не должен был быть принят');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('✓ Webhook отклонён (401 Unauthorized)');
        console.log('✓ Ответ:', error.response.data);
      } else {
        throw error;
      }
    }
    console.log();

    // Тест 3: Webhook с пустым объектом
    console.log('3. Тест webhook с пустым объектом...');
    try {
      await axios.post(
        `${baseUrl}/webhook/moysklad`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'MoySklad-Webhook/1.0'
          }
        }
      );
      console.log('✗ Webhook не должен был быть принят');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log('✓ Webhook отклонён (400 Bad Request)');
        console.log('✓ Ответ:', error.response.data);
      } else {
        throw error;
      }
    }
    console.log();

    // Тест 4: Webhook не связанный с остатками
    console.log('4. Тест webhook не связанного с остатками...');
    const nonStockWebhook = {
      events: [{
        action: 'UPDATE',
        meta: {
          href: 'https://api.moysklad.ru/api/remap/1.2/entity/counterparty/a1b2c3d4-e5f6-11ef-0a80-17e3002d7202',
          type: 'counterparty'
        }
      }]
    };

    const response4 = await axios.post(
      `${baseUrl}/webhook/moysklad`,
      nonStockWebhook,
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MoySklad-Webhook/1.0'
        }
      }
    );
    
    console.log('✓ Статус:', response4.status);
    console.log('✓ Ответ:', response4.data);
    console.log();

    // Тест 5: Webhook события связанные с остатками
    console.log('5. Тест различных типов событий связанных с остатками...');
    
    const stockEventTypes = [
      { entityType: 'product', desc: 'товар' },
      { entityType: 'stock', desc: 'остаток' },
      { entityType: 'enter', desc: 'оприходование' },
      { entityType: 'loss', desc: 'списание' },
      { entityType: 'move', desc: 'перемещение' },
      { entityType: 'customerorder', desc: 'заказ покупателя' },
      { entityType: 'demand', desc: 'отгрузка' }
    ];

    for (const eventType of stockEventTypes) {
      const webhook = {
        events: [{
          action: 'UPDATE',
          meta: { 
            href: `https://api.moysklad.ru/api/remap/1.2/entity/${eventType.entityType}/b1c2d3e4-f5a6-11ef-0a80-17e3002d7203`,
            type: eventType.entityType 
          }
        }]
      };

      const response = await axios.post(
        `${baseUrl}/webhook/moysklad`,
        webhook,
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'MoySklad-Webhook/1.0'
          }
        }
      );

      console.log(`  ✓ ${eventType.desc} (${eventType.entityType}): ${response.data.status}`);
    }
    console.log();

    // Тест 6: Различные actions
    console.log('6. Тест различных actions...');
    
    const actions = ['CREATE', 'UPDATE', 'DELETE'];
    
    for (const action of actions) {
      const webhook = {
        events: [{
          action: action,
          meta: { 
            href: 'https://api.moysklad.ru/api/remap/1.2/entity/product/c2d3e4f5-a6b7-11ef-0a80-17e3002d7204',
            type: 'product' 
          }
        }]
      };

      const response = await axios.post(
        `${baseUrl}/webhook/moysklad`,
        webhook,
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'MoySklad-Webhook/1.0'
          }
        }
      );

      console.log(`  ✓ Action ${action}: ${response.data.status}`);
    }
    console.log();

    console.log('✅ Все тесты пройдены успешно!');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  } finally {
    server.close();
    console.log('\n✓ Тестовый сервер остановлен');
  }
}

testWebhook();
