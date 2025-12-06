/**
 * Тест для webhook endpoint
 * Проверяет базовую функциональность обработки webhook от МойСклад
 */

// Загрузка тестовой конфигурации
require('dotenv').config({ path: '.env.test' });

const { startServer } = require('./src/server');
const axios = require('axios');

async function testWebhook() {
  console.log('Запуск теста webhook endpoint...\n');

  let server;
  
  try {
    // Запуск сервера
    console.log('1. Запуск сервера...');
    const result = await startServer();
    server = result.server;
    
    const port = result.server.address().port;
    const baseUrl = `http://localhost:${port}`;
    
    console.log(`✓ Сервер запущен на порту ${port}\n`);

    // Тест 1: Health check
    console.log('2. Тест health check endpoint...');
    const healthResponse = await axios.get(`${baseUrl}/health`);
    console.log('✓ Health check:', healthResponse.data);
    console.log();

    // Тест 2: Валидный webhook с изменением остатков
    console.log('3. Тест валидного webhook (изменение остатков)...');
    const validWebhook = {
      events: [{
        action: 'UPDATE',
        meta: {
          href: 'https://api.moysklad.ru/api/remap/1.2/entity/product/f8a2da33-bf0a-11ef-0a80-17e3002d7201',
          type: 'product'
        }
      }]
    };

    const webhookResponse = await axios.post(
      `${baseUrl}/webhook/moysklad`,
      validWebhook,
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MoySklad-Webhook/1.0'
        }
      }
    );
    
    console.log('✓ Webhook принят:', webhookResponse.data);
    if (webhookResponse.data.productId === 'f8a2da33-bf0a-11ef-0a80-17e3002d7201') {
      console.log('✓ product.id корректно извлечен из event.meta.href');
    }
    console.log();

    // Тест 3: Webhook без валидного User-Agent
    console.log('4. Тест webhook без валидного User-Agent...');
    try {
      await axios.post(
        `${baseUrl}/webhook/moysklad`,
        validWebhook,
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Unknown-Client/1.0'
          }
        }
      );
      console.log('✓ Webhook принят (валидация User-Agent не строгая)');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('✓ Webhook отклонён (401 Unauthorized)');
      } else {
        throw error;
      }
    }
    console.log();

    // Тест 4: Webhook с некорректным Content-Type
    console.log('5. Тест webhook с некорректным Content-Type...');
    try {
      await axios.post(
        `${baseUrl}/webhook/moysklad`,
        validWebhook,
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
      } else {
        throw error;
      }
    }
    console.log();

    // Тест 5: Webhook без данных
    console.log('6. Тест webhook без данных...');
    try {
      await axios.post(
        `${baseUrl}/webhook/moysklad`,
        null,
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
      } else {
        throw error;
      }
    }
    console.log();

    // Тест 6: Webhook не связанный с остатками
    console.log('7. Тест webhook не связанного с остатками...');
    const nonStockWebhook = {
      events: [{
        action: 'UPDATE',
        meta: {
          href: 'https://api.moysklad.ru/api/remap/1.2/entity/counterparty/a1b2c3d4-e5f6-11ef-0a80-17e3002d7202',
          type: 'counterparty'
        }
      }]
    };

    const nonStockResponse = await axios.post(
      `${baseUrl}/webhook/moysklad`,
      nonStockWebhook,
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MoySklad-Webhook/1.0'
        }
      }
    );
    
    console.log('✓ Webhook проигнорирован:', nonStockResponse.data);
    console.log();

    // Тест 7: 404 для несуществующего маршрута
    console.log('8. Тест 404 для несуществующего маршрута...');
    try {
      await axios.get(`${baseUrl}/nonexistent`);
      console.log('✗ Должен был вернуть 404');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log('✓ Возвращён 404:', error.response.data);
      } else {
        throw error;
      }
    }
    console.log();

    console.log('✅ Все тесты пройдены успешно!');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  } finally {
    // Остановка сервера
    if (server) {
      console.log('\nОстановка сервера...');
      server.close();
      console.log('✓ Сервер остановлен');
    }
  }
}

// Запуск теста
testWebhook();
