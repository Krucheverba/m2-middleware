const logger = require('../logger');
const mappingMetrics = require('../metrics/mappingMetrics');

/**
 * MapperService - Сервис для маппинга между product.id и offerId
 * 
 * Управляет маппингом между:
 * - product.id (UUID товара в МойСклад) ↔ offerId (идентификатор в M2)
 * - m2OrderId ↔ moySkladOrderId
 * 
 * Проверяет: Требования 2.1, 2.2, 2.3, 2.4, 2.5, 6.4, 8.1, 8.2
 */
class MapperService {
  constructor(moySkladClient, productMappingStore, orderMappingStore) {
    this.moySkladClient = moySkladClient;
    this.productMappingStore = productMappingStore;
    this.orderMappingStore = orderMappingStore;
  }

  /**
   * Загрузить маппинги товаров из файла
   * Проверяет: Требования 1.1, 2.1
   * 
   * @returns {Promise<number>} Количество загруженных маппингов
   */
  async loadMappings() {
    try {
      logger.info('Загрузка маппингов товаров из файла');
      
      const mappedCount = await this.productMappingStore.load();
      
      logger.info('Маппинги товаров успешно загружены из файла', {
        mappedCount
      });
      
      return mappedCount;
    } catch (error) {
      logger.logFileError(
        'Не удалось загрузить маппинги товаров из файла',
        this.productMappingStore.filePath,
        'load',
        error
      );
      throw error;
    }
  }

  /**
   * Маппинг product.id (UUID товара в МойСклад) -> offerId (идентификатор в M2)
   * Проверяет: Требования 2.1, 2.2, 2.3
   * 
   * @param {string} productId - UUID товара в МойСклад
   * @returns {string|null} offerId или null если маппинг не найден
   */
  mapProductIdToOfferId(productId) {
    if (!productId) {
      logger.warn('Попытка маппинга с пустым product.id');
      return null;
    }
    
    try {
      const offerId = this.productMappingStore.getOfferId(productId);
      
      if (!offerId) {
        logger.logMappingError(
          'Маппинг не найден для product.id',
          { productId }
        );
        return null;
      }
      
      logger.debug('Маппинг product.id → offerId выполнен', { productId, offerId });
      return offerId;
    } catch (error) {
      logger.error('Ошибка при маппинге product.id → offerId', {
        productId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Обратный маппинг offerId (идентификатор в M2) -> product.id (UUID товара в МойСклад)
   * Проверяет: Требования 8.2, 8.3
   * 
   * @param {string} offerId - Идентификатор товара в M2
   * @returns {string|null} product.id или null если маппинг не найден
   */
  mapOfferIdToProductId(offerId) {
    if (!offerId) {
      logger.warn('Попытка маппинга с пустым offerId');
      return null;
    }
    
    try {
      const productId = this.productMappingStore.getProductId(offerId);
      
      if (!productId) {
        logger.logMappingError(
          'Обратный маппинг не найден для offerId',
          { offerId }
        );
        return null;
      }
      
      logger.debug('Обратный маппинг offerId → product.id выполнен', { offerId, productId });
      return productId;
    } catch (error) {
      logger.error('Ошибка при обратном маппинге offerId → product.id', {
        offerId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Сохранить маппинг заказа (M2 order ID -> МойСклад order ID)
   * Проверяет: Требования 8.1
   * 
   * @param {string} m2OrderId - ID заказа M2
   * @param {string} moySkladOrderId - ID заказа МойСклад
   * @returns {Promise<void>}
   */
  async saveOrderMapping(m2OrderId, moySkladOrderId) {
    try {
      logger.info('Сохранение маппинга заказа', { m2OrderId, moySkladOrderId });
      
      await this.orderMappingStore.save(m2OrderId, moySkladOrderId);
      
      logger.info('Маппинг заказа успешно сохранен', { m2OrderId, moySkladOrderId });
    } catch (error) {
      logger.logFileError(
        'Не удалось сохранить маппинг заказа',
        this.orderMappingStore.filePath,
        'save',
        error
      );
      throw error;
    }
  }

  /**
   * Получить ID заказа МойСклад по ID заказа M2
   * Проверяет: Требования 8.2
   * 
   * @param {string} m2OrderId - ID заказа M2
   * @returns {Promise<string|null>} ID заказа МойСклад или null если не найден
   */
  async getMoySkladOrderId(m2OrderId) {
    try {
      const moySkladOrderId = await this.orderMappingStore.get(m2OrderId);
      
      if (!moySkladOrderId) {
        logger.logMappingError(
          'Маппинг заказа не найден',
          { m2OrderId }
        );
        return null;
      }
      
      return moySkladOrderId;
    } catch (error) {
      logger.logFileError(
        'Не удалось получить маппинг заказа',
        this.orderMappingStore.filePath,
        'get',
        error
      );
      throw error;
    }
  }

  /**
   * Удалить маппинг заказа
   * Используется при отмене заказа
   * 
   * @param {string} m2OrderId - ID заказа M2
   * @returns {Promise<void>}
   */
  async deleteOrderMapping(m2OrderId) {
    try {
      logger.info('Удаление маппинга заказа', { m2OrderId });
      
      await this.orderMappingStore.delete(m2OrderId);
      
      logger.info('Маппинг заказа успешно удалён', { m2OrderId });
    } catch (error) {
      logger.logFileError(
        'Не удалось удалить маппинг заказа',
        this.orderMappingStore.filePath,
        'delete',
        error
      );
      throw error;
    }
  }

  /**
   * Получить список всех product.id для синхронизации
   * Проверяет: Требования 2.4, 5.1
   * 
   * @returns {Array<string>} Массив product.id
   */
  getAllProductIds() {
    try {
      const productIds = this.productMappingStore.getAllProductIds();
      logger.debug('Получен список всех product.id', { count: productIds.length });
      return productIds;
    } catch (error) {
      logger.error('Ошибка при получении списка product.id', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Получить список всех offerId для синхронизации с M2
   * Проверяет: Требования 2.4
   * 
   * @returns {Array<string>} Массив offerId
   */
  getAllOfferIds() {
    try {
      const offerIds = this.productMappingStore.getAllOfferIds();
      logger.debug('Получен список всех offerId', { count: offerIds.length });
      return offerIds;
    } catch (error) {
      logger.error('Ошибка при получении списка offerId', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Получить статистику маппингов
   * Проверяет: Требования 9.4, 9.5
   * 
   * @returns {Object} Статистика маппингов
   */
  getStats() {
    const productMappingStats = this.productMappingStore.getStats();
    const metricsStats = mappingMetrics.getStats();
    
    return {
      // Базовая информация о маппингах
      totalMappings: productMappingStats.totalMappings,
      lastLoaded: productMappingStats.lastLoaded,
      isLoaded: productMappingStats.isLoaded,
      filePath: productMappingStats.filePath,
      
      // Детальная статистика из метрик (Требование 9.4)
      metrics: metricsStats
    };
  }

  /**
   * Получить краткую статистику для dashboard
   * Проверяет: Требование 9.4
   * 
   * @returns {Object} Краткая статистика
   */
  getSummary() {
    return mappingMetrics.getSummary();
  }
}

module.exports = MapperService;
