require('dotenv').config();
const axios = require('axios');

const MS_TOKEN = process.env.MS_TOKEN;
const MS_BASE = process.env.MS_BASE;

async function testMoySklad() {
  try {
    console.log('🔍 Тестируем подключение к МойСклад (без атрибутов)...\n');
    
    // 1. Получаем список товаров (без expand=attributes)
    console.log('1️⃣ Получаем список товаров...');
    const productsResponse = await axios.get(`${MS_BASE}/entity/product`, {
      headers: {
        'Authorization': `Bearer ${MS_TOKEN}`,
        'Accept-Encoding': 'gzip'
      },
      params: {
        limit: 10
      }
    });
    
    const products = productsResponse.data.rows || [];
    console.log(`✅ Получено ${products.length} товаров\n`);
    
    if (products.length === 0) {
      console.log('❌ Товары не найдены');
      return;
    }
    
    // 2. Берем первый товар для тестирования
    const testProduct = products[0];
    console.log('2️⃣ Тестовый товар:');
    console.log(`   ID: ${testProduct.id}`);
    console.log(`   Название: ${testProduct.name}`);
    console.log(`   Артикул (code): ${testProduct.code || 'не указан'}`);
    console.log(`   Внешний код (externalCode): ${testProduct.externalCode || 'не указан'}`);
    
    // 3. Получаем товар по ID
    console.log('\n3️⃣ Получаем товар по ID...');
    const productResponse = await axios.get(`${MS_BASE}/entity/product/${testProduct.id}`, {
      headers: {
        'Authorization': `Bearer ${MS_TOKEN}`,
        'Accept-Encoding': 'gzip'
      }
    });
    
    const product = productResponse.data;
    console.log('✅ Товар получен по ID:');
    console.log(`   ID: ${product.id}`);
    console.log(`   Название: ${product.name}`);
    console.log(`   Артикул: ${product.code || 'не указан'}`);
    
    // 4. Получаем остатки товара по product.id
    console.log('\n4️⃣ Получаем остатки товара по product.id...');
    const stockResponse = await axios.get(`${MS_BASE}/report/stock/bystore`, {
      headers: {
        'Authorization': `Bearer ${MS_TOKEN}`,
        'Accept-Encoding': 'gzip'
      },
      params: {
        'filter': `product=${MS_BASE}/entity/product/${testProduct.id}`
      }
    });
    
    if (stockResponse.data.rows && stockResponse.data.rows.length > 0) {
      console.log('✅ Остатки получены:');
      
      let totalStock = 0;
      let totalReserve = 0;
      
      stockResponse.data.rows.forEach(item => {
        totalStock += item.stock || 0;
        totalReserve += item.reserve || 0;
      });
      
      const availableStock = totalStock - totalReserve;
      
      console.log(`   📦 Всего: ${totalStock} шт.`);
      console.log(`   🔒 Резерв: ${totalReserve} шт.`);
      console.log(`   ✅ Доступно: ${availableStock} шт.`);
    } else {
      console.log('ℹ️  Остатки не найдены');
    }
    
    console.log('\n✅ Все тесты пройдены успешно!');
    
  } catch (error) {
    console.error('❌ Ошибка:', error.response?.data || error.message);
    if (error.response) {
      console.error('Статус:', error.response.status);
      console.error('Заголовки:', error.response.headers);
    }
  }
}

testMoySklad();
