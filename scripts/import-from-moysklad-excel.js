#!/usr/bin/env node

/**
 * Скрипт для импорта маппингов из Excel экспорта МойСклад
 * 
 * Этот скрипт:
 * 1. Читает Excel файл экспорта из МойСклад (article → product.id)
 * 2. Читает существующий CSV файл (offerId → article)
 * 3. Создаёт финальный маппинг (product.id → offerId)
 * 4. Сохраняет в data/product-mappings.json
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Пути к файлам
const EXCEL_PATH = path.join(__dirname, '../data/moysklad-export.xlsx');
const CSV_PATH = path.join(__dirname, '../data/m2&m1.csv');
const OUTPUT_PATH = path.join(__dirname, '../data/product-mappings.json');

console.log('🚀 Запуск импорта маппингов из МойСклад Excel...\n');

// Шаг 1: Читаем Excel файл из МойСклад
console.log('📖 Шаг 1: Чтение Excel файла из МойСклад...');
if (!fs.existsSync(EXCEL_PATH)) {
  console.error(`❌ Ошибка: Файл ${EXCEL_PATH} не найден!`);
  console.error('   Скачайте Excel экспорт из МойСклад и положите его в data/moysklad-export.xlsx');
  process.exit(1);
}

const workbook = XLSX.readFile(EXCEL_PATH);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const excelData = XLSX.utils.sheet_to_json(worksheet);

console.log(`✅ Прочитано ${excelData.length} строк из Excel`);

// Создаём маппинг: article → product.id
const articleToProductId = {};
let skippedRows = 0;

excelData.forEach((row, index) => {
  // В Excel экспорте МойСклад есть колонки:
  // - "Артикул" - это article
  // - "Внешний код" - это product.id (UUID из МойСклад)
  
  const article = row['Артикул'];
  const productId = row['Внешний код'];
  
  if (article && productId) {
    articleToProductId[article] = productId;
  } else {
    skippedRows++;
    if (index < 5) { // Показываем первые 5 пропущенных строк для отладки
      console.log(`⚠️  Пропущена строка ${index + 1}: article="${article}", productId="${productId}"`);
    }
  }
});

console.log(`✅ Создан маппинг для ${Object.keys(articleToProductId).length} артикулов`);
if (skippedRows > 0) {
  console.log(`⚠️  Пропущено ${skippedRows} строк без артикула или ID`);
}

// Шаг 2: Читаем CSV файл (offerId → article)
console.log('\n📖 Шаг 2: Чтение CSV файла с маппингом offerId → article...');
if (!fs.existsSync(CSV_PATH)) {
  console.error(`❌ Ошибка: Файл ${CSV_PATH} не найден!`);
  process.exit(1);
}

const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
const csvLines = csvContent.split('\n').filter(line => line.trim());

// Пропускаем заголовок
const dataLines = csvLines.slice(1);

const offerIdToArticle = {};
dataLines.forEach(line => {
  const [offerId, article] = line.split(',').map(s => s.trim());
  if (offerId && article) {
    offerIdToArticle[offerId] = article;
  }
});

console.log(`✅ Прочитано ${Object.keys(offerIdToArticle).length} маппингов из CSV`);

// Шаг 3: Создаём финальный маппинг (product.id → offerId)
console.log('\n🔄 Шаг 3: Создание финального маппинга product.id → offerId...');

const finalMapping = {};
let successCount = 0;
let notFoundInExcel = [];

for (const [offerId, article] of Object.entries(offerIdToArticle)) {
  const productId = articleToProductId[article];
  
  if (productId) {
    finalMapping[productId] = offerId;
    successCount++;
  } else {
    notFoundInExcel.push({ offerId, article });
  }
}

console.log(`✅ Создано ${successCount} финальных маппингов`);

if (notFoundInExcel.length > 0) {
  console.log(`\n⚠️  Внимание: ${notFoundInExcel.length} артикулов из CSV не найдены в Excel:`);
  notFoundInExcel.forEach(({ offerId, article }) => {
    console.log(`   - offerId: ${offerId}, article: ${article}`);
  });
  console.log('\n   Возможные причины:');
  console.log('   1. Артикул написан по-разному в CSV и МойСклад');
  console.log('   2. Товар был удалён из МойСклад');
  console.log('   3. Опечатка в артикуле');
}

// Шаг 4: Сохраняем результат
console.log('\n💾 Шаг 4: Сохранение результата...');

// Создаём резервную копию старого файла, если он существует
if (fs.existsSync(OUTPUT_PATH)) {
  const backupPath = OUTPUT_PATH.replace('.json', `.backup.${Date.now()}.json`);
  fs.copyFileSync(OUTPUT_PATH, backupPath);
  console.log(`✅ Создана резервная копия: ${path.basename(backupPath)}`);
}

// Сохраняем новый маппинг
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalMapping, null, 2), 'utf-8');
console.log(`✅ Маппинг сохранён в ${OUTPUT_PATH}`);

// Итоговая статистика
console.log('\n📊 Итоговая статистика:');
console.log(`   Товаров в Excel: ${Object.keys(articleToProductId).length}`);
console.log(`   Маппингов в CSV: ${Object.keys(offerIdToArticle).length}`);
console.log(`   Финальных маппингов: ${successCount}`);
console.log(`   Не найдено в Excel: ${notFoundInExcel.length}`);

console.log('\n✅ Импорт завершён!');
console.log('\n📝 Следующие шаги:');
console.log('   1. Проверьте файл data/product-mappings.json');
console.log('   2. Загрузите его на сервер:');
console.log('      scp data/product-mappings.json root@89.223.125.212:/root/m2-middleware/data/');
console.log('   3. Перезапустите PM2 на сервере:');
console.log('      pm2 restart m2-middleware');
