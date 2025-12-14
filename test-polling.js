// Тестовый скрипт для проверки polling заказов
require('dotenv').config();

const YandexClient = require('./src/api/yandexClient');
const MoySkladClient = require('./src/api/moySkladClient');
const MapperService = require('./src/services/mapperService');
const OrderService = require('./src/services/orderService');
const OrderMappingStore = require('./src/storage/orderMappingStore');
const ProductMappingStore = require('./src/storage/productMappingStore');

async function testPolling() {
  try {
    console.log('🔍 Тестирование polling заказов...\n');
    
    // Инициализация
    const moySkladClient = new MoySkladClient(process.env.MS_TOKEN, process.env.MS_BASE);
    const yandexClient = new YandexClient(process.env.YANDEX_TOKEN, process.env.YANDEX_CAMPAIGN_ID);
    const orderMappingStore = new OrderMappingStore();
    const productMappingStore = new ProductMappingStore();
    const mapperService = new MapperService(moySkladClient, productMappingStore, orderMappingStore);
    
    // Загрузка маппингов
    console.log('📦 Загрузка маппингов...');
    await mapperService.loadMappings();
    console.log(`✅ Загружено ${mapperService.getStats().totalMappings} маппингов\n`);
    
    const orderService = new OrderService(
      moySkladClient,
      yandexClient,
      mapperService,
      orderMappingStore
    );
    
    // Получение заказов
    console.log('📥 Получение заказов из Яндекс.Маркет...');
    const orders = await yandexClient.getOrders({ status: 'PROCESSING' });
    console.log(`✅ Получено ${orders.length} заказов в статусе PROCESSING\n`);
    
    if (orders.length === 0) {
      console.log('⚠️  Нет заказов для обработки');
      return;
    }
    
    // Показываем первые 3 заказа
    console.log('📋 Первые заказы:');
    orders.slice(0, 3).forEach(order => {
      console.log(`  - ID: ${order.id}, Дата: ${order.creationDate}, Товаров: ${order.items?.length || 0}`);
    });
    console.log('');
    
    // Проверяем конкретный заказ
    const testOrderId = '51764436992';
    const testOrder = orders.find(o => o.id === testOrderId);
    
    if (testOrder) {
      console.log(`🎯 Найден тестовый заказ ${testOrderId}:`);
      console.log(`   Статус: ${testOrder.status}`);
      console.log(`   Товаров: ${testOrder.items?.length || 0}`);
      console.log(`   Товары:`);
      testOrder.items?.forEach(item => {
        console.log(`     - offerId: ${item.offerId}, count: ${item.count}`);
      });
      console.log('');
      
      // Пробуем создать заказ
      console.log('🔨 Попытка создать заказ в МойСклад...');
      try {
        await orderService.createMoySkladOrder(testOrder);
        console.log('✅ Заказ успешно создан!');
      } catch (error) {
        console.error('❌ Ошибка при создании заказа:');
        console.error(`   ${error.message}`);
        if (error.stack) {
          console.error(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
        }
      }
    } else {
      console.log(`⚠️  Заказ ${testOrderId} не найден в списке PROCESSING заказов`);
      console.log(`   Возможно он уже в другом статусе`);
    }
    
  } catch (error) {
    console.error('❌ Критическая ошибка:');
    console.error(`   ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    process.exit(1);
  }
}

testPolling();
