const winston = require('winston');
const config = require('./config');

// Функция для удаления credentials из логов (Требование 7.3)
const sanitizeLog = winston.format((info) => {
  const sensitiveFields = ['MS_TOKEN', 'YANDEX_TOKEN', 'token', 'password', 'authorization', 'bearer'];
  
  const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sanitized = Array.isArray(obj) ? [] : {};
    
    for (const key in obj) {
      const lowerKey = key.toLowerCase();
      if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitized[key] = sanitize(obj[key]);
      } else {
        sanitized[key] = obj[key];
      }
    }
    
    return sanitized;
  };
  
  return sanitize(info);
});

// Базовый winston logger
const baseLogger = winston.createLogger({
  level: config.LOG_LEVEL, // Требование 7.5
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Требование 6.4
    sanitizeLog(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          let log = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta, null, 2)}`;
          }
          return log;
        })
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      format: winston.format.json()
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      format: winston.format.json()
    })
  ]
});

// Расширенный logger с специализированными методами для разных типов ошибок
const logger = {
  // Стандартные методы логирования
  error: (message, meta = {}) => baseLogger.error(message, meta),
  warn: (message, meta = {}) => baseLogger.warn(message, meta),
  info: (message, meta = {}) => baseLogger.info(message, meta),
  debug: (message, meta = {}) => baseLogger.debug(message, meta),

  /**
   * Логирование ошибок маппинга (Требование 6.1)
   * @param {string} message - Описание ошибки
   * @param {Object} identifiers - Идентификаторы (offerId_M2, externalCode, productId и т.д.)
   * @param {Error} [error] - Объект ошибки (опционально)
   */
  logMappingError: (message, identifiers, error = null) => {
    const logData = {
      errorType: 'MAPPING_ERROR',
      identifiers: identifiers || {},
      ...(error && { error: error.message, stack: error.stack })
    };
    baseLogger.error(message, logData);
  },

  /**
   * Логирование ошибок API (Требование 6.2)
   * @param {string} message - Описание ошибки
   * @param {Object} requestDetails - Детали запроса (endpoint, method, params)
   * @param {Object} errorResponse - Ответ с ошибкой
   * @param {Error} [error] - Объект ошибки (опционально)
   */
  logApiError: (message, requestDetails, errorResponse = null, error = null) => {
    const logData = {
      errorType: 'API_ERROR',
      requestDetails: requestDetails || {},
      ...(errorResponse && { errorResponse }),
      ...(error && { error: error.message, stack: error.stack })
    };
    baseLogger.error(message, logData);
  },

  /**
   * Логирование ошибок файловых операций (Требование 8.5)
   * @param {string} message - Описание ошибки
   * @param {string} filePath - Путь к файлу
   * @param {string} operation - Операция (read, write, delete и т.д.)
   * @param {Error} [error] - Объект ошибки (опционально)
   */
  logFileError: (message, filePath, operation, error = null) => {
    const logData = {
      errorType: 'FILE_ERROR',
      filePath,
      operation,
      ...(error && { error: error.message, stack: error.stack })
    };
    baseLogger.error(message, logData);
  },

  /**
   * Логирование ошибок webhook (Требование 4.4)
   * @param {string} message - Описание ошибки
   * @param {Object} webhookData - Данные webhook
   * @param {Error} [error] - Объект ошибки (опционально)
   */
  logWebhookError: (message, webhookData = {}, error = null) => {
    const logData = {
      errorType: 'WEBHOOK_ERROR',
      webhookData: webhookData || {},
      ...(error && { error: error.message, stack: error.stack })
    };
    baseLogger.error(message, logData);
  },

  /**
   * Логирование ошибок обработки заказов (Требование 6.3)
   * @param {string} message - Описание ошибки
   * @param {string} m2OrderId - ID заказа M2
   * @param {Array} unmappedOfferIds_M2 - Список немаппированных offerId_M2
   * @param {Error} [error] - Объект ошибки (опционально)
   */
  logOrderError: (message, m2OrderId, unmappedOfferIds_M2 = [], error = null) => {
    const logData = {
      errorType: 'ORDER_ERROR',
      m2OrderId,
      ...(unmappedOfferIds_M2.length > 0 && { unmappedOfferIds_M2 }),
      ...(error && { error: error.message, stack: error.stack })
    };
    baseLogger.error(message, logData);
  },

  /**
   * Логирование ошибок синхронизации (Требование 5.5)
   * @param {string} message - Описание ошибки
   * @param {string} syncType - Тип синхронизации (stock, order, shipment)
   * @param {Object} context - Контекст ошибки
   * @param {Error} [error] - Объект ошибки (опционально)
   */
  logSyncError: (message, syncType, context = {}, error = null) => {
    const logData = {
      errorType: 'SYNC_ERROR',
      syncType,
      context,
      ...(error && { error: error.message, stack: error.stack })
    };
    baseLogger.error(message, logData);
  }
};

module.exports = logger;