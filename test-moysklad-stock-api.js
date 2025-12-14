#!/usr/bin/env node

/**
 * Тест разных форматов запроса остатков из МойСклад API
 */

require('dotenv').config();
const axios = require('axios');

const MS_BASE = process.env.MS_BASE || 'https://api.moysklad.ru/api/remap/1.2';
const MS_TOKEN = process.env.MS_TOKEN;

const client = axios.create({
  baseURL: MS_BASE,
  headers: {
    'Authorization': `Bearer ${MS_TOKEN}`,
    'Accept-Encoding': 'gzip',
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

async function testStockAPI() {
  console.log('🧪 Тестирование МойСклад API для получения остатков\n');
  
  // Берём UUID из маппинга
  const testProductId = '235a72fd-6000-11f0-0a80-1b1f0067f813'; // BARDAHL_XTC_10W-40_DBSA
  
  console.log(`📦 Тестовый товар UUID: ${testProductId}\n`);
  
  // Тест 1: Фильтр с UUID
  console.log('═══════════════════════════════════════════════════════════');
  console.log('ТЕСТ 1: filter=product=${productId}');
  console.log('═══════════════════════════════════════════════════════════');
  try {
    const response = await client.get('/report/stock/bystore', {
      params: {
        filter: `product=${testProductId}`
      }
    });
    console.log('✅ УСПЕХ!');
    console.log(`Получено записей: ${response.data.rows.length}`);
    if (response.data.rows.length > 0) {
      const row = response.data.rows[0];
      console.log(`Остаток: ${row.stock}, Резерв: ${row.reserve}`);
    }
  } catch (error) {
    console.log('❌ ОШИБКА:', error.response?.data?.errors?.[0]?.error || error.message);
  }
  
  // Тест 2: Фильтр с полным URL
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('ТЕСТ 2: filter=product=https://api.moysklad.ru/.../product/${productId}');
  console.log('═══════════════════════════════════════════════════════════');
  try {
    const fullUrl = `https://api.moysklad.ru/api/remap/1.2/entity/product/${testProductId}`;
    const response = await client.get('/report/stock/bystore', {
      params: {
        filter: `product=${fullUrl}`
      }
    });
    console.log('✅ УСПЕХ!');
    console.log(`Получено записей: ${response.data.rows.length}`);
  } catch (error) {
    console.log('❌ ОШИБКА:', error.response?.data?.errors?.[0]?.error || error.message);
  }
  
  // Тест 3: Параметр productid
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('ТЕСТ 3: productid=${productId}');
  console.log('═══════════════════════════════════════════════════════════');
  try {
    const response = await client.get('/report/stock/bystore', {
      params: {
        productid: testProductId
      }
    });
    console.log('✅ УСПЕХ!');
    console.log(`Получено записей: ${response.data.rows.length}`);
  } catch (error) {
    console.log('❌ ОШИБКА:', error.response?.data?.errors?.[0]?.error || error.message);
  }
  
  // Тест 4: Получить товар и проверить его meta.href
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('ТЕСТ 4: Получить товар и использовать meta.href');
  console.log('═══════════════════════════════════════════════════════════');
  try {
    const productResponse = await client.get(`/entity/product/${testProductId}`);
    const product = productResponse.data;
    console.log(`Товар: ${product.name}`);
    console.log(`meta.href: ${product.meta.href}`);
    
    // Пробуем с meta.href
    const stockResponse = await client.get('/report/stock/bystore', {
      params: {
        filter: `product=${product.meta.href}`
      }
    });
    console.log('✅ УСПЕХ с meta.href!');
    console.log(`Получено записей: ${stockResponse.data.rows.length}`);
    if (stockResponse.data.rows.length > 0) {
      const row = stockResponse.data.rows[0];
      console.log(`Остаток: ${row.stock}, Резерв: ${row.reserve}`);
    }
  } catch (error) {
    console.log('❌ ОШИБКА:', error.response?.data?.errors?.[0]?.error || error.message);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('💡 ВЫВОД: Какой формат работает?');
  console.log('═══════════════════════════════════════════════════════════');
}

testStockAPI().catch(error => {
  console.error('❌ Критическая ошибка:', error.message);
  process.exit(1);
});
