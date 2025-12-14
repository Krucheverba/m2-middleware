#!/usr/bin/env node

/**
 * Скрипт проверки совпадений offerId между M1 и M2
 * 
 * Читает:
 * - data/m2&m1.csv - таблица с offerId M1 и M2
 * - data/product-mappings.json - текущий маппинг M2
 * 
 * Проверяет:
 * - Есть ли совпадения между offerId M1 и M2
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Проверка совпадений offerId между M1 и M2\n');

// Читаем CSV файл
const csvPath = path.join(__dirname, 'data', 'm2&m1.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// Парсим CSV
const lines = csvContent.trim().split('\n');
const header = lines[0]; // М2,М1

const m1OfferIds = new Set();
const m2OfferIds = new Set();
const mapping = [];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  
  const [m2OfferId, m1OfferId] = line.split(',');
  
  if (m2OfferId && m1OfferId) {
    m2OfferIds.add(m2OfferId.trim());
    m1OfferIds.add(m1OfferId.trim());
    mapping.push({
      m2: m2OfferId.trim(),
      m1: m1OfferId.trim()
    });
  }
}

console.log(`✅ Загружено из CSV:`);
console.log(`   - offerId M1: ${m1OfferIds.size}`);
console.log(`   - offerId M2: ${m2OfferIds.size}`);
console.log();

// Проверяем совпадения
const conflicts = [];

for (const m2OfferId of m2OfferIds) {
  if (m1OfferIds.has(m2OfferId)) {
    // Найдено совпадение!
    const pair = mapping.find(p => p.m2 === m2OfferId);
    conflicts.push({
      offerId: m2OfferId,
      m1OfferId: pair.m1
    });
  }
}

// Выводим результаты
console.log('═══════════════════════════════════════════════════════════');
console.log('                    РЕЗУЛЬТАТЫ ПРОВЕРКИ');
console.log('═══════════════════════════════════════════════════════════\n');

if (conflicts.length === 0) {
  console.log('✅ ОТЛИЧНО! Совпадений НЕ НАЙДЕНО!');
  console.log();
  console.log('Все offerId M2 отличаются от offerId M1.');
  console.log('Изоляция M1 и M2 гарантирована! 🔒');
  console.log();
  console.log('Система готова к запуску! 🚀');
} else {
  console.log('❌ ВНИМАНИЕ! НАЙДЕНЫ СОВПАДЕНИЯ!');
  console.log();
  console.log(`Количество конфликтов: ${conflicts.length}`);
  console.log();
  console.log('Список конфликтующих offerId:');
  console.log('─────────────────────────────────────────────────────────');
  
  conflicts.forEach((conflict, index) => {
    console.log(`${index + 1}. offerId: "${conflict.offerId}"`);
    console.log(`   Используется в M1: "${conflict.m1OfferId}"`);
    console.log(`   Используется в M2: "${conflict.offerId}"`);
    console.log();
  });
  
  console.log('─────────────────────────────────────────────────────────');
  console.log();
  console.log('⚠️  КРИТИЧНО! Эти offerId нужно изменить в M2!');
  console.log();
  console.log('Хотя Campaign ID разные, совпадающие offerId могут');
  console.log('вызвать путаницу при отладке и потенциальные проблемы.');
  console.log();
  console.log('Рекомендация: добавьте суффикс _DBSA к конфликтующим offerId в M2');
}

console.log();
console.log('═══════════════════════════════════════════════════════════');

// Дополнительная статистика
console.log();
console.log('📊 Статистика:');
console.log(`   - Всего товаров в CSV: ${mapping.length}`);
console.log(`   - Уникальных offerId M1: ${m1OfferIds.size}`);
console.log(`   - Уникальных offerId M2: ${m2OfferIds.size}`);
console.log(`   - Совпадений: ${conflicts.length}`);
console.log(`   - Процент совпадений: ${((conflicts.length / m2OfferIds.size) * 100).toFixed(2)}%`);
console.log();

// Проверяем маппинг
const mappingPath = path.join(__dirname, 'data', 'product-mappings.json');
if (fs.existsSync(mappingPath)) {
  const mappingData = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
  const mappingCount = Object.keys(mappingData.mappings || {}).length;
  
  console.log('📦 Текущий маппинг:');
  console.log(`   - Товаров в маппинге: ${mappingCount}`);
  console.log(`   - Товаров в CSV: ${mapping.length}`);
  
  if (mappingCount === mapping.length) {
    console.log('   ✅ Количество совпадает');
  } else {
    console.log(`   ⚠️  Разница: ${Math.abs(mappingCount - mapping.length)} товаров`);
  }
}

console.log();

// Возвращаем код выхода
process.exit(conflicts.length > 0 ? 1 : 0);
