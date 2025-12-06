const http = require('http');

/**
 * Интеграционный тест API endpoints для метрик маппинга
 * Проверяет: Требования 9.4, 9.5
 */

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

// Вспомогательная функция для HTTP запросов
function makeRequest(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${path}`, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

async function runTests() {
  console.log('=== Интеграционный тест API метрик маппинга ===\n');
  
  try {
    // Тест 1: Health check
    console.log('Тест 1: Health check');
    const health = await makeRequest('/health');
    if (health.status === 200 && health.data.status === 'ok') {
      console.log('✓ Сервер работает');
      console.log(`  Uptime: ${health.data.uptime} секунд\n`);
    } else {
      throw new Error('Health check failed');
    }
    
    // Тест 2: GET /api/mapping/summary (Требование 9.4)
    console.log('Тест 2: GET /api/mapping/summary');
    const summary = await makeRequest('/api/mapping/summary');
    if (summary.status === 200) {
      console.log('✓ Endpoint /api/mapping/summary работает');
      console.log('  Краткая статистика:');
      console.log(`    Всего маппингов: ${summary.data.totalMappings}`);
      console.log(`    Загружено: ${summary.data.isLoaded}`);
      console.log(`    Всего lookup: ${summary.data.totalLookups}`);
      console.log(`    Успешных lookup: ${summary.data.successfulLookups}`);
      console.log(`    Не найдено: ${summary.data.notFoundLookups}`);
      console.log(`    Пропущено товаров: ${summary.data.totalSkipped}\n`);
    } else {
      throw new Error(`Summary endpoint returned status ${summary.status}`);
    }
    
    // Тест 3: GET /api/mapping/stats (Требования 9.4, 9.5)
    console.log('Тест 3: GET /api/mapping/stats');
    const stats = await makeRequest('/api/mapping/stats');
    if (stats.status === 200) {
      console.log('✓ Endpoint /api/mapping/stats работает');
      console.log('  Полная статистика:');
      console.log(`    Всего маппингов: ${stats.data.totalMappings}`);
      console.log(`    Последняя загрузка: ${stats.data.lastLoaded}`);
      console.log(`    Статус загрузки: ${stats.data.isLoaded}`);
      console.log(`    Файл: ${stats.data.filePath}`);
      
      if (stats.data.metrics) {
        console.log('  Метрики lookup операций:');
        console.log(`    product.id → offerId:`);
        console.log(`      Успешных: ${stats.data.metrics.lookups.productIdToOfferId.success}`);
        console.log(`      Не найдено: ${stats.data.metrics.lookups.productIdToOfferId.notFound}`);
        console.log(`      Ошибок: ${stats.data.metrics.lookups.productIdToOfferId.errors}`);
        console.log(`      Success rate: ${stats.data.metrics.lookups.productIdToOfferId.successRate}`);
        
        console.log(`    offerId → product.id:`);
        console.log(`      Успешных: ${stats.data.metrics.lookups.offerIdToProductId.success}`);
        console.log(`      Не найдено: ${stats.data.metrics.lookups.offerIdToProductId.notFound}`);
        console.log(`      Ошибок: ${stats.data.metrics.lookups.offerIdToProductId.errors}`);
        console.log(`      Success rate: ${stats.data.metrics.lookups.offerIdToProductId.successRate}`);
        
        console.log('  Пропущенные товары:');
        console.log(`    Stock: ${stats.data.metrics.skipped.stock}`);
        console.log(`    Order: ${stats.data.metrics.skipped.order}`);
        console.log(`    Webhook: ${stats.data.metrics.skipped.webhook}`);
        console.log(`    Всего: ${stats.data.metrics.skipped.total}`);
        
        console.log('  Последние ошибки:');
        if (stats.data.metrics.recentErrors.length > 0) {
          stats.data.metrics.recentErrors.slice(0, 3).forEach((error, i) => {
            console.log(`    ${i + 1}. ${error.type} - ${error.direction} - ${error.identifier}`);
          });
        } else {
          console.log('    Нет ошибок');
        }
        
        console.log('  Uptime:');
        console.log(`    Часов: ${stats.data.metrics.uptime.hours}`);
        console.log(`    Минут: ${stats.data.metrics.uptime.minutes}`);
        console.log(`    Секунд: ${stats.data.metrics.uptime.seconds}`);
      }
      console.log();
    } else {
      throw new Error(`Stats endpoint returned status ${stats.status}`);
    }
    
    // Тест 4: Проверка структуры данных
    console.log('Тест 4: Проверка структуры данных');
    
    // Проверка summary
    const requiredSummaryFields = [
      'totalMappings',
      'isLoaded',
      'lastLoaded',
      'totalLookups',
      'successfulLookups',
      'notFoundLookups',
      'totalSkipped',
      'uptimeHours'
    ];
    
    const missingSummaryFields = requiredSummaryFields.filter(
      field => !(field in summary.data)
    );
    
    if (missingSummaryFields.length === 0) {
      console.log('✓ Summary содержит все необходимые поля');
    } else {
      throw new Error(`Summary missing fields: ${missingSummaryFields.join(', ')}`);
    }
    
    // Проверка stats
    const requiredStatsFields = [
      'totalMappings',
      'lastLoaded',
      'isLoaded',
      'filePath',
      'metrics'
    ];
    
    const missingStatsFields = requiredStatsFields.filter(
      field => !(field in stats.data)
    );
    
    if (missingStatsFields.length === 0) {
      console.log('✓ Stats содержит все необходимые поля');
    } else {
      throw new Error(`Stats missing fields: ${missingStatsFields.join(', ')}`);
    }
    
    // Проверка вложенной структуры metrics
    if (stats.data.metrics) {
      const hasLookups = 'lookups' in stats.data.metrics;
      const hasSkipped = 'skipped' in stats.data.metrics;
      const hasUptime = 'uptime' in stats.data.metrics;
      
      if (hasLookups && hasSkipped && hasUptime) {
        console.log('✓ Metrics содержит все необходимые вложенные поля\n');
      } else {
        throw new Error('Metrics missing nested fields');
      }
    }
    
    console.log('=== Все тесты пройдены успешно ===');
    console.log('\nAPI endpoints для метрик маппинга работают корректно!');
    console.log('Требования 9.4 и 9.5 выполнены.');
    
  } catch (error) {
    console.error('\n❌ Ошибка при выполнении тестов:', error.message);
    console.error('\nУбедитесь что сервер запущен: npm start');
    process.exit(1);
  }
}

// Запуск тестов
runTests();
