// Простой тест Winston
const logger = require('./src/logger');

console.log('🧪 Тестирование Winston...');

logger.info('Тестовое INFO сообщение');
logger.warn('Тестовое WARN сообщение');
logger.error('Тестовое ERROR сообщение');

console.log('✅ Логи отправлены');

// Даём время на запись
setTimeout(() => {
  console.log('✅ Завершено');
  process.exit(0);
}, 1000);
