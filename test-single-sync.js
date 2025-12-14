#!/usr/bin/env node

/**
 * Тест синхронизации одного товара
 */

require('dotenv').config();
const StockService = require('./src/services/stockService');
const MoySkladClient = require('./src/api/moySkladClient');
const YandexClient = require('./src/api/yandexClient');
const MapperService = require('./src/services/mapperService');
const ProductMappingStore = require('./src/storage/productMappingStore');
const OrderMappingStore = require('./src/storage/orderMappingStore');

(async () => {
  try {
    console.log('🧪 Тест синхронизации товара BARDAHL_XTC_10W-40_DBSA\n');
    
    // Инициализация
    const productStore = new ProductMappingStore();
    await productStore.load();
    
    const orderStore = new OrderMappingStore();
    
    const moySkladClient = new MoySkladClient();
    const yandexClient = new YandexClient();
    const mapperService = new MapperService(moySkladClient, productStore, orderStore);
    
    await mapperService.loadMappings();
    
    const stockService = new StockService(moySkladClient, yandexClient, mapperService);
    
    // Ищем товар в маппинге
    const testProductId = 'JtMnktCNjQ7PeSBntimVw0'; // ID из маппинга
    const offerId = mapperService.mapProductIdToOfferId(testProductId);
    
    console.log('📦 Товар:');
    console.log(`   product.id: ${testProductId}`);
    console.log(`   offerId M2: ${offerId}`);
    console.log();
    
    if (!offerId) {
      console.log('❌ Товар не найден в маппинге!');
      process.exit(1);
    }
    
    // Получаем остаток из МойСклад
    console.log('📊 Получаю остаток из МойСклад...');
    const stockData = await moySkladClient.getProductStock(testProductId);
    console.log(`   Остаток: ${stockData.availableStock}`);
    console.log(`   Резерв: ${stockData.reserve}`);
    console.log();
    
    // Отправляем в Яндекс
    console.log('📤 Отправляю остаток в Яндекс M2...');
    console.log(`   Campaign ID: ${process.env.YANDEX_CAMPAIGN_ID}`);
    console.log(`   offerId: ${offerId}`);
    console.log(`   Остаток: ${stockData.availableStock}`);
    console.log();
    
    await stockService.handleStockUpdate(testProductId);
    
    console.log('✅ Синхронизация завершена!');
    console.log();
    console.log('Проверьте в личном кабинете M2:');
    console.log(`   offerId: ${offerId}`);
    console.log(`   Ожидаемый остаток: ${stockData.availableStock}`);
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
