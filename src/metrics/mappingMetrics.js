const logger = require('../logger');

/**
 * MappingMetrics - Система метрик для мониторинга операций маппинга
 * 
 * Отслеживает:
 * - Количество маппингов в памяти
 * - Успешные/неудачные lookup операции
 * - Пропущенные товары (нет маппинга)
 * - Время последней загрузки
 * 
 * Проверяет: Требования 9.1, 9.2, 9.3, 9.4, 9.5
 */
class MappingMetrics {
  constructor() {
    // Счетчики маппингов
    this.totalMappings = 0;
    this.lastLoaded = null;
    this.isLoaded = false;
    
    // Счетчики lookup операций
    this.lookupStats = {
      productIdToOfferId: {
        success: 0,
        notFound: 0,
        errors: 0
      },
      offerIdToProductId: {
        success: 0,
        notFound: 0,
        errors: 0
      }
    };
    
    // Счетчики пропущенных товаров по сервисам
    this.skippedItems = {
      stock: 0,
      order: 0,
      webhook: 0
    };
    
    // История ошибок маппинга (последние 100)
    this.recentErrors = [];
    this.maxRecentErrors = 100;
    
    // Время начала сбора метрик
    this.startTime = new Date();
  }

  /**
   * Обновить количество маппингов после загрузки
   * Проверяет: Требование 9.1
   * 
   * @param {number} count - Количество загруженных маппингов
   */
  updateMappingCount(count) {
    this.totalMappings = count;
    this.lastLoaded = new Date();
    this.isLoaded = true;
    
    logger.info('Метрики маппинга обновлены', {
      totalMappings: this.totalMappings,
      lastLoaded: this.lastLoaded
    });
  }

  /**
   * Записать успешный lookup product.id → offerId
   * Проверяет: Требование 9.2
   * 
   * @param {string} productId - UUID товара
   * @param {string} offerId - Идентификатор в M2
   */
  recordSuccessfulProductIdLookup(productId, offerId) {
    this.lookupStats.productIdToOfferId.success++;
    
    logger.debug('Успешный lookup product.id → offerId', {
      productId,
      offerId,
      totalSuccess: this.lookupStats.productIdToOfferId.success
    });
  }

  /**
   * Записать неудачный lookup product.id → offerId (маппинг не найден)
   * Проверяет: Требование 9.2
   * 
   * @param {string} productId - UUID товара
   * @param {string} context - Контекст операции (stock, webhook, etc.)
   */
  recordNotFoundProductId(productId, context = 'unknown') {
    this.lookupStats.productIdToOfferId.notFound++;
    
    // Записать в историю ошибок
    this._addRecentError({
      type: 'NOT_FOUND',
      direction: 'productId → offerId',
      identifier: productId,
      context,
      timestamp: new Date()
    });
    
    logger.warn('Маппинг не найден для product.id', {
      productId,
      context,
      totalNotFound: this.lookupStats.productIdToOfferId.notFound
    });
  }

  /**
   * Записать успешный lookup offerId → product.id
   * Проверяет: Требование 9.2
   * 
   * @param {string} offerId - Идентификатор в M2
   * @param {string} productId - UUID товара
   */
  recordSuccessfulOfferIdLookup(offerId, productId) {
    this.lookupStats.offerIdToProductId.success++;
    
    logger.debug('Успешный lookup offerId → product.id', {
      offerId,
      productId,
      totalSuccess: this.lookupStats.offerIdToProductId.success
    });
  }

  /**
   * Записать неудачный lookup offerId → product.id (маппинг не найден)
   * Проверяет: Требование 9.2
   * 
   * @param {string} offerId - Идентификатор в M2
   * @param {string} context - Контекст операции (order, etc.)
   */
  recordNotFoundOfferId(offerId, context = 'unknown') {
    this.lookupStats.offerIdToProductId.notFound++;
    
    // Записать в историю ошибок
    this._addRecentError({
      type: 'NOT_FOUND',
      direction: 'offerId → product.id',
      identifier: offerId,
      context,
      timestamp: new Date()
    });
    
    logger.warn('Обратный маппинг не найден для offerId', {
      offerId,
      context,
      totalNotFound: this.lookupStats.offerIdToProductId.notFound
    });
  }

  /**
   * Записать ошибку lookup операции
   * Проверяет: Требование 9.3
   * 
   * @param {string} direction - Направление маппинга
   * @param {string} identifier - Идентификатор
   * @param {Error} error - Объект ошибки
   * @param {string} context - Контекст операции
   */
  recordLookupError(direction, identifier, error, context = 'unknown') {
    if (direction === 'productId → offerId') {
      this.lookupStats.productIdToOfferId.errors++;
    } else if (direction === 'offerId → product.id') {
      this.lookupStats.offerIdToProductId.errors++;
    }
    
    // Записать в историю ошибок
    this._addRecentError({
      type: 'ERROR',
      direction,
      identifier,
      error: error.message,
      context,
      timestamp: new Date()
    });
    
    logger.error('Ошибка при lookup операции', {
      direction,
      identifier,
      context,
      error: error.message
    });
  }

