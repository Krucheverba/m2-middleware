#!/usr/bin/env node

/**
 * Скрипт для экспорта товаров из МойСклад в файл маппинга
 * 
 * Создаёт шаблон маппинга product.id → offerId
 * Вам нужно будет вручную заполнить offerId для каждого товара
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const MS_TOKEN = process.env.MS_TOKEN;
const MS_BASE = process.env.MS_BASE || 'https://api.moysklad.ru/api/remap/1.2';

async function exportProducts() {
  console.log('🔄 Экспорт товаров из МойСклад...\n');

  try {
    // Создаём клиент для МойСклад
    const client = axios.create({
      baseURL: MS_BASE,
      headers: {
        'Authorization': `Bearer ${MS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Получаем все товары
    console.log('📦 Получаем список товаров...');
    let allProducts = [];
    let offset = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const response = await client.get('/entity/product', {
        params: {
          limit,
          offset
        }
      });

      const products = response.data.rows || [];
      allProducts = allProducts.concat(products);

      console.log(`   Получено: ${allProducts.length} товаров`);

      if (products.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    console.log(`\n✅ Всего получено: ${allProducts.length} товаров\n`);

    // Создаём маппинг
    const mappings = {};
    const productsList = [];

    for (const product of allProducts) {
      const productId = product.id;
      const name = product.name || 'Без названия';
      const code = product.code || '';
      const article = product.article || '';
      
      // Генерируем предполагаемый offerId на основе артикула или кода
      // Пользователь должен будет проверить и исправить
      let suggestedOfferId = '';
      if (article) {
        suggestedOfferId = `${article}_DBSA`;
      } else if (code) {
        suggestedOfferId = `${code}_DBSA`;
      } else {
        suggestedOfferId = 'НУЖНО_ЗАПОЛНИТЬ_DBSA';
      }

      mappings[productId] = suggestedOfferId;

      productsList.push({
        productId,
        name,
        code,
        article,
        suggestedOfferId
      });
    }

    // Создаём файл маппинга
    const mappingData = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      mappings
    };

    const mappingFilePath = path.join(process.cwd(), 'data', 'product-mappings.json');
    await fs.writeFile(
      mappingFilePath,
      JSON.stringify(mappingData, null, 2),
      'utf8'
    );

    console.log(`✅ Файл маппинга создан: ${mappingFilePath}\n`);

    // Создаём CSV файл для удобного редактирования
    const csvLines = ['product.id,Название,Артикул,Код,Предложенный offerId'];
    
    for (const product of productsList) {
      const line = [
        product.productId,
        `"${product.name.replace(/"/g, '""')}"`,
        product.article,
        product.code,
        product.suggestedOfferId
      ].join(',');
      csvLines.push(line);
    }

    const csvFilePath = path.join(process.cwd(), 'data', 'products-export.csv');
    await fs.writeFile(csvFilePath, csvLines.join('\n'), 'utf8');

    console.log(`✅ CSV файл создан: ${csvFilePath}\n`);

    // Выводим статистику
    console.log('📊 Статистика:');
    console.log(`   Всего товаров: ${allProducts.length}`);
    console.log(`   С артикулом: ${productsList.filter(p => p.article).length}`);
    console.log(`   С кодом: ${productsList.filter(p => p.code).length}`);
    console.log(`   Без артикула и кода: ${productsList.filter(p => !p.article && !p.code).length}`);

    console.log('\n⚠️  ВАЖНО:');
    console.log('   1. Откройте data/products-export.csv');
    console.log('   2. Проверьте и исправьте offerId для каждого товара');
    console.log('   3. offerId должен соответствовать товару в Яндекс.Маркет M2');
    console.log('   4. Для M2 используйте суффикс _DBSA');
    console.log('   5. После проверки обновите data/product-mappings.json\n');

    // Показываем первые 10 товаров
    console.log('📋 Первые 10 товаров:');
    console.log('─'.repeat(100));
    productsList.slice(0, 10).forEach((p, i) => {
      console.log(`${i + 1}. ${p.name}`);
      console.log(`   product.id: ${p.productId}`);
      console.log(`   Артикул: ${p.article || '(нет)'}`);
      console.log(`   Код: ${p.code || '(нет)'}`);
      console.log(`   Предложенный offerId: ${p.suggestedOfferId}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Ошибка при экспорте:', error.message);
    if (error.response) {
      console.error('   Статус:', error.response.status);
      console.error('   Данные:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Запуск
exportProducts().catch(error => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
