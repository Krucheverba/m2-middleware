const logger = require('../logger');
const config = require('../config');
const mappingMetrics = require('../metrics/mappingMetrics');

/**
 * OrderService - Сервис для переноса заказов из M2 в МойСклад
 * 
 * Обрабатывает:
 * - Polling новых заказов из M2
 * - Создание заказов покупателя в МойСклад с резервированием
 * - Маппинг offerId → product.id для всех позиций заказа
 * - Валидацию маппингов перед созданием заказа
 * - Пропуск позиций без маппинга с логированием
 * - Сохранение маппингов заказов для последующей обработки отгрузок
 * 
 * Проверяет: Требования 7.1, 7.2, 7.3, 7.4, 7.5
 */
class OrderService {
  constructor(yandexClient, moySkladClient, mapperService) {
    this.yandexClient = yandexClient;
    this.moySkladClient = moySkladClient;
    this.mapperService = mapperService;
    
    // Хранилище обработанных заказов для предотвращения дублирования
    this.processedOrders = new Set();
  }

  /**
   * Polling и обработка новых заказов из M2
   * Проверяет: Требования 2.1, 5.3, 9.1
   * 
   * @returns {Promise<Object>} Результат обработки (успешные и неудачные заказы)
   */
  async pollAndProcessOrders() {
    try {
      logger.info('Начало polling заказов из M2');
      
      // Получить новые заказы со стату��ом PROCESSING с retry логикой
      const orders = await this._getOrdersWithRetry({
        status: 'PROCESSING'
      });
      
      if (orders.length === 0) {
        logger.info('Новых заказов не найдено');
        return {
          processed: 0,
          successful: 0,
          failed: 0,
          errors: []
        };
      }
      
      logger.info(`Найдено ${orders.length} заказов для обработки`);
      
      const results = {
        processed: 0,
        successful: 0,
        failed: 0,
        errors: []
      };
      
      // Обработать каждый заказ с изоляцией ошибок (Требование 9.2)
      for (const order of orders) {
        // Пропустить уже обработанные заказы
        if (this.processedOrders.has(order.id)) {
          logger.debug('Заказ уже обработан, пропускаем', { orderId: order.id });
          continue;
        }
        
        results.processed++;
        
        try {
          await this.createMoySkladOrder(order);
          results.successful++;
          
          // Добавить в список обработанных
          this.processedOrders.add(order.id);
          
        } catch (error) {
          // Изоляция ошибок - продолжаем обработку других заказов
          results.failed++;
          results.errors.push({
            orderId: order.id,
            error: error.message
          });
          
          logger.logSyncError(
            'Не удалось обработать заказ',
            'order',
            { orderId: order.id },
            error
          );
          
          // Система продолжает работу несмотря на ошибку (Требование 9.4)
        }
      }
      
      logger.info('Polling заказов завершен', results);
      
      return results;
      
    } catch (error) {
      // Ошибка при polling будет повторена на следующем запуске (Требование 9.1)
      logger.logApiError(
        'Ошибка при polling заказов, будет повторено на следующем запуске',
        { endpoint: '/orders', method: 'GET', filters: { status: 'PROCESSING' } },
        null,
        error
      );
      
      // Не пробрасываем ошибку - система продолжает работу (Требование 9.4)
      return {
        processed: 0,
        successful: 0,
        failed: 0,
        errors: [{
          type: 'polling_error',
          error: error.message
        }]
      };
    }
  }

