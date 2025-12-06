#!/usr/bin/env node

/**
 * Импорт маппинга М2 из CSV файла
 * 
 * ВАЖНО: Терминология
 * - offerId - ЕДИНСТВЕННЫЙ формат для обмена данными с Яндекс
 * - М1 использует встроенную интеграцию МойСклад (читает product.offerId)
 * - М2 использует middleware с файловым маппингом (product.id → offerId)
 * 
 * CSV формат:
 * М2,М1
 * offerId_для_М2,article_МойСклад
 * 
 * Скрипт:
 * 1. Читает CSV файл data/m2&m1.csv
 * 2. Для каждой строки находит товар в МойСклад по артикулу (колонка М1)
 * 3. Создает маппинг для М2: product.id → offerId (колонка М2)
 * 4. Обновляет data/product-mappings.json
 * 
 * Этот маппинг используется ТОЛЬКО для М2!
 * М1 продолжает работать через встроенную интеграцию МойСклад.
 */

const fs = require('fs').promises;
const path = require('path');
const MoySkladClient = require('../src/api/moySkladClient');

const CSV_FILE = path.join(__dirname, '../data/m2&m1.csv');
const MAPPING_FILE = path.join(__dirname, '../data/product-mappings.json');

async function parseCsv(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  
  // Пропускаем заголовок
  const dataLines = lines.slice(1);
  
  const rows = [];
  for (const line of dataLines) {
    const [offerId, article] = line.split(',');
    if (offerId && article) {
      rows.push({
        offerId: offerId.trim(),
        article: article.trim()
      });
    }
  }
  
  return rows;
}

async function findProductByArticle(client, article) {
  try {
    // Получаем все товары и ищем по артикулу
    const products = await client.getProducts({ limit: 1000 });
    
    // Ищем товар с нужным артикулом
    const product = products.find(p => p.article === article);
    
    if (!product) {
      console.warn(`⚠️  Товар не найден: ${article}`);
      return null;
    }
    
    return product;
  } catch (error) {
    console.error(`❌ Ошибка при поиске товара ${article}:`, error.message);
    return null;
  }
}

async function loadExistingMapping() {
  try {
    const content = await fs.readFile(MAPPING_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('❌ Ошибка при чтении mapping файла:', error.message);
    throw error;
  }
}

async function saveMappingFile(mappingData) {
  try {
    const content = JSON.stringify(mappingData, null, 2);
    await fs.writeFile(MAPPING_FILE, content, 'utf-8');
    console.log('✅ Mapping файл сохранен');
  } catch (error) {
    console.error('❌ Ошибка при сохранении mapping файла:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Импорт маппинга М2 из CSV файла\n');
  
  // 1. Читаем CSV
  console.log('📖 Чтение CSV файла...');
  const csvRows = await parseCsv(CSV_FILE);
  console.log(`✅ Прочитано ${csvRows.length} строк из CSV\n`);
  
  // 2. Загружаем существующий mapping
  console.log('📖 Загрузка существующего mapping файла...');
  const mappingData = await loadExistingMapping();
  console.log(`✅ Загружено ${Object.keys(mappingData.mappings).length} существующих маппингов\n`);
  
  // 3. Инициализируем клиент МойСклад
  const client = new MoySkladClient();
  
  // 4. Обрабатываем каждую строку CSV
  console.log('🔄 Обработка маппингов...\n');
  
  let successCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < csvRows.length; i++) {
    const row = csvRows[i];
    const { offerId, article } = row;
    
    console.log(`[${i + 1}/${csvRows.length}] Обработка: ${article} → ${offerId}`);
    
    try {
      // Ищем товар по артикулу в МойСклад
      const product = await findProductByArticle(client, article);
      
      if (!product) {
        notFoundCount++;
        continue;
      }
      
      // Создаем маппинг для М2: product.id → offerId
      mappingData.mappings[product.id] = offerId;
      successCount++;
      
      console.log(`   ✅ Маппинг создан: ${product.id} → ${offerId}`);
      console.log(`      (Товар: ${product.name})`);
      
      // Небольшая задержка чтобы не перегружать API
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      errorCount++;
      console.error(`   ❌ Ошибка: ${error.message}`);
    }
  }
  
  // 5. Обновляем метаданные
  mappingData.lastUpdated = new Date().toISOString();
  
  // 6. Сохраняем обновленный mapping
  console.log('\n💾 Сохранение обновленного mapping файла...');
  await saveMappingFile(mappingData);
  
  // 7. Выводим статистику
  console.log('\n📊 Статистика импорта:');
  console.log(`   ✅ Успешно создано маппингов: ${successCount}`);
  console.log(`   ⚠️  Товаров не найдено в МойСклад: ${notFoundCount}`);
  console.log(`   ❌ Ошибки: ${errorCount}`);
  console.log(`   📝 Всего строк в CSV: ${csvRows.length}`);
  console.log(`   📦 Всего маппингов в файле: ${Object.keys(mappingData.mappings).length}`);
  
  console.log('\n✅ Импорт маппинга М2 завершен!');
  console.log('\n⚠️  ВАЖНО: Этот маппинг используется ТОЛЬКО для М2!');
  console.log('   М1 продолжает работать через встроенную интеграцию МойСклад.');
  console.log('   offerId - единственный формат для обмена данными с Яндекс.');
}

// Запуск
main().catch(error => {
  console.error('\n❌ Критическая ошибка:', error);
  process.exit(1);
});
