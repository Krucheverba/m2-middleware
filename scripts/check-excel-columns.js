#!/usr/bin/env node

/**
 * Скрипт для проверки колонок в Excel файле из МойСклад
 */

const XLSX = require('xlsx');
const path = require('path');

const EXCEL_PATH = path.join(__dirname, '../data/moysklad-export.xlsx');

console.log('📖 Чтение Excel файла...\n');

const workbook = XLSX.readFile(EXCEL_PATH);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet);

console.log(`✅ Прочитано ${data.length} строк\n`);

if (data.length > 0) {
  console.log('📋 Колонки в Excel файле:');
  console.log('─────────────────────────────────────');
  
  const columns = Object.keys(data[0]);
  columns.forEach((col, index) => {
    console.log(`${index + 1}. "${col}"`);
  });
  
  console.log('\n📝 Первая строка данных:');
  console.log('─────────────────────────────────────');
  console.log(JSON.stringify(data[0], null, 2));
  
  console.log('\n📝 Вторая строка данных:');
  console.log('─────────────────────────────────────');
  if (data[1]) {
    console.log(JSON.stringify(data[1], null, 2));
  }
} else {
  console.log('❌ Файл пустой!');
}
