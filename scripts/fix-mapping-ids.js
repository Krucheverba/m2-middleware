#!/usr/bin/env node

/**
 * Скрипт для исправления маппинга: замена коротких ID на правильные UUID
 * Ищет товары по offerId M2 (по названию/артикулу)
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const MS_BASE = process.env.MS_BASE || 'https://api.moysklad.ru/api/remap/1.2';
const MS_TOKEN = process.env.MS_TOKEN;

if (!MS_TOKEN) {
  console.error('❌ MS_TOKEN не найден в .env');
  process.exit(1);
}

const client = axios.create({
  baseURL: MS_BASE,
  headers: {
    'Authorization': `Bearer ${MS_TOKEN}`,
    'Accept-Encoding': 'gzip',
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

async function getAllProducts() {
  try {
    console.log('📦 Получение всех товаров из МойСклад...');
    const response = await client.get('/entity/product', {
      params: {
        limit: 1000
      }
    });
    
    const products = response.data.rows || [];
    console.log(`✅ Получено ${products.length} товаров\n`);
    return products;
  } catch (error) {
    console.error('❌ Ошибка при получении товаров:', error.message);
    return [];
  }
}

function findProductByOfferId(products, offerId) {
  // Убираем суффикс _DBSA для поиска
  const searchTerm = offerId.replace('_DBSA', '').replace(/_/g, ' ').toLowerCase();
  
  // Ищем товар, в названии которого есть похожая строка
  for (const product of products) {
    const productName = product.name.toLowerCase();
    const productCode = (product.code || '').toLowerCase();
    const productArticle = (product.article || '').toLowerCase();
    
    // Проверяем разные варианты совпадения
    if (productName.includes(searchTerm) || 
        productCode.includes(searchTerm) ||
        productArticle.includes(searchTerm)) {
      return product;
    }
  }
  
  return null;
}

async function main() {
  console.log('🔧 Исправление маппинга: замена коротких ID на UUID\n');
  
  // Получаем все товары
  const allProducts = await getAllProducts();
  
  if (allProducts.length === 0) {
    console.error('❌ Не удалось получить товары из МойСклад');
    process.exit(1);
  }
  
  // Читаем текущий маппинг
  const mappingPath = 'data/product-mappings.json';
  const oldMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
  
  console.log(`📋 Текущий маппинг: ${Object.keys(oldMapping.mappings).length} товаров\n`);
  
  // Создаём новый маппинг
  const newMappings = {};
  let found = 0;
  let notFound = 0;
  
  console.log('🔍 Поиск товаров...\n');
  
  for (const [shortId, offerId] of Object.entries(oldMapping.mappings)) {
    const product = findProductByOfferId(allProducts, offerId);
    
    if (product) {
      newMappings[product.id] = offerId;
      found++;
      console.log(`✅ ${offerId}`);
      console.log(`   ${shortId} → ${product.id}`);
      console.log(`   ${product.name}\n`);
    } else {
      notFound++;
      console.log(`❌ ${offerId} - товар НЕ найден\n`);
    }
  }
  
  console.log(`\n📊 РЕЗУЛЬТАТ:`);
  console.log(`   Найдено: ${found}`);
  console.log(`   Не найдено: ${notFound}`);
  console.log(`   Всего: ${Object.keys(oldMapping.mappings).length}`);
  
  if (found > 0) {
    // Сохраняем новый маппинг
    const newMapping = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      mappings: newMappings
    };
    
    const newMappingPath = 'data/product-mappings-fixed.json';
    fs.writeFileSync(newMappingPath, JSON.stringify(newMapping, null, 2));
    console.log(`\n✅ Новый маппинг сохранён: ${newMappingPath}`);
    console.log(`\n💡 Проверьте файл и замените старый маппинг:`);
    console.log(`   mv data/product-mappings-fixed.json data/product-mappings.json`);
  }
}

main().catch(error => {
  console.error('❌ Ошибка:', error.message);
  process.exit(1);
});
