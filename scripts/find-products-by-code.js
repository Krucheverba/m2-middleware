#!/usr/bin/env node

/**
 * Скрипт для поиска товаров по коду/артикулу
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

async function findProductByCode(code) {
  try {
    const response = await client.get('/entity/product', {
      params: {
        filter: `code=${code}`,
        limit: 1
      }
    });
    
    const products = response.data.rows || [];
    return products.length > 0 ? products[0] : null;
  } catch (error) {
    return null;
  }
}

async function findProductByArticle(article) {
  try {
    const response = await client.get('/entity/product', {
      params: {
        filter: `article=${article}`,
        limit: 1
      }
    });
    
    const products = response.data.rows || [];
    return products.length > 0 ? products[0] : null;
  } catch (error) {
    return null;
  }
}

async function main() {
  console.log('🔍 Поиск товаров по коротким ID из маппинга...\n');
  
  // Читаем маппинг
  const mappingPath = 'data/product-mappings.json';
  const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
  
  const shortIds = Object.keys(mapping.mappings).slice(0, 3);
  
  for (const shortId of shortIds) {
    const offerId = mapping.mappings[shortId];
    console.log(`\n📦 Ищем товар для: ${shortId} → ${offerId}`);
    
    // Пробуем найти по коду
    let product = await findProductByCode(shortId);
    if (product) {
      console.log(`  ✅ Найден по коду!`);
      console.log(`     UUID: ${product.id}`);
      console.log(`     Название: ${product.name}`);
      console.log(`     Код: ${product.code}`);
      continue;
    }
    
    // Пробуем найти по артикулу
    product = await findProductByArticle(shortId);
    if (product) {
      console.log(`  ✅ Найден по артикулу!`);
      console.log(`     UUID: ${product.id}`);
      console.log(`     Название: ${product.name}`);
      console.log(`     Артикул: ${product.article}`);
      continue;
    }
    
    console.log(`  ❌ Товар НЕ найден ни по коду, ни по артикулу`);
  }
  
  console.log('\n\n💡 ВЫВОД:');
  console.log('Если товары найдены - короткие ID это коды/артикулы из МойСклад');
  console.log('Нужно создать скрипт для конвертации: код → UUID');
}

main().catch(error => {
  console.error('❌ Ошибка:', error.message);
  process.exit(1);
});
