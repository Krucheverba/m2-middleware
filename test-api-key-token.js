#!/usr/bin/env node
/**
 * Тест API-key токена
 * Проверяет работу нового токена с Яндекс.Маркет API
 */

require('dotenv').config();
const YandexClient = require('./src/api/yandexClient');

async function testApiKeyToken() {
  console.log('🔍 Тестирование API-key токена...\n');
  
  const client = new YandexClient();
  
  console.log('📋 Конфигурация:');
  console.log(`Campaign ID: ${client.campaignId}`);
  console.log(`Token format: ${client.token.substring(0, 10)}...`);
  console.log(`Headers:`, client.client.defaults.headers);
  console.log('');
  
  try {
    console.log('📥 Попытка получить заказы...');
    const orders = await client.getOrders({ status: 'PROCESSING' });
    console.log(`✅ Успешно! Получено ${orders.length} заказов в статусе PROCESSING`);
    
    if (orders.length > 0) {
      console.log(`\nПример заказа:`);
      console.log(`  ID: ${orders[0].id}`);
      console.log(`  Status: ${orders[0].status}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Ошибка при запросе к API:');
    console.error(`  Status: ${error.response?.status}`);
    console.error(`  Message: ${error.response?.data?.error?.message || error.message}`);
    console.error(`  Code: ${error.response?.data?.error?.code}`);
    
    if (error.response?.status === 403) {
      console.error('\n⚠️  Ошибка 403 - Access Denied');
      console.error('Возможные причины:');
      console.error('  1. Токен ещё не активирован (подождите 10 минут после создания)');
      console.error('  2. Токен создан с неправильными правами');
      console.error('  3. Токен не привязан к Campaign ID ' + client.campaignId);
      console.error('\nРекомендации:');
      console.error('  1. Удалите токен в кабинете Яндекс.Маркет');
      console.error('  2. Создайте новый токен с правами "all-methods"');
      console.error('  3. Убедитесь что выбран магазин ID ' + client.campaignId);
      console.error('  4. Обновите .env с новым токеном');
      console.error('  5. Перезапустите сервер');
    }
    
    return false;
  }
}

testApiKeyToken()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Неожиданная ошибка:', error);
    process.exit(1);
  });
