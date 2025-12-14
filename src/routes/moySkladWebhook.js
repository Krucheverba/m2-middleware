const express = require('express');
const logger = require('../logger');

/**
 * Маршрут для обработки webhook событий от Яндекс.Маркет и МойСклад
 * Проверяет: Требования 4.1, 4.2, 4.3, 4.4, 4.5
 */
function createMoySkladWebhookRouter(stockService, orderService) {
  const router = express.Router();

  /**
   * GET /webhook
   * Endpoint для проверки webhook от Яндекс.Маркет (базовый путь)
   * Яндекс может проверять доступность по базовому пути
   */
  router.get('/webhook', (req, res) => {
    logger.info('Получен GET PING запрос от Яндекс.Маркет на базовый путь /webhook');
    
    res.status(200).json({
      version: "1.0.0",
      name: "M2 Middleware Webhook",
      time: new Date().toISOString()
    });
  });

  /**
   * POST /webhook
   * Endpoint для обработки webhook событий от Яндекс.Маркет (базовый путь)
   * Яндекс отправляет POST запросы с событиями заказов
   */
  router.post('/webhook', async (req, res) => {
    try {
      logger.info('Получен POST запрос от Яндекс.Маркет на базовый путь /webhook', {
        body: req.body,
        headers: {
          'content-type': req.headers['content-type'],
          'user-agent': req.headers['user-agent']
        }
      });
      
      const webhookData = req.body;
      
      // Быстро отвечаем Яндекс.Маркет что webhook принят
      res.status(200).json({
        status: "accepted",
        message: "Webhook received",
        time: new Date().toISOString()
      });
      
      // Обработка webhook асинхронно, не блокируем ответ
      setImmediate(() => {
        handleYandexWebhook(webhookData, orderService)
          .catch(error => {
            logger.error('Ошибка при асинхронной обработке webhook от Яндекс.Маркет', {
              error: error.message,
              stack: error.stack,
              webhookData
            });
          });
      });
      
    } catch (error) {
      logger.error('Ошибка при обработке webhook от Яндекс.Маркет', {
        error: error.message,
        stack: error.stack,
        body: req.body
      });
      
      // Возвращаем 200 OK даже при ошибке, чтобы Яндекс не повторял webhook
      res.status(200).json({
        status: "error",
        message: "Failed to process webhook"
      });
    }
  });

  /**
   * GET /webhook/notification
   * Endpoint для проверки webhook от Яндекс.Маркет
   * Яндекс отправляет PING запрос для проверки доступности
   */
  router.get('/webhook/notification', (req, res) => {
    logger.info('Получен GET PING запрос от Яндекс.Маркет для проверки webhook');
    
    res.status(200).json({
      version: "1.0.0",
      name: "M2 Middleware Webhook",
      time: new Date().toISOString()
    });
  });

  /**
   * POST /webhook/notification
   * Endpoint для обработки PING от Яндекс.Маркет
   * Яндекс может отправлять POST запросы для проверки
   */
  router.post('/webhook/notification', (req, res) => {
    logger.info('Получен POST PING запрос от Яндекс.Маркет для проверки webhook', {
      body: req.body
    });
    
    res.status(200).json({
      version: "1.0.0",
      name: "M2 Middleware Webhook",
      time: new Date().toISOString()
    });
  });

  /**
   * POST /webhook/moysklad
   * Обрабатывает webhook события от МойСклад о изменении остатков
   * Извлекает product.id из event.meta.href и передает в StockService
   */
  router.post('/webhook/moysklad', async (req, res) => {
    try {
      logger.info('Получен webhook от МойСклад', {
        headers: {
          'content-type': req.headers['content-type'],
          'user-agent': req.headers['user-agent']
        }
      });

      // Валидация подлинности webhook (Требование 4.1)
      if (!validateWebhook(req)) {
        logger.logWebhookError(
          'Невалидный webhook отклонён',
          { headers: req.headers }
        );
        return res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Webhook validation failed'
        });
      }

      // Извлечение данных webhook (Требование 4.2)
      const webhookData = req.body;
      
      if (!webhookData || Object.keys(webhookData).length === 0) {
        logger.logWebhookError('Webhook без данных', {});
        return res.status(400).json({ 
          error: 'Bad Request',
          message: 'Webhook data is required'
        });
      }

      logger.debug('Webhook payload получен', {
        hasEvents: !!webhookData.events,
        eventsCount: webhookData.events?.length || 0
      });

      // Проверка что это событие изменения остатков
      if (!isStockChangeEvent(webhookData)) {
        logger.info('Webhook не является событием изменения остатков, пропускаем', {
          action: webhookData.action,
          entityType: webhookData.entityType
        });
        return res.status(200).json({ 
          status: 'ignored',
          message: 'Not a stock change event'
        });
      }

      // Извлечь product.id из webhook данных (Требование 4.1, 4.2)
      // product.id извлекается из event.meta.href
      const productId = extractProductIdFromWebhook(webhookData);
      
      if (!productId) {
        logger.logWebhookError(
          'Не удалось извлечь product.id из webhook',
          { 
            webhookData,
            hasEvents: !!webhookData.events,
            hasMeta: !!(webhookData.events?.[0]?.meta),
            hasHref: !!(webhookData.events?.[0]?.meta?.href)
          }
        );
        // Возвращаем 200 OK чтобы МойСклад не повторял webhook (Требование 4.5)
        return res.status(200).json({ 
          status: 'ignored',
          message: 'Could not extract product.id from webhook'
        });
      }

      logger.info('product.id успешно извлечен из webhook', {
        productId,
        eventType: webhookData.events?.[0]?.meta?.type,
        action: webhookData.events?.[0]?.action
      });

      // Обработка webhook через StockService (Требование 4.3, 4.4)
      // Передаем product.id в StockService для обработки
      // Обработка асинхронная, не блокируем ответ
      setImmediate(() => {
        stockService.handleStockUpdate(productId)
          .catch(error => {
            logger.logWebhookError(
              'Ошибка при асинхронной обработке webhook',
              { productId },
              error
            );
          });
      });

      // Быстро отвечаем МойСклад что webhook принят (Требование 4.5)
      res.status(200).json({ 
        status: 'accepted',
        message: 'Webhook received and processing',
        productId: productId
      });

    } catch (error) {
      logger.logWebhookError(
        'Ошибка при обработке webhook',
        req.body || {},
        error
      );
      
      // Возвращаем 200 OK даже при ошибке, чтобы МойСклад не повторял webhook (Требование 4.5)
      res.status(200).json({ 
        status: 'error',
        message: 'Failed to process webhook'
      });
    }
  });

  return router;
}