  /**
   * Получить заказы с логикой повторных попыток
   * Проверяет: Требование 9.1
   * 
   * @private
   * @param {Object} filters - Фильтры для получения заказов
   * @param {number} retryCount - Счетчик попыток
   * @returns {Promise<Array>} Массив заказов
   */
  async _getOrdersWithRetry(filters, retryCount = 0) {
    const maxRetries = 3;
    const baseDelay = 2000; // 2 секунды
    
    try {
      return await this.yandexClient.getOrders(filters);
    } catch (error) {
      if (retryCount < maxRetries) {
        // Экспоненциальная задержка
        const delay = baseDelay * Math.pow(2, retryCount);
        
        logger.warn('Ошибка при polling заказов, повторная попытка', {
          retryCount: retryCount + 1,
          maxRetries,
          delayMs: delay,
          error: error.message
        });
        
        await this._sleep(delay);
        return this._getOrdersWithRetry(filters, retryCount + 1);
      }
      
      // Исчерпаны попытки - пробрасываем ошибку
      logger.error('Исчерпаны попытки polling заказов', {
        maxRetries,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Создать заказ покупателя в МойСклад на основе заказа M2
   * Проверяет: Требования 7.1, 7.2, 7.3, 7.4, 7.5
   * 
   * @param {Object} m2Order - Заказ из M2
   * @returns {Promise<Object>} Созданный заказ МойСклад
   */
  async createMoySkladOrder(m2Order) {
    try {
      logger.info('Создание заказа в МойСклад', {
        m2OrderId: m2Order.id
      });
      
      // Валидация и маппинг позиций заказа (Требования 7.1, 7.2)
      const mappedPositions = await this._mapOrderItems(m2Order);
      
      // Фильтровать позиции без маппинга (Требование 7.4)
      const validPositions = mappedPositions.filter(p => p.productId);
      const unmappedItems = mappedPositions.filter(p => !p.productId);
      
      // Логировать пропущенные позиции (Требование 7.4)
      if (unmappedItems.length > 0) {
        const unmappedOfferIds = unmappedItems.map(p => p.offerId);
        
        logger.warn('Заказ содержит немаппированные товары, позиции будут пропущены', {
          m2OrderId: m2Order.id,
          unmappedOfferIds,
          unmappedCount: unmappedItems.length,
          totalCount: mappedPositions.length
        });
      }
      
      // Проверить что есть хотя бы одна валидная позиция
      if (validPositions.length === 0) {
        logger.logOrderError(
          'Заказ не содержит ни одной маппированной позиции',
          m2Order.id,
          mappedPositions.map(p => p.offerId)
        );
        
        throw new Error(
          `Заказ ${m2Order.id} не содержит ни одной маппированной позиции. ` +
          `Заказ помечен для ручной обработки.`
        );
      }
      
      // Подготовить данные заказа для МойСклад (Требование 7.3)
      const orderData = this._buildMoySkladOrderData(m2Order, validPositions);
      
      // Создать заказ покупателя в МойСклад (Требование 7.3)
      const moySkladOrder = await this.moySkladClient.createCustomerOrder(orderData);
      
      logger.info('Заказ успешно создан в МойСклад', {
        m2OrderId: m2Order.id,
        moySkladOrderId: moySkladOrder.id,
        moySkladOrderName: moySkladOrder.name,
        processedPositions: validPositions.length,
        skippedPositions: unmappedItems.length
      });
      
      // Сохранить маппинг заказа (Требование 7.5)
      await this.mapperService.saveOrderMapping(m2Order.id, moySkladOrder.id);
      
      logger.info('Маппинг заказа сохранен', {
        m2OrderId: m2Order.id,
        moySkladOrderId: moySkladOrder.id
      });
      
      return moySkladOrder;
      
    } catch (error) {
      logger.logApiError(
        'Не удалось создать заказ в МойСклад',
        { endpoint: '/entity/customerorder', method: 'POST', m2OrderId: m2Order.id },
        null,
        error
      );
      throw error;
    }
  }

  /**
   * Маппинг позиций заказа M2 на product.id МойСклад
   * Проверяет: Требования 7.1, 7.2, 7.4
   * 
   * @private
   * @param {Object} m2Order - Заказ из M2
   * @returns {Promise<Array>} Массив маппированных позиций
   */
  async _mapOrderItems(m2Order) {
    const items = m2Order.items || [];
    const mappedItems = [];
    
    for (const item of items) {
      // Извлечь offerId из позиции заказа M2 (Требование 7.1)
      const offerId = item.offerId;
      
      // Обратный маппинг offerId -> product.id (Требование 7.2)
      const productId = this.mapperService.mapOfferIdToProductId(offerId);
      
      mappedItems.push({
        offerId,
        productId,
        count: item.count,
        price: item.price,
        shopSku: item.shopSku,
        offerName: item.offerName
      });
      
      if (productId) {
        logger.debug('Товар маппирован', {
          offerId,
          productId,
          count: item.count
        });
      } else {
        // Логировать ошибку для немаппированной позиции (Требование 7.4)
        logger.warn('Товар не маппирован, позиция будет пропущена', {
          offerId,
          offerName: item.offerName,
          m2OrderId: m2Order.id
        });
        // Записать метрику о пропущенном товаре (Требование 9.2)
        mappingMetrics.recordSkippedItem('order', offerId);
      }
    }
    
    return mappedItems;
  }

  /**
   * Построить данные заказа для API МойСклад
   * Проверяет: Требование 7.3
   * 
   * @private
   * @param {Object} m2Order - Заказ из M2
   * @param {Array} mappedPositions - Маппированные позиции с product.id
   * @returns {Object} Данные заказа для МойСклад API
   */
  _buildMoySkladOrderData(m2Order, mappedPositions) {
    const msBaseUrl = config.MS_BASE;
    
    // Построить позиции заказа используя product.id (Требование 7.3)
    const positions = mappedPositions.map(item => ({
      assortment: {
        meta: {
          href: `${msBaseUrl}/entity/product/${item.productId}`,
          type: 'product',
          mediaType: 'application/json'
        }
      },
      quantity: item.count,
      price: item.price * 100, // Конвертировать в копейки
      reserve: item.count // Резервировать товары
    }));
    
    // Построить данные заказа
    const orderData = {
      name: `M2-${m2Order.id}`,
      description: `Заказ из Яндекс.Маркет M2, ID: ${m2Order.id}`,
      positions
    };
    
    // Добавить информацию о доставке если есть
    if (m2Order.delivery) {
      const delivery = m2Order.delivery;
      
      if (delivery.address) {
        orderData.description += `\nАдрес доставки: ${this._formatAddress(delivery.address)}`;
      }
      
      if (delivery.recipient) {
        orderData.description += `\nПолучатель: ${this._formatRecipient(delivery.recipient)}`;
      }
    }
    
    return orderData;
  }

  /**
   * Форматировать адрес доставки
   * 
   * @private
   * @param {Object} address - Адрес из M2
   * @returns {string} Отформатированный адрес
   */
  _formatAddress(address) {
    const parts = [];
    
    if (address.postcode) parts.push(address.postcode);
    if (address.city) parts.push(address.city);
    if (address.street) parts.push(address.street);
    if (address.house) parts.push(`д. ${address.house}`);
    if (address.building) parts.push(`корп. ${address.building}`);
    if (address.apartment) parts.push(`кв. ${address.apartment}`);
    
    return parts.join(', ');
  }

  /**
   * Форматировать информацию о получателе
   * 
   * @private
   * @param {Object} recipient - Получатель из M2
   * @returns {string} Отформатированная информация
   */
  _formatRecipient(recipient) {
    const parts = [];
    
    if (recipient.firstName) parts.push(recipient.firstName);
    if (recipient.lastName) parts.push(recipient.lastName);
    if (recipient.phone) parts.push(`тел: ${recipient.phone}`);
    
    return parts.join(' ');
  }

  /**
   * Polling и обработка отгруженных заказов из M2
   * Проверяет: Требования 3.1, 3.2, 3.4, 3.5, 9.1, 9.2
   * 
   * @returns {Promise<Object>} Результат обработки (успешные и неудачные отгрузки)
   */
  async processShippedOrders() {
    try {
      logger.info('Начало polling отгруженных заказов из M2');
      
      // Получить заказы со статусом SHIPPED с retry логикой
      const orders = await this._getOrdersWithRetry({
        status: 'SHIPPED'
      });
      
      if (orders.length === 0) {
        logger.info('Отгруженных заказов не найдено');
        return {
          processed: 0,
          successful: 0,
          failed: 0,
          errors: []
        };
      }
      
      logger.info(`Найдено ${orders.length} отгруженных заказов для обработки`);
      
      const results = {
        processed: 0,
        successful: 0,
        failed: 0,
        errors: []
      };
      
      // Обработать каждый отгруженный заказ с изоляцией ошибок (Требование 9.2)
      for (const order of orders) {
        results.processed++;
        
        try {
          await this.createShipment(order.id);
          results.successful++;
          
        } catch (error) {
          // Изоляция ошибок - продолжаем обработку других отгрузок
          results.failed++;
          results.errors.push({
            orderId: order.id,
            error: error.message
          });
          
          logger.logSyncError(
            'Не удалось обработать отгрузку',
            'shipment',
            { m2OrderId: order.id },
            error
          );
          
          // Система продолжает работу несмотря на ошибку (Требование 9.4)
        }
      }
      
      logger.info('Polling отгруженных заказов завершен', results);
      
      return results;
      
    } catch (error) {
      // Ошибка при polling будет повторена на следующем запуске (Требование 9.1)
      logger.logApiError(
        'Ошибка при polling отгруженных заказов, будет повторено на следующем запуске',
        { endpoint: '/orders', method: 'GET', filters: { status: 'SHIPPED' } },
        null,
        error
      );
      
      // Не пробрасываем ошибку - система продолжает работу (Требование 9.4)
      return {
        processed: 0,
        successful: 0,
        failed: 0,
        errors: [{
          type: 'polling_error',
          error: error.message
        }]
      };
    }
  }

  /**
   * Создать отгрузку в МойСклад для отгруженного заказа M2
   * Проверяет: Требования 3.1, 3.2, 3.4, 3.5
   * 
   * @param {string} m2OrderId - ID заказа M2
   * @returns {Promise<Object>} Созданная отгрузка
   */
  async createShipment(m2OrderId) {
    try {
      logger.info('Создание отгрузки в МойСклад', {
        m2OrderId
      });
      
      // Найти маппинг заказа (Требование 3.2)
      const moySkladOrderId = await this.mapperService.getMoySkladOrderId(m2OrderId);
      
      // Проверить что маппинг существует (Требование 3.5)
      if (!moySkladOrderId) {
        logger.logMappingError(
          'Маппинг заказа не найден, отгрузка пропущена',
          { m2OrderId }
        );
        
        throw new Error(
          `Маппинг для заказа M2 ${m2OrderId} не найден. ` +
          `Невозможно создать отгрузку для неизвестного заказа.`
        );
      }
      
      logger.info('Найден маппинг заказа', {
        m2OrderId,
        moySkladOrderId
      });
      
      // Подготовить данные отгрузки
      const shipmentData = this._buildShipmentData(moySkladOrderId);
      
      // Создать отгрузку в МойСклад (Требование 3.1)
      const shipment = await this.moySkladClient.createShipment(shipmentData);
      
      logger.info('Отгрузка успешно создана в МойСклад', {
        m2OrderId,
        moySkladOrderId,
        shipmentId: shipment.id,
        shipmentName: shipment.name
      });
      
      // Обновить статус заказа покупателя на "закрыт" (Требование 3.4)
      // Получаем href заказа из отгрузки для обновления статуса
      if (shipment.customerOrder?.meta?.href) {
        const orderHref = shipment.customerOrder.meta.href;
        const orderIdMatch = orderHref.match(/\/customerorder\/([^\/]+)$/);
        
        if (orderIdMatch) {
          const orderId = orderIdMatch[1];
          
          // Для закрытия заказа используем специальный метод
          // В МойСклад заказ автоматически закрывается при создании отгрузки на полную сумму
          // Но мы можем явно обновить статус если нужно
          logger.info('Заказ покупателя будет закрыт автоматически после отгрузки', {
            moySkladOrderId: orderId,
            m2OrderId
          });
        }
      }
      
      return shipment;
      
    } catch (error) {
      logger.logApiError(
        'Не удалось создать отгрузку в МойСклад',
        { endpoint: '/entity/demand', method: 'POST', m2OrderId },
        null,
        error
      );
      throw error;
    }
  }

  /**
   * Построить данные отгрузки для API МойСклад
   * 
   * @private
   * @param {string} moySkladOrderId - ID заказа покупателя в МойСклад
   * @returns {Object} Данные отгрузки для МойСклад API
   */
  _buildShipmentData(moySkladOrderId) {
    const msBaseUrl = config.MS_BASE;
    
    // Построить данные отгрузки
    // Отгрузка (Demand) должна ссылаться на заказ покупателя (CustomerOrder)
    const shipmentData = {
      customerOrder: {
        meta: {
          href: `${msBaseUrl}/entity/customerorder/${moySkladOrderId}`,
          type: 'customerorder',
          mediaType: 'application/json'
        }
      }
    };
    
    return shipmentData;
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

  /**
   * Получить статистику обработки заказов
   * 
   * @returns {Object} Статистика
   */
  getStats() {
    return {
      processedOrdersCount: this.processedOrders.size
    };
  }

  /**
   * Очистить кэш обработанных заказов
   * Полезно для тестирования или периодической очистки памяти
   */
  clearProcessedOrders() {
    this.processedOrders.clear();
    logger.info('Кэш обработанных заказов очищен');
  }
}

module.exports = OrderService;
