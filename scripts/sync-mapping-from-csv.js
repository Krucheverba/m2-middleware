#!/usr/bin/env node

/**
 * Скрипт для синхронизации маппинга на основе CSV файла m2&m1.csv
 * Находит товары в МойСклад по product.offerId из колонки М1
 * Создаёт маппинг: product.id → offerId M2
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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

// Читаем CSV файл
function readCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  
  // Пропускаем заголовок
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const [m2OfferId, m1OfferId] = lines[i].split(',');
    if (m2OfferId && m1OfferId) {
      data.push({
        m2OfferId: m2OfferId.trim(),
        m1OfferId: m1OfferId.trim()
      });
    }
  }
  
  return data;
}

// Получаем все товары
async function getAllProductsWithOfferId() {
  try {
    console.log('📦 Получение товаров из МойСклад...');
    
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

// Находим товар по offerId M1 (используем поле code)
function findProductByM1OfferId(products, m1OfferId) {
  for (const product of products) {
    // Проверяем поле code
    if (product.code && product.code === m1OfferId) {
      return product;
    }
    
    // Проверяем поле article как запасной вариант
    if (product.article && product.article === m1OfferId) {
      return product;
    }
  }
  
  return null;
}

async function main() {
  console.log('🔄 Синхронизация маппинга из CSV файла\n');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Читаем CSV
  const csvPath = 'data/m2&m1.csv';
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Файл ${csvPath} не найден`);
    process.exit(1);
  }
  
  const csvData = readCSV(csvPath);
  console.log(`📋 Прочитано ${csvData.length} записей из CSV\n`);
  
  // Получаем все товары
  const allProducts = await getAllProductsWithOfferId();
  
  if (allProducts.length === 0) {
    console.error('❌ Не удалось получить товары из МойСклад');
    process.exit(1);
  }
  
  // Создаём маппинг
  const newMappings = {};
  let found = 0;
  let notFound = 0;
  const notFoundList = [];
  
  console.log('🔍 Поиск товаров по offerId M1...\n');
  
  for (const row of csvData) {
    const product = findProductByM1OfferId(allProducts, row.m1OfferId);
    
    if (product) {
      newMappings[product.id] = row.m2OfferId;
      found++;
      console.log(`✅ ${row.m2OfferId}`);
      console.log(`   M1 offerId: ${row.m1OfferId}`);
      console.log(`   UUID: ${product.id}`);
      console.log(`   Название: ${product.name}\n`);
    } else {
      notFound++;
      notFoundList.push(row);
      console.log(`❌ ${row.m2OfferId}`);
      console.log(`   M1 offerId: ${row.m1OfferId} - товар НЕ найден\n`);
    }
  }
  
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`📊 РЕЗУЛЬТАТ:`);
  console.log(`   ✅ Найдено: ${found}`);
  console.log(`   ❌ Не найдено: ${notFound}`);
  console.log(`   📋 Всего в CSV: ${csvData.length}`);
  console.log(`   📈 Процент успеха: ${((found / csvData.length) * 100).toFixed(1)}%\n`);
  
  if (notFoundList.length > 0) {
    console.log('⚠️  НЕ НАЙДЕННЫЕ ТОВАРЫ:');
    notFoundList.forEach(row => {
      console.log(`   - M1: ${row.m1OfferId} → M2: ${row.m2OfferId}`);
    });
    console.log('');
  }
  
  if (found > 0) {
    // Сохраняем новый маппинг
    const newMapping = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      mappings: newMappings
    };
    
    // Создаём резервную копию старого маппинга
    const oldMappingPath = 'data/product-mappings.json';
    if (fs.existsSync(oldMappingPath)) {
      const backupPath = `data/product-mappings.backup.${Date.now()}.json`;
      fs.copyFileSync(oldMappingPath, backupPath);
      console.log(`💾 Резервная копия старого маппинга: ${backupPath}`);
    }
    
    // Сохраняем новый маппинг
    fs.writeFileSync(oldMappingPath, JSON.stringify(newMapping, null, 2));
    console.log(`✅ Новый маппинг сохранён: ${oldMappingPath}`);
    console.log(`\n🎉 Маппинг успешно синхронизирован!`);
    console.log(`\n📤 Теперь нужно загрузить новый маппинг на сервер:`);
    console.log(`   scp data/product-mappings.json root@89.223.125.212:/root/m2-middleware/data/`);
    console.log(`   ssh root@89.223.125.212 "cd /root/m2-middleware && pm2 restart m2-middleware"`);
  } else {
    console.log('❌ Ни один товар не найден. Маппинг НЕ обновлён.');
  }
}

main().catch(error => {
  console.error('❌ Ошибка:', error.message);
  console.error(error.stack);
  process.exit(1);
});