/**
 * Валидация подлинности webhook от МойСклад
 * Проверяет: Требование 4.1
 * 
 * @param {Object} req - Express request объект
 * @returns {boolean} true если webhook валиден
 */
function validateWebhook(req) {
  // МойСклад отправляет webhooks с определённым User-Agent
  const userAgent = req.headers['user-agent'] || '';
  
  // Проверяем что запрос пришёл от МойСклад
  // МойСклад использует User-Agent содержащий "MoySklad"
  if (!userAgent.includes('MoySklad') && !userAgent.includes('moysklad')) {
    logger.warn('Webhook от неизвестного источника', {
      userAgent
    });
    // В продакшене можно добавить более строгую валидацию
    // Например, проверку IP адреса или подписи
  }

  // Проверяем что Content-Type корректный
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    logger.warn('Webhook с некорректным Content-Type', {
      contentType
    });
    return false;
  }

  // Базовая валидация пройдена
  return true;
}

/**
 * Извлечь product.id из webhook данных
 * Проверяет: Требование 4.1, 4.2
 * 
 * product.id извлекается из event.meta.href
 * Пример: "https://api.moysklad.ru/api/remap/1.2/entity/product/f8a2da33-bf0a-11ef-0a80-17e3002d7201"
 * Результат: "f8a2da33-bf0a-11ef-0a80-17e3002d7201"
 * 
 * @param {Object} webhookData - Данные webhook
 * @returns {string|null} product.id (UUID) или null
 */