  /**
   * Записать пропущенный товар (нет маппинга)
   * Проверяет: Требование 9.2
   * 
   * @param {string} service - Сервис (stock, order, webhook)
   * @param {string} identifier - Идентификатор товара
   */
  recordSkippedItem(service, identifier) {
    if (this.skippedItems[service] !== undefined) {
      this.skippedItems[service]++;
    }
    
    logger.info('Товар пропущен из-за отсутствия маппинга', {
      service,
      identifier,
      totalSkipped: this.skippedItems[service]
    });
  }

  /**
   * Добавить ошибку в историю последних ошибок
   * @private
   * 
   * @param {Object} error - Информация об ошибке
   */
  _addRecentError(error) {
    this.recentErrors.push(error);
    
    // Ограничить размер истории
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors.shift();
    }
  }

  /**
   * Получить полную статистику маппинга
   * Проверяет: Требования 9.4, 9.5
   * 
   * @returns {Object} Статистика маппинга
   */
  getStats() {
    const uptime = Date.now() - this.startTime.getTime();
    
    return {
      // Основная информация о маппингах
      mappings: {
        total: this.totalMappings,
        lastLoaded: this.lastLoaded,
        isLoaded: this.isLoaded
      },
      
      // Статистика lookup операций
      lookups: {
        productIdToOfferId: {
          ...this.lookupStats.productIdToOfferId,
          total: this.lookupStats.productIdToOfferId.success + 
                 this.lookupStats.productIdToOfferId.notFound + 
                 this.lookupStats.productIdToOfferId.errors,
          successRate: this._calculateSuccessRate(this.lookupStats.productIdToOfferId)
        },
        offerIdToProductId: {
          ...this.lookupStats.offerIdToProductId,
          total: this.lookupStats.offerIdToProductId.success + 
                 this.lookupStats.offerIdToProductId.notFound + 
                 this.lookupStats.offerIdToProductId.errors,
          successRate: this._calculateSuccessRate(this.lookupStats.offerIdToProductId)
        }
      },
      
      // Пропущенные товары по сервисам
      skipped: {
        ...this.skippedItems,
        total: this.skippedItems.stock + this.skippedItems.order + this.skippedItems.webhook
      },
      
      // Последние ошибки
      recentErrors: this.recentErrors.slice(-10), // Последние 10 ошибок
      
      // Общая информация
      uptime: {
        milliseconds: uptime,
        seconds: Math.floor(uptime / 1000),
        minutes: Math.floor(uptime / 60000),
        hours: Math.floor(uptime / 3600000)
      },
      startTime: this.startTime
    };
  }

  /**
   * Получить краткую статистику для dashboard
   * Проверяет: Требование 9.4
   * 
   * @returns {Object} Краткая статистика
   */
  getSummary() {
    const stats = this.getStats();
    
    return {
      totalMappings: stats.mappings.total,
      isLoaded: stats.mappings.isLoaded,
      lastLoaded: stats.mappings.lastLoaded,
      totalLookups: stats.lookups.productIdToOfferId.total + stats.lookups.offerIdToProductId.total,
      successfulLookups: stats.lookups.productIdToOfferId.success + stats.lookups.offerIdToProductId.success,
      notFoundLookups: stats.lookups.productIdToOfferId.notFound + stats.lookups.offerIdToProductId.notFound,
      totalSkipped: stats.skipped.total,
      uptimeHours: stats.uptime.hours
    };
  }

  /**
   * Вычислить процент успешных операций
   * @private
   * 
   * @param {Object} stats - Статистика операций
   * @returns {string} Процент успешных операций
   */
  _calculateSuccessRate(stats) {
    const total = stats.success + stats.notFound + stats.errors;
    if (total === 0) return '0%';
    
    const rate = (stats.success / total * 100).toFixed(2);
    return `${rate}%`;
  }

  /**
   * Сбросить все метрики (для тестирования)
   */
  reset() {
    this.totalMappings = 0;
    this.lastLoaded = null;
    this.isLoaded = false;
    
    this.lookupStats = {
      productIdToOfferId: {
        success: 0,
        notFound: 0,
        errors: 0
      },
      offerIdToProductId: {
        success: 0,
        notFound: 0,
        errors: 0
      }
    };
    
    this.skippedItems = {
      stock: 0,
      order: 0,
      webhook: 0
    };
    
    this.recentErrors = [];
    this.startTime = new Date();
    
    logger.info('Метрики маппинга сброшены');
  }
}

// Singleton instance
const mappingMetrics = new MappingMetrics();

module.exports = mappingMetrics;
