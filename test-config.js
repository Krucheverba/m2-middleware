const config = require('./src/config');
const logger = require('./src/logger');

logger.info('🚀 Тестирование конфигурации');
logger.info('Конфигурация загружена:', config.toSafeObject());

logger.info('✅ Конфигурация валидна!');
logger.warn('⚠️  Это предупреждение');
logger.error('❌ Это ошибка (для теста)');

// Тест: credentials не должны попадать в логи
logger.info('Тест безопасности', { 
  MS_TOKEN: 'secret123', 
  data: { YANDEX_TOKEN: 'secret456' } 
});