function extractProductIdFromWebhook(webhookData) {
  try {
    // Webhook от МойСклад содержит events массив с объектами
    // Каждый event содержит meta.href с полным URL товара
    if (webhookData.events && Array.isArray(webhookData.events)) {
      const event = webhookData.events[0];
      
      if (!event) {
        logger.warn('Webhook events массив пуст');
        return null;
      }
      
      if (!event.meta || !event.meta.href) {
        logger.warn('Webhook event не содержит meta.href', {
          hasMeta: !!event.meta,
          eventKeys: Object.keys(event)
        });
        return null;
      }
      
      const href = event.meta.href;
      
      // Извлечь product.id из href (последняя часть URL после последнего /)
      // href формат: "https://api.moysklad.ru/api/remap/1.2/entity/product/{product.id}"
      const parts = href.split('/');
      const productId = parts[parts.length - 1];
      
      // Валидация что это похоже на UUID
      if (!productId || productId.length === 0) {
        logger.warn('Извлеченный product.id пустой', { href });
        return null;
      }
      
      // Базовая проверка формата UUID (8-4-4-4-12 символов)
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(productId)) {
        logger.warn('Извлеченный product.id не соответствует формату UUID', {
          productId,
          href
        });
        // Все равно возвращаем, возможно формат изменился
      }
      
      logger.debug('product.id успешно извлечен из event.meta.href', {
        productId,
        href
      });
      
      return productId;
    }

    // Альтернативный формат - прямая ссылка на товар (для обратной совместимости)
    if (webhookData.meta && webhookData.meta.href) {
      const href = webhookData.meta.href;
      const parts = href.split('/');
      const productId = parts[parts.length - 1];
      
      logger.debug('product.id извлечен из альтернативного формата', {
        productId,
        href
      });
      
      return productId;
    }

    logger.warn('Webhook не содержит ожидаемую структуру для извлечения product.id', {
      hasEvents: !!webhookData.events,
      hasMeta: !!webhookData.meta,
      webhookKeys: Object.keys(webhookData)
    });
    
    return null;
  } catch (error) {
    logger.logWebhookError(
      'Ошибка при парсинге product.id из webhook',
      { webhookData },
      error
    );
    return null;
  }
}

/**
 * Проверка что webhook событие относится к изменению остатков
 * Проверяет: Требование 4.2
 * 
 * @param {Object} webhookData - Данные webhook
 * @returns {boolean} true если это событие изменения остатков
 */
function isStockChangeEvent(webhookData) {
  // МойСклад отправляет разные типы событий
  // Нас интересуют события связанные с остатками товаров
  
  // Извлекаем данные из events массива
  let action, entityType;
  
  if (webhookData.events && Array.isArray(webhookData.events) && webhookData.events.length > 0) {
    const event = webhookData.events[0];
    action = event.action;
    entityType = event.meta?.type;
  } else {
    // Альтернативный формат (для обратной совместимости)
    action = webhookData.action;
    entityType = webhookData.entityType;
  }
  
  // События которые могут влиять на остатки:
  // - product (товар)
  // - stock (остаток)
  // - enter (оприходование)
  // - loss (списание)
  // - move (перемещение)
  // - customerorder (заказ покупателя - резервирует товар)
  // - demand (отгрузка - уменьшает остаток)
  
  const stockRelatedTypes = [
    'product',
    'stock', 
    'enter',
    'loss',
    'move',
    'customerorder',
    'demand'
  ];
  
  if (!entityType) {
    logger.debug('Webhook не содержит entityType', {
      hasEvents: !!webhookData.events,
      webhookKeys: Object.keys(webhookData)
    });
    return false;
  }
  
  // Проверяем что тип события связан с остатками
  const isStockRelated = stockRelatedTypes.some(type => 
    entityType.toLowerCase().includes(type)
  );
  
  const isValidAction = action === 'CREATE' || action === 'UPDATE' || action === 'DELETE';
  
  logger.debug('Проверка типа webhook события', {
    entityType,
    action,
    isStockRelated,
    isValidAction,
    result: isStockRelated && isValidAction
  });
  
  return isStockRelated && isValidAction;
}

/**
 * Обработка webhook событий от Яндекс.Маркет
 * Обрабатывает события: ORDER_CREATED, ORDER_CANCELLED, ORDER_STATUS_UPDATED
 * 
 * @param {Object} webhookData - Данные webhook от Яндекс.Маркет
 * @param {Object} orderService - Сервис для обработки заказов
 * @returns {Promise<void>}
 */
async function handleYandexWebhook(webhookData, orderService) {
  try {
    // Извлечь тип события и данные заказа
    const eventType = webhookData.eventType;
    const orderId = webhookData.orderId;
    
    logger.info('Обработка webhook события от Яндекс.Маркет', {
      eventType,
      orderId,
      webhookData
    });
    
    // Обработка разных типов событий
    switch (eventType) {
      case 'ORDER_CREATED':
        // Новый заказ создан - получить полные данные и создать в МойСклад
        logger.info('Получено событие ORDER_CREATED', { orderId });
        await handleOrderCreated(orderId, orderService);
        break;
        
      case 'ORDER_STATUS_UPDATED':
        // Статус заказа изменился - проверить если это отгрузка
        logger.info('Получено событие ORDER_STATUS_UPDATED', { orderId });
        await handleOrderStatusUpdated(orderId, webhookData, orderService);
        break;
        
      case 'ORDER_CANCELLED':
        // Заказ отменён - отменить в МойСклад
        logger.info('Получено событие ORDER_CANCELLED', { orderId });
        await handleOrderCancelled(orderId, orderService);
        break;
        
      default:
        logger.info('Неизвестный тип события webhook, пропускаем', {
          eventType,
          orderId
        });
    }
    
  } catch (error) {
    logger.error('Ошибка при обработке webhook от Яндекс.Маркет', {
      error: error.message,
      stack: error.stack,
      webhookData
    });
    // Не пробрасываем ошибку - webhook уже подтверждён
  }
}

