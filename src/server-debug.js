// Отладочная версия server.js с выводом в консоль

console.log('=== СТАРТ СЕРВЕРА ===');
console.log('1. Загрузка модулей...');

try {
  const express = require('express');
  console.log('✅ express загружен');
  
  const config = require('./config');
  console.log('✅ config загружен');
  console.log('   PORT:', config.PORT);
  console.log('   YANDEX_CAMPAIGN_ID:', config.YANDEX_CAMPAIGN_ID);
  
  const logger = require('./logger');
  console.log('✅ logger загружен');
  
  // API Clients
  const MoySkladClient = require('./api/moySkladClient');
  console.log('✅ MoySkladClient загружен');
  
  const YandexClient = require('./api/yandexClient');
  console.log('✅ YandexClient загружен');
  
  // Services
  const MapperService = require('./services/mapperService');
  console.log('✅ MapperService загружен');
  
  const StockService = require('./services/stockService');
  console.log('✅ StockService загружен');
  
  const OrderService = require('./services/orderService');
  console.log('✅ OrderService загружен');
  
  // Storage
  const OrderMappingStore = require('./storage/orderMappingStore');
  console.log('✅ OrderMappingStore загружен');
  
  const ProductMappingStore = require('./storage/productMappingStore');
  console.log('✅ ProductMappingStore загружен');
  
  // Scheduler
  const CronScheduler = require('./scheduler/cronScheduler');
  console.log('✅ CronScheduler загружен');
  
  // Routes
  const createMoySkladWebhookRouter = require('./routes/moySkladWebhook');
  console.log('✅ moySkladWebhook загружен');
  
  console.log('\n2. Все модули загружены успешно!');
  console.log('3. Запуск функции startServer...\n');
  
  // Теперь запускаем сервер
  async function startServer() {
    try {
      console.log('4. Инициализация клиентов...');
      const moySkladClient = new MoySkladClient(config.MS_TOKEN, config.MS_BASE);
      console.log('✅ moySkladClient создан');
      
      const yandexClient = new YandexClient(config.YANDEX_TOKEN, config.YANDEX_CAMPAIGN_ID);
      console.log('✅ yandexClient создан');
      
      console.log('5. Инициализация хранилища...');
      const orderMappingStore = new OrderMappingStore();
      console.log('✅ orderMappingStore создан');
      
      const productMappingStore = new ProductMappingStore();
      console.log('✅ productMappingStore создан');
      
      console.log('6. Инициализация сервисов...');
      const mapperService = new MapperService(moySkladClient, productMappingStore, orderMappingStore);
      console.log('✅ mapperService создан');
      
      const stockService = new StockService(moySkladClient, yandexClient, mapperService);
      console.log('✅ stockService создан');
      
      const orderService = new OrderService(moySkladClient, yandexClient, mapperService, orderMappingStore);
      console.log('✅ orderService создан');
      
      console.log('7. Загрузка маппингов...');
      await mapperService.loadMappings();
      console.log('✅ Маппинги загружены');
      
      console.log('8. Создание Express приложения...');
      const app = express();
      
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));
      console.log('✅ Middleware настроены');
      
      // Health check
      app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
      });
      console.log('✅ Health endpoint настроен');
      
      // API endpoints
      app.get('/api/mapping/stats', (req, res) => {
        try {
          const stats = mapperService.getStats();
          res.json(stats);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      });
      console.log('✅ API endpoints настроены');
      
      // Webhook routes
      app.use('/', createMoySkladWebhookRouter(stockService));
      console.log('✅ Webhook routes настроены');
      
      console.log('9. Запуск HTTP сервера на порту', config.PORT, '...');
      const server = app.listen(config.PORT, () => {
        console.log('✅✅✅ СЕРВЕР ЗАПУЩЕН НА ПОРТУ', config.PORT, '✅✅✅');
        console.log('Проверьте: curl http://localhost:' + config.PORT + '/health');
      });
      
      console.log('10. Инициализация cron планировщика...');
      const cronScheduler = new CronScheduler();
      cronScheduler.scheduleStockSync(config.STOCK_SYNC_INTERVAL_MINUTES, () => stockService.syncStocks());
      cronScheduler.scheduleOrderPolling(config.ORDER_POLL_INTERVAL_MINUTES, () => orderService.pollAndProcessOrders());
      cronScheduler.scheduleShipmentPolling(config.ORDER_POLL_INTERVAL_MINUTES, () => orderService.processShippedOrders());
      console.log('✅ Cron планировщик настроен');
      
      console.log('\n=== СЕРВЕР ПОЛНОСТЬЮ ГОТОВ К РАБОТЕ ===\n');
      
      return { app, server, stockService, orderService, mapperService, cronScheduler };
      
    } catch (error) {
      console.error('\n❌❌❌ ОШИБКА ПРИ ЗАПУСКЕ СЕРВЕРА ❌❌❌');
      console.error('Тип ошибки:', error.name);
      console.error('Сообщение:', error.message);
      console.error('Stack trace:');
      console.error(error.stack);
      process.exit(1);
    }
  }
  
  // Запускаем
  startServer().catch(error => {
    console.error('\n❌❌❌ НЕОБРАБОТАННАЯ ОШИБКА ❌❌❌');
    console.error(error);
    process.exit(1);
  });
  
} catch (error) {
  console.error('\n❌❌❌ ОШИБКА ПРИ ЗАГРУЗКЕ МОДУЛЕЙ ❌❌❌');
  console.error('Тип ошибки:', error.name);
  console.error('Сообщение:', error.message);
  console.error('Stack trace:');
  console.error(error.stack);
  process.exit(1);
}
