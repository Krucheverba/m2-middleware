#!/usr/bin/env node

/**
 * Фильтрация маппинга - оставить только товары из CSV
 * 
 * Скрипт:
 * 1. Читает CSV файл data/m2&m1.csv
 * 2. Читает текущий mapping файл
 * 3. Извлекает товары, которых НЕТ в CSV (сохраняет в backup)
 * 4. Оставляет в mapping только товары из CSV
 */

const fs = require('fs').promises;
const path = require('path');
const MoySkladClient = require('../src/api/moySkladClient');

const CSV_FILE = path.join(__dirname, '../data/m2&m1.csv');
const MAPPING_FILE = path.join(__dirname, '../data/product-mappings.json');
const BACKUP_FILE = path.join(__dirname, '../data/product-mappings-backup.json');
const REMOVED_FILE = path.join(__dirname, '../data/product-mappings-removed.json');

async function parseCsv(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  
  // Пропускаем заголовок
  const dataLines = lines.slice(1);
  
  const articles = [];
  for (const line of dataLines) {
    const [offerId, article] = line.split(',');
    if (article) {
      articles.push(article.trim());
    }
  }
  
  return articles;
}

async function findProductsByArticles(client, articles) {
  console.log('🔍 Поиск товаров в МойСклад...');
  const products = await client.getProducts({ limit: 1000 });
  
  const productIds = new Set();
  const foundArticles = new Set();
  
  for (const article of articles) {
    const product = products.find(p => p.article === article);
    if (product) {
      productIds.add(product.id);
      foundArticles.add(article);
    }
  }
  
  console.log(`✅ Найдено ${productIds.size} товаров из ${articles.length} артикулов`);
  
  return { productIds, foundArticles };
}

async function main() {
  console.log('🚀 Фильтрация маппинга по CSV файлу\n');
  
  // 1. Читаем CSV
  console.log('📖 Чтение CSV файла...');
  const csvArticles = await parseCsv(CSV_FILE);
  console.log(`✅ Прочитано ${csvArticles.length} артикулов из CSV\n`);
  
  // 2. Загружаем текущий mapping
  console.log('📖 Загрузка текущего mapping файла...');
  const mappingData = JSON.parse(await fs.readFile(MAPPING_FILE, 'utf-8'));
  const originalCount = Object.keys(mappingData.mappings).length;
  console.log(`✅ Загружено ${originalCount} маппингов\n`);
  
  // 3. Создаем backup
  console.log('💾 Создание backup...');
  await fs.writeFile(BACKUP_FILE, JSON.stringify(mappingData, null, 2), 'utf-8');
  console.log(`✅ Backup сохранен: ${BACKUP_FILE}\n`);
  
  // 4. Находим product.id для всех артикулов из CSV
  const client = new MoySkladClient();
  const { productIds } = await findProductsByArticles(client, csvArticles);
  
  // 5. Фильтруем маппинг
  console.log('\n🔄 Фильтрация маппинга...');
  const filteredMappings = {};
  const removedMappings = {};
  
  for (const [productId, offerId] of Object.entries(mappingData.mappings)) {
    if (productIds.has(productId)) {
      filteredMappings[productId] = offerId;
    } else {
      removedMappings[productId] = offerId;
    }
  }
  
  // 6. Сохраняем удаленные маппинги
  const removedData = {
    version: "1.0",
    removedAt: new Date().toISOString(),
    note: "Маппинги, которые были удалены из основного файла (не в CSV)",
    mappings: removedMappings
  };
  await fs.writeFile(REMOVED_FILE, JSON.stringify(removedData, null, 2), 'utf-8');
  console.log(`✅ Удаленные маппинги сохранены: ${REMOVED_FILE}`);
  
  // 7. Сохраняем отфильтрованный mapping
  const newMappingData = {
    version: "1.0",
    lastUpdated: new Date().toISOString(),
    mappings: filteredMappings
  };
  await fs.writeFile(MAPPING_FILE, JSON.stringify(newMappingData, null, 2), 'utf-8');
  console.log(`✅ Отфильтрованный mapping сохранен: ${MAPPING_FILE}\n`);
  
  // 8. Статистика
  console.log('📊 Статистика:');
  console.log(`   📝 Артикулов в CSV: ${csvArticles.length}`);
  console.log(`   📦 Было маппингов: ${originalCount}`);
  console.log(`   ✅ Осталось маппингов: ${Object.keys(filteredMappings).length}`);
  console.log(`   🗑️  Удалено маппингов: ${Object.keys(removedMappings).length}`);
  console.log('');
  console.log('✅ Фильтрация завершена!');
  console.log('');
  console.log('📁 Файлы:');
  console.log(`   - Текущий mapping: ${MAPPING_FILE}`);
  console.log(`   - Backup: ${BACKUP_FILE}`);
  console.log(`   - Удаленные: ${REMOVED_FILE}`);
}

// Запуск
main().catch(error => {
  console.error('\n❌ Критическая ошибка:', error);
  process.exit(1);
});
