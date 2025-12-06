const axios = require('axios');
const logger = require('../logger');
const config = require('../config');

class YandexClient {
  constructor() {
    this.baseURL = 'https://api.partner.market.yandex.ru';
    this.campaignId = config.YANDEX_CAMPAIGN_ID;
    this.token = config.YANDEX_TOKEN;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.token}`,
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
   * Обновить остатки товаров (до 2000 товаров за раз)
   * @param {Array} stockUpdates - Массив обновлений остатков
   *   Каждый элемент должен содержать:
   *   - offerId: идентификатор товара в Яндекс.Маркет M2 (получен из маппинга product.id → offerId)
   *   - count: количество товара
   *   - warehouseId: ID склада (опционально, по умолчанию 0)
   * @returns {Promise<Object>} Результат обновления
   */
  async updateStocks(stockUpdates) {
    try {
      if (stockUpdates.length > 2000) {
        logger.warn('Попытка обновить больше 2000 товаров за раз', {
          count: stockUpdates.length
        });
        throw new Error('Максимум 2000 товаров за один запрос');
      }

      logger.debug('Обновление остатков в Яндекс.Маркет', {
        count: stockUpdates.length,
        offerIds: stockUpdates.map(item => item.offerId).slice(0, 5) // Первые 5 для отладки
      });

      const requestData = {
        skus: stockUpdates.map(item => ({
          sku: item.offerId, // В API M2 поле называется sku, значение берём из offerId
          warehouseId: item.warehouseId || 0,
          items: [{
            count: item.count,
            type: 'FIT',
            updatedAt: new Date().toISOString()
          }]
        }))
      };

      const response = await this._makeRequestWithRetry(
        'PUT',
        `/campaigns/${this.campaignId}/offers/stocks`,
        requestData
      );

      logger.info('Остатки обновлены в Яндекс.Маркет', {
        count: stockUpdates.length,
        status: response.status
      });

      return response.data;
    } catch (error) {
      logger.error('Ошибка при обновлении остатков', {
        errorType: 'API_ERROR',
        endpoint: `/campaigns/${this.campaignId}/offers/stocks`,
        count: stockUpdates.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Получить заказы с фильтрацией
   * @param {Object} filters - Параметры фильтрации (status, fromDate, toDate, etc.)
   * @returns {Promise<Array>} Массив заказов
   */
  async getOrders(filters = {}) {
    try {
      logger.debug('Получение заказов из Яндекс.Маркет', { filters });

      const params = {
        ...filters
      };

      const response = await this._makeRequestWithRetry(
        'GET',
        `/campaigns/${this.campaignId}/orders`,
        null,
        { params }
      );

      const orders = response.data.orders || [];

      logger.info(`Получено ${orders.length} заказов из Яндекс.Маркет`);

      return orders;
    } catch (error) {
      logger.error('Ошибка при получении заказов', {
        errorType: 'API_ERROR',
        endpoint: `/campaigns/${this.campaignId}/orders`,
        filters,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Получить детали конкретного заказа
   * @param {string} orderId - ID заказа
   * @returns {Promise<Object>} Данные заказа
   */
  async getOrder(orderId) {
    try {
      logger.debug('Получение деталей заказа', { orderId });

      const response = await this._makeRequestWithRetry(
        'GET',
        `/campaigns/${this.campaignId}/orders/${orderId}`
      );

      const order = response.data.order;

      logger.info('Детали заказа получены', {
        orderId: order.id,
        status: order.status
      });

      return order;
    } catch (error) {
      logger.error('Ошибка при получении деталей заказа', {
        errorType: 'API_ERROR',
        endpoint: `/campaigns/${this.campaignId}/orders/${orderId}`,
        orderId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Выполнить запрос с обработкой rate limiting и повторными попытками
   * @private
   * @param {string} method - HTTP метод
   * @param {string} url - URL endpoint
   * @param {Object} data - Данные запроса
   * @param {Object} config - Дополнительная конфигурация axios
   * @param {number} retryCount - Счетчик попыток
   * @returns {Promise<Object>} Ответ от API
   */
  async _makeRequestWithRetry(method, url, data = null, config = {}, retryCount = 0) {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 секунда

    try {
      let response;
      
      if (method === 'GET') {
        response = await this.client.get(url, config);
      } else if (method === 'PUT') {
        response = await this.client.put(url, data, config);
      } else if (method === 'POST') {
        response = await this.client.post(url, data, config);
      } else {
        throw new Error(`Неподдерживаемый HTTP метод: ${method}`);
      }

      return response;
    } catch (error) {
      // Проверяем rate limiting (429 Too Many Requests)
      if (error.response?.status === 429 && retryCount < maxRetries) {
        // Получаем время ожидания из заголовка Retry-After или используем экспоненциальную задержку
        const retryAfter = error.response.headers['retry-after'];
        const delay = retryAfter 
          ? parseInt(retryAfter) * 1000 
          : baseDelay * Math.pow(2, retryCount);

        logger.warn('Rate limit достигнут, повторная попытка через задержку', {
          retryCount: retryCount + 1,
          maxRetries,
          delayMs: delay,
          endpoint: url
        });

        await this._sleep(delay);
        return this._makeRequestWithRetry(method, url, data, config, retryCount + 1);
      }

      // Для других ошибок 5xx также пробуем повторить
      if (error.response?.status >= 500 && retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount);

        logger.warn('Ошибка сервера, повторная попытка через задержку', {
          status: error.response.status,
          retryCount: retryCount + 1,
          maxRetries,
          delayMs: delay,
          endpoint: url
        });

        await this._sleep(delay);
        return this._makeRequestWithRetry(method, url, data, config, retryCount + 1);
      }

      // Если исчерпаны попытки или другая ошибка - пробрасываем дальше
      throw error;
    }
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

    logger.error('Ошибка API Яндекс.Маркет', errorDetails);
  }
}

module.exports = YandexClient;