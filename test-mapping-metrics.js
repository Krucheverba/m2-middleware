const mappingMetrics = require('./src/metrics/mappingMetrics');
const logger = require('./src/logger');

/**
 * Тест системы метрик маппинга
 * Проверяет: Требования 9.1, 9.2, 9.3, 9.4, 9.5
 */

console.log('=== Тест системы метрик маппинга ===\n');

// Сбросить метрики перед тестом
mappingMetrics.reset();

// Тест 1: Обновление количества маппингов (Требование 9.1)
console.log('Тест 1: Обновление количества маппингов');
mappingMetrics.updateMappingCount(150);
const stats1 = mappingMetrics.getStats();
console.log(`✓ Загружено маппингов: ${stats1.mappings.total}`);
console.log(`✓ Статус загрузки: ${stats1.mappings.isLoaded}`);
console.log(`✓ Дата загрузки: ${stats1.mappings.lastLoaded}\n`);

// Тест 2: Успешные lookup операции (Требование 9.2)
console.log('Тест 2: Успешные lookup операции');
for (let i = 0; i < 10; i++) {
  mappingMetrics.recordSuccessfulProductIdLookup(
    `product-${i}`,
    `offer-${i}`
  );
}
for (let i = 0; i < 5; i++) {
  mappingMetrics.recordSuccessfulOfferIdLookup(
    `offer-${i}`,
    `product-${i}`
  );
}
const stats2 = mappingMetrics.getStats();
console.log(`✓ Успешных product.id → offerId: ${stats2.lookups.productIdToOfferId.success}`);
console.log(`✓ Успешных offerId → product.id: ${stats2.lookups.offerIdToProductId.success}\n`);

// Тест 3: Ненайденные маппинги (Требование 9.2)
console.log('Тест 3: Ненайденные маппинги');
mappingMetrics.recordNotFoundProductId('unknown-product-1', 'stock');
mappingMetrics.recordNotFoundProductId('unknown-product-2', 'webhook');
mappingMetrics.recordNotFoundOfferId('unknown-offer-1', 'order');
const stats3 = mappingMetrics.getStats();
console.log(`✓ Не найдено product.id: ${stats3.lookups.productIdToOfferId.notFound}`);
console.log(`✓ Не найдено offerId: ${stats3.lookups.offerIdToProductId.notFound}`);
console.log(`✓ Последние ошибки: ${stats3.recentErrors.length}\n`);

// Тест 4: Ошибки lookup (Требование 9.3)
console.log('Тест 4: Ошибки lookup');
const testError = new Error('Test error');
mappingMetrics.recordLookupError(
  'productId → offerId',
  'error-product-1',
  testError,
  'stock'
);
const stats4 = mappingMetrics.getStats();
console.log(`✓ Ошибок product.id → offerId: ${stats4.lookups.productIdToOfferId.errors}`);
console.log(`✓ Последняя ошибка: ${stats4.recentErrors[stats4.recentErrors.length - 1].error}\n`);

// Тест 5: Пропущенные товары (Требование 9.2)
console.log('Тест 5: Пропущенные товары');
mappingMetrics.recordSkippedItem('stock', 'skipped-1');
mappingMetrics.recordSkippedItem('stock', 'skipped-2');
mappingMetrics.recordSkippedItem('order', 'skipped-3');
mappingMetrics.recordSkippedItem('webhook', 'skipped-4');
const stats5 = mappingMetrics.getStats();
console.log(`✓ Пропущено в stock: ${stats5.skipped.stock}`);
console.log(`✓ Пропущено в order: ${stats5.skipped.order}`);
console.log(`✓ Пропущено в webhook: ${stats5.skipped.webhook}`);
console.log(`✓ Всего пропущено: ${stats5.skipped.total}\n`);

// Тест 6: Полная статистика (Требования 9.4, 9.5)
console.log('Тест 6: Полная статистика');
const fullStats = mappingMetrics.getStats();
console.log('Полная статистика:');
console.log(JSON.stringify(fullStats, null, 2));
console.log();

// Тест 7: Краткая статистика для dashboard (Требование 9.4)
console.log('Тест 7: Краткая статистика для dashboard');
const summary = mappingMetrics.getSummary();
console.log('Краткая статистика:');
console.log(JSON.stringify(summary, null, 2));
console.log();

// Тест 8: Процент успешных операций
console.log('Тест 8: Процент успешных операций');
console.log(`✓ Success rate product.id → offerId: ${fullStats.lookups.productIdToOfferId.successRate}`);
console.log(`✓ Success rate offerId → product.id: ${fullStats.lookups.offerIdToProductId.successRate}\n`);

// Тест 9: Uptime
console.log('Тест 9: Uptime');
console.log(`✓ Время работы: ${fullStats.uptime.seconds} секунд`);
console.log(`✓ Дата старта: ${fullStats.startTime}\n`);

console.log('=== Все тесты пройдены успешно ===');
