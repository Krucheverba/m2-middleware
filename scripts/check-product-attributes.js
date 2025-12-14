#!/usr/bin/env node

/**
 * Скрипт для проверки атрибутов товаров в МойСклад
 */

require('dotenv').config();
const axios = require('axios');

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

async function main() {
  console.log('🔍 Проверка атрибутов товаров в МойСклад\n');
  
  // Получаем несколько товаров с атрибутами
  const response = await client.get('/entity/product', {
    params: {
      limit: 5,
      expand: 'attributes'
    }
  });
  
  const products = response.data.rows || [];
  
  console.log(`📦 Получено ${products.length} товаров\n`);
  
  for (const product of products) {
    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`📦 Товар: ${product.name}`);
    console.log(`   ID: ${product.id}`);
    console.log(`   Код: ${product.code || 'нет'}`);
    console.log(`   Артикул: ${product.article || 'нет'}`);
    
    if (product.attributes && product.attributes.length > 0) {
      console.log(`\n   📋 Атрибуты (${product.attributes.length}):`);
      product.attributes.forEach(attr => {
        console.log(`      - ${attr.name}: ${attr.value || 'пусто'}`);
      });
    } else {
      console.log(`\n   ⚠️  Атрибутов нет`);
    }
  }
  
  console.log(`\n\n💡 ВЫВОД:`);
  console.log(`Если у товаров нет атрибута "offerId", значит:`);
  console.log(`1. Либо атрибут называется по-другому`);
  console.log(`2. Либо нужно использовать другое поле (код/артикул)`);
  console.log(`3. Либо нужно создать маппинг вручную по названиям`);
}

main().catch(error => {
  console.error('❌ Ошибка:', error.message);
  process.exit(1);
});
