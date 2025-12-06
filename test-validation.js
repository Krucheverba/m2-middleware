const ProductMappingStore = require('./src/storage/productMappingStore');
const fs = require('fs').promises;

/**
 * Тест валидации структуры JSON
 */
async function testValidation() {
  console.log('🔍 Тест валидации структуры JSON...\n');
  
  const testFilePath = './data/test-validation.json';
  
  try {
    // Тест 1: Файл без поля version
    console.log('Тест 1: Файл без поля version');
    await fs.writeFile(testFilePath, JSON.stringify({
      mappings: { "id1": "offer1" }
    }), 'utf8');
    
    const store1 = new ProductMappingStore(testFilePath);
    try {
      await store1.load();
      throw new Error('Должна была быть ошибка');
    } catch (error) {
      if (error.message.includes('version')) {
        console.log('✓ Корректно обработана ошибка отсутствия version\n');
      } else {
        throw error;
      }
    }
    
    // Тест 2: Файл без поля mappings
    console.log('Тест 2: Файл без поля mappings');
    await fs.writeFile(testFilePath, JSON.stringify({
      version: "1.0"
    }), 'utf8');
    
    const store2 = new ProductMappingStore(testFilePath);
    try {
      await store2.load();
      throw new Error('Должна была быть ошибка');
    } catch (error) {
      if (error.message.includes('mappings')) {
        console.log('✓ Корректно обработана ошибка отсутствия mappings\n');
      } else {
        throw error;
      }
    }
    
    // Тест 3: Файл с невалидными маппингами (должны быть пропущены)
    console.log('Тест 3: Файл с невалидными маппингами');
    await fs.writeFile(testFilePath, JSON.stringify({
      version: "1.0",
      mappings: {
        "valid-id-1": "valid-offer-1",
        "": "invalid-empty-key",
        "valid-id-2": "",
        "valid-id-3": "valid-offer-3"
      }
    }), 'utf8');
    
    const store3 = new ProductMappingStore(testFilePath);
    const count = await store3.load();
    
    if (count === 2) {
      console.log('✓ Невалидные маппинги корректно пропущены');
      console.log(`✓ Загружено ${count} валидных маппинга из 4\n`);
    } else {
      throw new Error(`Ожидалось 2 валидных маппинга, получено ${count}`);
    }
    
    // Тест 4: Проверка что валидные маппинги доступны
    console.log('Тест 4: Проверка доступности валидных маппингов');
    const offer1 = store3.getOfferId('valid-id-1');
    const offer3 = store3.getOfferId('valid-id-3');
    
    if (offer1 === 'valid-offer-1' && offer3 === 'valid-offer-3') {
      console.log('✓ Валидные маппинги доступны');
    } else {
      throw new Error('Валидные маппинги недоступны');
    }
    
    console.log('\n✅ Все тесты валидации пройдены!');
    
  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Очистка
    try {
      await fs.unlink(testFilePath);
      await fs.unlink(`${testFilePath}.lock`);
    } catch (e) {
      // Игнорируем
    }
  }
}

testValidation();
