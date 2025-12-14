const axios = require('axios');
const logger = require('../logger');
const config = require('../config');

class MoySkladClient {
  constructor() {
    this.baseURL = config.MS_BASE;
    this.token = config.MS_TOKEN;
    this.companyId = config.MS_COMPANY_ID;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept-Encoding': 'gzip',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Добавляем interceptor для логирования ошибок
    this.client.interceptors.response.use(
      response => response,
      error => {
        this._logApiError(error);
        throw error;
      }
    );
  }

  /**
   * Получить товары (без атрибутов)
   * @param {Object} filter - Параметры фильтрации
   * @returns {Promise<Array>} Массив товаров
   */
  async getProducts(filter = {}) {
    try {
      logger.debug('Получение товаров из МойСклад', { filter });
      
      const params = {
        limit: 1000,
        ...filter
      };
      
      const response = await this.client.get('/entity/product', { params });
      const products = response.data.rows || [];
      
      logger.info(`Получено ${products.length} товаров из МойСклад`);
      return products;
    } catch (error) {
      logger.error('Ошибка при получении товаров', {
        errorType: 'API_ERROR',
        endpoint: '/entity/product',
        filter,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Получить товар по product.id
   * @param {string} productId - UUID товара в МойСклад
   * @returns {Promise<Object>} Данные товара
   */
  async getProductById(productId) {
    try {
      logger.debug('Получение товара по ID', { productId });
      
      const response = await this.client.get(`/entity/product/${productId}`);
      const product = response.data;
      
      logger.debug('Товар получен', {
        productId: product.id,
        productName: product.name
      });
      
      return product;
    } catch (error) {
      logger.error('Ошибка при получении товара по ID', {
        errorType: 'API_ERROR',
        endpoint: `/entity/product/${productId}`,
        productId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Получить остатки товара по складам используя product.id
   * @param {string} productId - UUID товара в МойСклад
   * @returns {Promise<Object>} Данные об остатках
   */
  async getProductStock(productId) {
    try {
      logger.debug('Получение остатков товара', { productId });
      
      // ИСПРАВЛЕНИЕ: МойСклад API требует ПОЛНЫЙ URL в фильтре
      // Формат: https://api.moysklad.ru/api/remap/1.2/entity/product/${productId}
      const productUrl = `${this.baseURL}/entity/product/${productId}`;
      const params = {
        filter: `product=${productUrl}`
      };
      
      const response = await this.client.get('/report/stock/bystore', { params });
      const stockData = response.data.rows || [];
      
      // Парсим данные об остатках
      let totalStock = 0;
      let totalReserve = 0;
      
      stockData.forEach(item => {
        totalStock += item.stock || 0;
        totalReserve += item.reserve || 0;
      });
      
      const availableStock = totalStock - totalReserve;
      
      logger.debug('Остатки товара получены', {
        productId,
        totalStock,
        totalReserve,
        availableStock
      });
      
      return {
        productId,
        totalStock,
        totalReserve,
        availableStock,
        stockByStore: stockData
      };
    } catch (error) {
      logger.error('Ошибка при получении остатков товара', {
        errorType: 'API_ERROR',
        endpoint: '/report/stock/bystore',
        productId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Создать заказ покупателя с резервированием товаров
   * @param {Object} orderData - Данные заказа
   * @returns {Promise<Object>} Созданный заказ
   */
  async createCustomerOrder(orderData) {
    try {
      logger.debug('Создание заказа покупателя', {
        orderData: {
          name: orderData.name,
          positionsCount: orderData.positions?.length
        }
      });
      
      const response = await this.client.post('/entity/customerorder', orderData);
      const order = response.data;
      
      logger.info('Заказ покупателя создан', {
        orderId: order.id,
        orderName: order.name
      });
      
      return order;
    } catch (error) {
      logger.error('Ошибка при создании заказа покупателя', {
        errorType: 'API_ERROR',
        endpoint: '/entity/customerorder',
        orderData: {
          name: orderData.name,
          positionsCount: orderData.positions?.length
        },
        error: error.message,
        errorResponse: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Создать отгрузку
   * @param {Object} shipmentData - Данные отгрузки
   * @returns {Promise<Object>} Созданная отгрузка
   */
  async createShipment(shipmentData) {
    try {
      logger.debug('Создание отгрузки', {
        shipmentData: {
          customerOrder: shipmentData.customerOrder
        }
      });
      
      const response = await this.client.post('/entity/demand', shipmentData);
      const shipment = response.data;
      
      logger.info('Отгрузка создана', {
        shipmentId: shipment.id,
        shipmentName: shipment.name
      });
      
      return shipment;
    } catch (error) {
      logger.error('Ошибка при создании отгрузки', {
        errorType: 'API_ERROR',
        endpoint: '/entity/demand',
        shipmentData: {
          customerOrder: shipmentData.customerOrder
        },
        error: error.message,
        errorResponse: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Получить заказ покупателя по ID
   * @param {string} orderId - ID заказа
   * @returns {Promise<Object>} Данные заказа
   */
  async getCustomerOrder(orderId) {
    try {
      logger.debug('Получение заказа покупателя', { orderId });
      
      const response = await this.client.get(`/entity/customerorder/${orderId}`);
      const order = response.data;
      
      logger.debug('Заказ покупателя получен', {
        orderId: order.id,
        orderName: order.name,
        state: order.state?.name
      });
      
      return order;
    } catch (error) {
      logger.error('Ошибка при получении заказа покупателя', {
        errorType: 'API_ERROR',
        endpoint: `/entity/customerorder/${orderId}`,
        orderId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Обновить статус заказа покупателя
   * @param {string} orderId - ID заказа
   * @param {string} stateId - ID статуса (meta href)
   * @returns {Promise<Object>} Обновленный заказ
   */
  async updateOrderStatus(orderId, stateId) {
    try {
      logger.debug('Обновление статуса заказа', { orderId, stateId });
      
      const updateData = {
        state: {
          meta: {
            href: stateId,
            type: 'state',
            mediaType: 'application/json'
          }
        }
      };
      
      const response = await this.client.put(
        `/entity/customerorder/${orderId}`,
        updateData
      );
      const order = response.data;
      
      logger.info('Статус заказа обновлен', {
        orderId: order.id,
        orderName: order.name
      });
      
      return order;
    } catch (error) {
      logger.error('Ошибка при обновлении статуса заказа', {
        errorType: 'API_ERROR',
        endpoint: `/entity/customerorder/${orderId}`,
        orderId,
        stateId,
        error: error.message,
        errorResponse: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Удалить заказ покупателя (отменить)
   * Используется для отмены заказов которые ещё не отгружены
   * @param {string} orderId - ID заказа
   * @returns {Promise<void>}
   */
  async deleteCustomerOrder(orderId) {
    try {
      logger.debug('Удаление заказа покупателя', { orderId });
      
      await this.client.delete(`/entity/customerorder/${orderId}`);
      
      logger.info('Заказ покупателя удалён', { orderId });
    } catch (error) {
      logger.error('Ошибка при удалении заказа покупателя', {
        errorType: 'API_ERROR',
        endpoint: `/entity/customerorder/${orderId}`,
        orderId,
        error: error.message,
        errorResponse: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Логирование ошибок API
   * @private
   */
  _logApiError(error) {
    const errorDetails = {
      errorType: 'API_ERROR',
      message: error.message,
      endpoint: error.config?.url,
      method: error.config?.method?.toUpperCase(),
      status: error.response?.status,
      statusText: error.response?.statusText,
      errorResponse: error.response?.data
    };
    
    logger.error('Ошибка API МойСклад', errorDetails);
  }
}

module.exports = MoySkladClient;