/**
 * Тест для проверки запуска главного сервера
 * Проверяет: Требование 7.1
 */

// Загрузка тестовых переменных окружения
require('dotenv').config({ path: '.env.test' });

const { startServer } = require('./src/server');

async function testServer() {
  console.log('🧪 Тестирование запуска сервера...\n');

  let serverInstance = null;

  try {
    // Запуск сервера
    console.log('1. Запуск сервера...');
    serverInstance = await startServer().catch(err => {
      console.error('Ошибка при запуске сервера:', err.message);
      throw err;
    });
    console.log('✅ Сервер успешно запущен\n');

    // Проверка что все компоненты инициализированы
    console.log('2. Проверка инициализации компонентов...');
    
    if (!serverInstance.app) {
      throw new Error('Express app не инициализирован');
    }
    console.log('✅ Express app инициализирован');

    if (!serverInstance.server) {
      throw new Error('HTTP сервер не инициализирован');
    }
    console.log('✅ HTTP сервер инициализирован');

    if (!serverInstance.stockService) {
      throw new Error('StockService не инициализирован');
    }
    console.log('✅ StockService инициализирован');

    if (!serverInstance.orderService) {
      throw new Error('OrderService не инициализирован');
    }
    console.log('✅ OrderService инициализирован');

    if (!serverInstance.mapperService) {
      throw new Error('MapperService не инициализирован');
    }
    console.log('✅ MapperService инициализирован');

    if (!serverInstance.cronScheduler) {
      throw new Error('CronScheduler не инициализирован');
    }
    console.log('✅ CronScheduler инициализирован\n');

    // Проверка health check endpoint
    console.log('3. Проверка health check endpoint...');
    const http = require('http');
    const config = require('./src/config');
    
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
    console.log(`   Uptime: ${healthResponse.uptime.toFixed(2)}s\n`);

    console.log('✅ Все тесты пройдены успешно!\n');
    console.log('Сервер работает корректно. Остановка...');

    // Graceful shutdown
    serverInstance.server.close(() => {
      console.log('✅ Сервер остановлен');
      process.exit(0);
    });

    // Остановка cron jobs
    serverInstance.cronScheduler.stopAll();

  } catch (error) {
    console.error('❌ Ошибка при тестировании сервера:', error.message);
    console.error(error.stack);
    
    if (serverInstance && serverInstance.server) {
      serverInstance.server.close();
    }
    if (serverInstance && serverInstance.cronScheduler) {
      serverInstance.cronScheduler.stopAll();
    }
    
    process.exit(1);
  }
}

// Запуск теста
testServer();
