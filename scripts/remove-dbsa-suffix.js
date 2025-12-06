#!/usr/bin/env node

/**
 * Скрипт для удаления суффикса _DBSA из всех offerId в маппинге
 */

const fs = require('fs').promises;
const path = require('path');

async function removeSuffix() {
  console.log('🔄 Удаление суффикса _DBSA из маппинга...\n');

  try {
    const mappingFilePath = path.join(process.cwd(), 'data', 'product-mappings.json');
    
    // Читаем файл
    const fileContent = await fs.readFile(mappingFilePath, 'utf8');
    const mappingData = JSON.parse(fileContent);

    // Создаём резервную копию
    const backupPath = path.join(
      process.cwd(), 
      'data', 
      `product-mappings.backup.${new Date().toISOString().replace(/:/g, '-').split('.')[0]}.json`
    );
    await fs.writeFile(backupPath, fileContent, 'utf8');
    console.log(`✅ Резервная копия создана: ${backupPath}\n`);

    // Удаляем суффикс _DBSA
    const newMappings = {};
    let changedCount = 0;

    for (const [productId, offerId] of Object.entries(mappingData.mappings)) {
      if (offerId.endsWith('_DBSA')) {
        newMappings[productId] = offerId.replace(/_DBSA$/, '');
        changedCount++;
      } else {
        newMappings[productId] = offerId;
      }
    }

    // Обновляем данные
    mappingData.mappings = newMappings;
    mappingData.lastUpdated = new Date().toISOString();

    // Сохраняем
    await fs.writeFile(
      mappingFilePath,
      JSON.stringify(mappingData, null, 2),
      'utf8'
    );

    console.log(`✅ Маппинг обновлён: ${mappingFilePath}`);
    console.log(`\n📊 Статистика:`);
    console.log(`   Всего товаров: ${Object.keys(newMappings).length}`);
    console.log(`   Изменено: ${changedCount}`);
    console.log(`   Без изменений: ${Object.keys(newMappings).length - changedCount}\n`);

    // Показываем примеры
    console.log('📋 Примеры изменений:');
    console.log('─'.repeat(80));
    let exampleCount = 0;
    for (const [productId, oldOfferId] of Object.entries(mappingData.mappings)) {
      const newOfferId = newMappings[productId];
      if (oldOfferId !== newOfferId && exampleCount < 5) {
        console.log(`Было: ${oldOfferId}`);
        console.log(`Стало: ${newOfferId}\n`);
        exampleCount++;
      }
    }

    console.log('✅ Готово! Теперь offerId = артикулам без суффикса _DBSA');
    console.log('   Вы можете вручную отредактировать нужные offerId позже\n');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

removeSuffix().catch(error => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
