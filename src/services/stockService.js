const logger = require('../logger');
const mappingMetrics = require('../metrics/mappingMetrics');

/**
 * StockService - Сервис для синхронизации остатков между МойСклад и M2
 * 
 * Обрабатывает:
 * - Webhook события от МойСклад о изменении остатков (product.id)
 * - Резервную синхронизацию всех остатков через cron job
 * - Обновление остатков в Яндекс.Маркет (offerId)
 * 
 * Проверяет: Требования 5.1, 5.2, 5.3, 5.4, 5.5
 */
class StockService {
  constructor(moySkladClient, yandexClient, mapperService) {
    this.moySkladClient = moySkladClient;
    this.yandexClient = yandexClient;
    this.mapperService = mapperService;
  }

  /**
   * Обработать обновление остатков для товара по product.id
   * Проверяет: Требования 5.2, 5.3, 5.4
   * 
   * @param {string} productId - UUID товара в МойСклад
   * @returns {Promise<void>}
   */
  async handleStockUpdate(productId) {
    try {
      logger.info('Обработка обновления остатков', { productId });

      if (!productId) {
        logger.warn('Получен пустой product.id, пропускаем');
        return;
      }

      // Маппинг product.id -> offerId
      const offerId = this.mapperService.mapProductIdToOfferId(productId);
      
      if (!offerId) {
        logger.logMappingError(
          'Маппинг не найден для товара, пропускаем',
          { productId }
        );
        // Записать метрику о пропущенном товаре (Требование 9.2)
        mappingMetrics.recordSkippedItem('webhook', productId);
        return;
      }

      // Получить остатки товара из МойСклад по product.id
      const stockData = await this.moySkladClient.getProductStock(productId);
      
      // Обновить остаток в M2 (передаём offerId и count)
      await this.updateM2Stock(offerId, stockData.availableStock);
      
      logger.info('Остатки обновлены успешно', {
        productId,
        offerId,
        availableStock: stockData.availableStock
      });
    } catch (error) {
      logger.error('Ошибка при обработке обновления остатков', {
        productId,
        error: error.message
      });
      // Не пробрасываем ошибку - полагаемся на cron job для eventual consistency
    }
  }

  /**
   * Синхронизировать все остатки из МойСклад в M2 (резервный cron job)
   * Проверяет: Требования 5.1, 5.2, 5.3, 5.4, 5.5
   * 
   * @returns {Promise<Object>} Статистика синхронизации
   */
  async syncStocks() {
    try {
      logger.info('Начало синхронизации остатков');

      const stats = {
        total: 0,
        synced: 0,
        skipped: 0,
        errors: 0
      };

      // Получить все product.id из маппингов
      const productIds = this.mapperService.getAllProductIds();
      stats.total = productIds.length;

      logger.info('Получено товаров для синхронизации', { count: productIds.length });

      // Обработать каждый товар с изоляцией ошибок
      for (const productId of productIds) {
        try {
          // Получить offerId для этого product.id
          const offerId = this.mapperService.mapProductIdToOfferId(productId);
          
          if (!offerId) {
            logger.logMappingError(
              'Маппинг не найден для product.id',
              { productId }
            );
            // Записать метрику о пропущенном товаре (Требование 9.2)
            mappingMetrics.recordSkippedItem('stock', productId);
            stats.skipped++;
            continue;
          }

          // Получить остатки из МойСклад по product.id
          const stockData = await this.moySkladClient.getProductStock(productId);
          
          // Обновить остаток в M2 (передаём offerId и count)
          await this.updateM2Stock(offerId, stockData.availableStock);
          
          stats.synced++;
          
          logger.debug('Остаток синхронизирован', {
            productId,
            offerId,
            availableStock: stockData.availableStock
          });
        } catch (error) {
          // Изоляция ошибок - продолжаем обработку других товаров
          logger.logSyncError(
            'Ошибка при синхронизации товара',
            'stock',
            { productId },
            error
          );
          stats.errors++;
          
          // Система продолжает работу несмотря на ошибку
        }
      }

      logger.info('Синхронизация остатков завершена', stats);
      
      return stats;
    } catch (error) {
      // Критическая ошибка не роняет систему
      logger.logSyncError(
        'Критическая ошибка при синхронизации остатков',
        'stock',
        {},
        error
      );
      
      // Не пробрасываем ошибку - система продолжает работу
      return {
        total: 0,
        synced: 0,
        skipped: 0,
        errors: 1
      };
    }
  }

  /**
   * Обновить остаток одного товара в Яндекс.Маркет
   * Проверяет: Требования 5.4
   * 
   * @param {string} offerId - Идентификатор товара в M2
   * @param {number} availableStock - Доступный остаток
   * @param {number} retryCount - Счетчик попыток
   * @returns {Promise<void>}
   */
  async updateM2Stock(offerId, availableStock, retryCount = 0) {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 секунда
    
    try {
      // Валидация параметров
      if (!offerId) {
        throw new Error('offerId обязателен для обновления остатка');
      }

      if (typeof availableStock !== 'number' || availableStock < 0) {
        throw new Error(`Некорректное значение остатка: ${availableStock}`);
      }

      logger.debug('Обновление остатка в M2', {
        offerId,
        availableStock
      });

      // Подготовить данные для обновления
      const stockUpdates = [{
        offerId: offerId,
        count: availableStock,
        warehouseId: 0 // По умолчанию используем warehouseId = 0
      }];

      // Отправить обновление в Яндекс.Маркет
      await this.yandexClient.updateStocks(stockUpdates);

      logger.info('Остаток обновлен в M2', {
        offerId,
        availableStock
      });
    } catch (error) {
      // Retry логика для временных ошибок
      if (retryCount < maxRetries && this._isRetryableError(error)) {
        const delay = baseDelay * Math.pow(2, retryCount);
        
        logger.warn('Ошибка при обновлении остатка, повторная попытка', {
          offerId,
          retryCount: retryCount + 1,
          maxRetries,
          delayMs: delay,
          error: error.message
        });
        
        await this._sleep(delay);
        return this.updateM2Stock(offerId, availableStock, retryCount + 1);
      }
      
      logger.logApiError(
        'Ошибка при обновлении остатка в M2',
        { endpoint: '/offers/stocks', method: 'PUT', offerId, availableStock },
        null,
        error
      );
      throw error;
    }
  }

  /**
   * Проверить, является ли ошибка временной и подлежит повторной попытке
   * @private
   * @param {Error} error - Ошибка
   * @returns {boolean} true если ошибка временная
   */
  _isRetryableError(error) {
    // Сетевые ошибки
    if (error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' || 
        error.code === 'ENOTFOUND') {
      return true;
    }
    
    // Ошибки сервера 5xx
    if (error.response?.status >= 500) {
      return true;
    }
    
    // Rate limiting уже обрабатывается в yandexClient
    // но на всякий случай проверим
    if (error.response?.status === 429) {
      return true;
    }
    
    return false;
  }

  /**
   * Вспомогательная функция для задержки
   * @private
   * @param {number} ms - Миллисекунды
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


}

module.exports = StockService;
