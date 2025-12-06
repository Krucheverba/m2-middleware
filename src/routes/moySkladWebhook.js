const express = require('express');
const logger = require('../logger');

/**
 * Маршрут для обработки webhook событий от МойСклад
 * Проверяет: Требования 4.1, 4.2, 4.3, 4.4, 4.5
 */
function createMoySkladWebhookRouter(stockService) {
  const router = express.Router();

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

module.exports = createMoySkladWebhookRouter;
