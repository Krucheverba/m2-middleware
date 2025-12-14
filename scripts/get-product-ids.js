#!/usr/bin/env node

/**
 * Скрипт для получения product.id из МойСклад по названию товара
 * Использует API МойСклад для поиска товаров
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

async function getProductByName(productName) {
  try {
    const response = await client.get('/entity/product', {
      params: {
        filter: `name=${productName}`,
        limit: 1
      }
    });
    
    const products = response.data.rows || [];
    if (products.length === 0) {
      return null;
    }
    
    return products[0];
  } catch (error) {
    console.error(`Ошибка при поиске товара "${productName}":`, error.message);
    return null;
  }
}

async function getAllProducts() {
  try {
    console.log('📦 Получение всех товаров из МойСклад...');
    const response = await client.get('/entity/product', {
      params: {
        limit: 1000
      }
    });
    
    const products = response.data.rows || [];
    console.log(`✅ Получено ${products.length} товаров`);
    return products;
  } catch (error) {
    console.error('❌ Ошибка при получении товаров:', error.message);
    return [];
  }
}

async function main() {
  console.log('🔍 Получение product.id для товаров из маппинга...\n');
  
  // Получаем все товары
  const allProducts = await getAllProducts();
  
  if (allProducts.length === 0) {
    console.error('❌ Не удалось получить товары из МойСклад');
    process.exit(1);
  }
  
  // Читаем текущий маппинг
  const mappingPath = 'data/product-mappings.json';
  const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
  
  console.log(`\n📋 Текущий маппинг содержит ${Object.keys(mapping.mappings).length} товаров`);
  console.log('\n🔍 Примеры текущих ID (короткие):');
  const currentIds = Object.keys(mapping.mappings).slice(0, 5);
  currentIds.forEach(id => {
    console.log(`  ${id} → ${mapping.mappings[id]}`);
  });
  
  console.log('\n📦 Примеры правильных UUID из МойСклад:');
  allProducts.slice(0, 5).forEach(product => {
    console.log(`  ${product.id} → ${product.name}`);
  });
  
  console.log('\n⚠️  ПРОБЛЕМА: В маппинге используются короткие ID, а нужны полные UUID!');
  console.log('\n💡 Решение: Нужно пересоздать маппинг с правильными UUID из МойСклад');
  console.log('\nДля этого нужен CSV файл с названиями товаров или их артикулами.');
}

main().catch(error => {
  console.error('❌ Ошибка:', error.message);
  process.exit(1);
});
