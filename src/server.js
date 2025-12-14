const express = require('express');
const config = require('./config');
const logger = require('./logger');

// API Clients
const MoySkladClient = require('./api/moySkladClient');
const YandexClient = require('./api/yandexClient');

// Services
const MapperService = require('./services/mapperService');
const StockService = require('./services/stockService');
const OrderService = require('./services/orderService');

// Storage
const OrderMappingStore = require('./storage/orderMappingStore');
const ProductMappingStore = require('./storage/productMappingStore');

// Scheduler
const CronScheduler = require('./scheduler/cronScheduler');

// Routes
const createMoySkladWebhookRouter = require('./routes/moySkladWebhook');

/**
 * Главный сервер приложения
 * Инициализирует все компоненты и запускает Express сервер
 */
async function startServer() {
  try {
    logger.info('Запуск M2 Middleware сервера', {
      config: config.toSafeObject()
    });

    // Инициализация клиентов
    const moySkladClient = new MoySkladClient(config.MS_TOKEN, config.MS_BASE);
    const yandexClient = new YandexClient(config.YANDEX_TOKEN, config.YANDEX_CAMPAIGN_ID);

    // Инициализация хранилища
    const orderMappingStore = new OrderMappingStore();
    const productMappingStore = new ProductMappingStore();

    // Инициализация сервисов
    const mapperService = new MapperService(moySkladClient, productMappingStore, orderMappingStore);
    const stockService = new StockService(moySkladClient, yandexClient, mapperService);
    const orderService = new OrderService(
      moySkladClient,
      yandexClient,
      mapperService,
      orderMappingStore
    );

    // Инициализация MapperService и загрузка маппингов при старте
    logger.info('Инициализация MapperService...');
    logger.info('Загрузка маппингов товаров из файла...');
    await mapperService.loadMappings();
    logger.info('Маппинги загружены успешно');

    // Создание Express приложения
    const app = express();

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Обработка ошибок парсинга JSON
    app.use((err, req, res, next) => {
      if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        logger.error('Ошибка парсинга JSON', {
          errorType: 'JSON_PARSE_ERROR',
          error: err.message,
          path: req.path
        });
        return res.status(400).json({ 
          error: 'Bad Request',
          message: 'Invalid JSON in request body'
        });
      }
      next(err);
    });

    // Логирование запросов
    app.use((req, res, next) => {
      logger.debug('Входящий запрос', {
        method: req.method,
        path: req.path,
        ip: req.ip
      });
      next();
    });

    // Health check endpoint
    app.get('/m2/health', (req, res) => {
      res.json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Статистика маппинга (Требование 9.4)
    app.get('/m2/api/mapping/stats', (req, res) => {
      try {
        const stats = mapperService.getStats();
        res.json(stats);
      } catch (error) {
        logger.error('Ошибка при получении статистики маппинга', {
          error: error.message
        });
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to retrieve mapping statistics'
        });
      }
    });

    // Краткая статистика маппинга для dashboard (Требование 9.4)
    app.get('/m2/api/mapping/summary', (req, res) => {
      try {
        const summary = mapperService.getSummary();
        res.json(summary);
      } catch (error) {
        logger.error('Ошибка при получении краткой статистики маппинга', {
          error: error.message
        });
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to retrieve mapping summary'
        });
      }
    });

    // Webhook маршруты
    app.use('/m2', createMoySkladWebhookRouter(stockService, orderService));

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({ 
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`
      });
    });

    // Error handler
    app.use((err, req, res, next) => {
      logger.error('Необработанная ошибка в Express', {
        errorType: 'EXPRESS_ERROR',
        error: err.message,
        stack: err.stack,
        path: req.path
      });

      res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      });
    });

    // Запуск сервера
    const server = app.listen(config.PORT, () => {
      logger.info(`Сервер запущен на порту ${config.PORT}`, {
        port: config.PORT,
        env: process.env.NODE_ENV || 'production'
      });
    });

    // Инициализация и запуск cron планировщика
    logger.info('Инициализация cron планировщика...');
    const cronScheduler = new CronScheduler();
    
    // Запуск синхронизации остатков
    cronScheduler.scheduleStockSync(
      config.STOCK_SYNC_INTERVAL_MINUTES,
      () => stockService.syncStocks()
    );
    logger.info(`Синхронизация остатков запланирована каждые ${config.STOCK_SYNC_INTERVAL_MINUTES} минут`);
    
    // Запуск polling заказов
    cronScheduler.scheduleOrderPolling(
      config.ORDER_POLL_INTERVAL_MINUTES,
      () => orderService.pollAndProcessOrders()
    );
    logger.info(`Polling заказов запланирован каждые ${config.ORDER_POLL_INTERVAL_MINUTES} минут`);
    
    // Запуск polling отгруженных заказов
    cronScheduler.scheduleShipmentPolling(
      config.ORDER_POLL_INTERVAL_MINUTES,
      () => orderService.processShippedOrders()
    );
    logger.info(`Polling отгрузок запланирован каждые ${config.ORDER_POLL_INTERVAL_MINUTES} минут`);

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Получен сигнал завершения, останавливаем сервер...');
      
      // Остановка cron jobs
      logger.info('Остановка cron планировщика...');
      cronScheduler.stopAll();
      
      server.close(() => {
        logger.info('HTTP сервер остановлен');
        process.exit(0);
      });

      // Принудительное завершение через 10 секунд
      setTimeout(() => {
        logger.error('Принудительное завершение после таймаута');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    return { app, server, stockService, orderService, mapperService, cronScheduler };

  } catch (error) {
    logger.error('Критическая ошибка при запуске сервера', {
      errorType: 'STARTUP_ERROR',
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Запуск сервера если файл запущен напрямую
if (require.main === module) {
  startServer().catch(error => {
    console.error('Не удалось запустить сервер:', error);
    process.exit(1);
  });
}

module.exports = { startServer };