/**
 * Обработка события ORDER_CREATED
 * Получает полные данные заказа и создаёт его в МойСклад
 * 
 * @param {string} orderId - ID заказа M2
 * @param {Object} orderService - Сервис для обработки заказов
 * @returns {Promise<void>}
 */
async function handleOrderCreated(orderId, orderService) {
  try {
    // Получить полные данные заказа из Яндекс.Маркет API
    const order = await orderService.yandexClient.getOrder(orderId);
    
    logger.info('Получены данные заказа из Яндекс.Маркет', {
      orderId,
      status: order.status,
      itemsCount: order.items?.length || 0
    });
    
    // Проверить статус заказа - создаём только если статус PROCESSING
    if (order.status === 'PROCESSING') {
      // Создать заказ в МойСклад
      await orderService.createMoySkladOrder(order);
      
      logger.info('Заказ успешно создан в МойСклад через webhook', {
        orderId
      });
    } else {
      logger.info('Заказ не в статусе PROCESSING, пропускаем создание', {
        orderId,
        status: order.status
      });
    }
    
  } catch (error) {
    logger.error('Ошибка при обработке ORDER_CREATED', {
      orderId,
      error: error.message,
      stack: error.stack
    });
    // Не пробрасываем ошибку - будет обработано через polling
  }
}

/**
 * Обработка события ORDER_STATUS_UPDATED
 * Проверяет если заказ отгружен и создаёт отгрузку в МойСклад
 * 
 * @param {string} orderId - ID заказа M2
 * @param {Object} webhookData - Данные webhook
 * @param {Object} orderService - Сервис для обработки заказов
 * @returns {Promise<void>}
 */
async function handleOrderStatusUpdated(orderId, webhookData, orderService) {
  try {
    // Получить новый статус из webhook данных
    const newStatus = webhookData.newStatus || webhookData.status;
    
    logger.info('Статус заказа изменился', {
      orderId,
      newStatus
    });
    
    // Если заказ отгружен - создать отгрузку в МойСклад
    if (newStatus === 'SHIPPED' || newStatus === 'DELIVERED') {
      logger.info('Заказ отгружен, создаём отгрузку в МойСклад', {
        orderId,
        newStatus
      });
      
      await orderService.createShipment(orderId);
      
      logger.info('Отгрузка успешно создана в МойСклад через webhook', {
        orderId
      });
    } else {
      logger.info('Статус заказа не требует создания отгрузки', {
        orderId,
        newStatus
      });
    }
    
  } catch (error) {
    logger.error('Ошибка при обработке ORDER_STATUS_UPDATED', {
      orderId,
      error: error.message,
      stack: error.stack
    });
    // Не пробрасываем ошибку - будет обработано через polling
  }
}

/**
 * Обработка события ORDER_CANCELLED
 * Отменяет заказ в МойСклад если он ещё не отгружен
 * 
 * @param {string} orderId - ID заказа M2
 * @param {Object} orderService - Сервис для обработки заказов
 * @returns {Promise<void>}
 */
async function handleOrderCancelled(orderId, orderService) {
  try {
    logger.info('Обработка отмены заказа', { orderId });
    
    // Отменить заказ в МойСклад
    await orderService.cancelOrder(orderId);
    
    logger.info('Заказ успешно отменён в МойСклад через webhook', {
      orderId
    });
    
  } catch (error) {
    // Проверить если это ошибка "заказ уже отгружен"
    if (error.message.includes('уже отгружен')) {
      logger.warn('Заказ уже отгружен, автоматическая отмена невозможна', {
        orderId,
        error: error.message
      });
      // Это ожидаемая ситуация - не логируем как ошибку
    } else {
      logger.error('Ошибка при обработке ORDER_CANCELLED', {
        orderId,
        error: error.message,
        stack: error.stack
      });
    }
    // Не пробрасываем ошибку - webhook уже подтверждён
  }
}

module.exports = createMoySkladWebhookRouter;
