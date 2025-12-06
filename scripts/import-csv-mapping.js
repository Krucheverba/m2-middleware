#!/usr/bin/env node

/**
 * Скрипт для импорта маппинга из CSV файла
 * 
 * CSV должен содержать колонки:
 * product.id, Название, Артикул, Код, offerId_M2
 * 
 * Где offerId_M2 - это артикул товара в Яндекс.Маркет M2
 */

const fs = require('fs').promises;
const path = require('path');

async function importCSV() {
  console.log('🔄 Импорт маппинга из CSV...\n');

  try {
    const csvPath = path.join(process.cwd(), 'data', 'products-export.csv');
    const mappingPath = path.join(process.cwd(), 'data', 'product-mappings.json');

    // Читаем CSV
    console.log('📖 Читаем CSV файл...');
    const csvContent = await fs.readFile(csvPath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      throw new Error('CSV файл пустой или содержит только заголовок');
    }

    // Парсим CSV (учитываем кавычки)
    const mappings = {};
    let skipped = 0;
    let imported = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Простой парсинг CSV с учётом кавычек
      const match = line.match(/^([^,]+),"([^"]*)",([^,]*),([^,]*),(.*)$/);
      
      if (!match) {
        console.warn(`⚠️  Строка ${i + 1}: не удалось распарсить`);
        skipped++;
        continue;
      }

      const productId = match[1].trim();
      const offerIdM2 = match[5].trim();

      // Пропускаем если offerId пустой или содержит placeholder
      if (!offerIdM2 || 
          offerIdM2 === 'НУЖНО_ЗАПОЛНИТЬ' || 
          offerIdM2 === 'НУЖНО_ЗАПОЛНИТЬ_DBSA' ||
          offerIdM2 === 'Предложенный offerId') {
        skipped++;
        continue;
      }

      mappings[productId] = offerIdM2;
      imported++;
    }

    console.log(`\n📊 Статистика парсинга:`);
    console.log(`   Всего строк: ${lines.length - 1}`);
    console.log(`   Импортировано: ${imported}`);
    console.log(`   Пропущено: ${skipped}\n`);

    if (imported === 0) {
      throw new Error('Не найдено ни одного валидного маппинга в CSV');
    }

    // Создаём резервную копию текущего маппинга
    try {
      const currentMapping = await fs.readFile(mappingPath, 'utf8');
      const backupPath = path.join(
        process.cwd(),
        'data',
        `product-mappings.backup.${new Date().toISOString().replace(/:/g, '-').split('.')[0]}.json`
      );
      await fs.writeFile(backupPath, currentMapping, 'utf8');
      console.log(`✅ Резервная копия создана: ${backupPath}\n`);
    } catch (err) {
      console.log('ℹ️  Текущий маппинг не найден, резервная копия не создана\n');
    }

    // Создаём новый файл маппинга
    const mappingData = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      mappings
    };

    await fs.writeFile(
      mappingPath,
      JSON.stringify(mappingData, null, 2),
      'utf8'
    );

    console.log(`✅ Маппинг обновлён: ${mappingPath}`);
    console.log(`\n📊 Итоговая статистика:`);
    console.log(`   Товаров в маппинге: ${Object.keys(mappings).length}\n`);

    // Показываем примеры
    console.log('📋 Примеры маппингов:');
    console.log('─'.repeat(100));
    const entries = Object.entries(mappings).slice(0, 10);
    for (const [productId, offerId] of entries) {
      console.log(`product.id: ${productId}`);
      console.log(`offerId M2: ${offerId}\n`);
    }

    console.log('✅ Импорт завершён успешно!\n');

  } catch (error) {
    console.error('❌ Ошибка при импорте:', error.message);
    process.exit(1);
  }
}

importCSV().catch(error => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
