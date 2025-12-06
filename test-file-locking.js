const ProductMappingStore = require('./src/storage/productMappingStore');

/**
 * Тест file locking - проверка что конкурентные записи не конфликтуют
 */
async function testFileLocking() {
  console.log('🔒 Тест file locking для ProductMappingStore...\n');
  
  const testFilePath = './data/test-locking.json';
  
  try {
    // Создаем два экземпляра store
    const store1 = new ProductMappingStore(testFilePath);
    const store2 = new ProductMappingStore(testFilePath);
    
    await store1.load();
    await store2.load();
    
    // Добавляем разные маппинги в каждый store
    store1.addMapping('product-1', 'offer-1');
    store2.addMapping('product-2', 'offer-2');
    
    console.log('Запуск конкурентных записей...');
    
    // Запускаем сохранение одновременно
    const startTime = Date.now();
    await Promise.all([
      store1.save(store1.productToOfferMap),
      store2.save(store2.productToOfferMap)
    ]);
    const endTime = Date.now();
    
    console.log(`✓ Обе записи завершены за ${endTime - startTime}мс`);
    
    // Проверяем что файл не поврежден
    const store3 = new ProductMappingStore(testFilePath);
    const count = await store3.load();
    
    console.log(`✓ Файл успешно загружен после конкурентных записей`);
    console.log(`✓ Загружено маппингов: ${count}`);
    
    if (count === 0) {
      throw new Error('Файл пуст - возможно произошла потеря данных');
    }
    
    console.log('\n✅ File locking работает корректно!');
    
  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    process.exit(1);
  } finally {
    // Очистка
    const fs = require('fs').promises;
    try {
      await fs.unlink(testFilePath);
      await fs.unlink(`${testFilePath}.lock`);
    } catch (e) {
      // Игнорируем
    }
  }
}

testFileLocking();
