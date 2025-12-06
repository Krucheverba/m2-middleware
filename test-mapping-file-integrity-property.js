/**
 * Property-Based тест для целостности файла маппинга
 * 
 * Feature: product-id-mapping-refactor, Property 2: Mapping file integrity
 * Validates: Requirements 1.1, 1.3
 * 
 * Property: Для любого валидного файла маппинга, загрузка и последующее сохранение
 * должны создать эквивалентный файл с теми же маппингами.
 * 
 * Формально: ∀ mappings: load(save(mappings)) ≡ mappings
 */

// Установить переменные окружения перед загрузкой модулей
process.env.LOG_LEVEL = 'error'; // Минимизировать вывод логов

const fc = require('fast-check');
const ProductMappingStore = require('./src/storage/productMappingStore');
const fs = require('fs').promises;
const path = require('path');

// Генератор UUID в формате МойСклад
const uuidArbitrary = fc.uuid();

// Генератор offerId (буквенно-цифровая строка с дефисами и подчеркиваниями)
const offerIdArbitrary = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9_-]{3,49}$/);

// Генератор пары (productId, offerId)
const mappingPairArbitrary = fc.tuple(uuidArbitrary, offerIdArbitrary);

// Генератор таблицы маппингов (массив уникальных пар)
const mappingTableArbitrary = fc.array(mappingPairArbitrary, { minLength: 0, maxLength: 50 })
  .map(pairs => {
    // Убедиться что productId и offerId уникальны
    const uniqueMap = new Map();
    const usedOfferIds = new Set();
    
    for (const [productId, offerId] of pairs) {
      if (!uniqueMap.has(productId) && !usedOfferIds.has(offerId)) {
        uniqueMap.set(productId, offerId);
        usedOfferIds.add(offerId);
      }
    }
    
    return uniqueMap;
  });

/**
 * Сравнить два Map объекта на эквивалентность
 */
function mapsAreEqual(map1, map2) {
  if (map1.size !== map2.size) {
    return false;
  }
  
  for (const [key, value] of map1.entries()) {
    if (!map2.has(key) || map2.get(key) !== value) {
      return false;
    }
  }
  
  return true;
}

/**
 * Очистить тестовые файлы
 */
async function cleanupTestFiles(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (e) {
    // Игнорируем если файл не существует
  }
  
  try {
    await fs.unlink(`${filePath}.lock`);
  } catch (e) {
    // Игнорируем если файл блокировки не существует
  }
}

async function runPropertyTests() {
  console.log('🔬 Property-Based тесты для целостности файла маппинга\n');
  console.log('Property 2: Mapping file integrity');
  console.log('Validates: Requirements 1.1, 1.3\n');
  
  let allTestsPassed = true;
  const testDir = './data/test-property';
  
  // Создать тестовую директорию
  try {
    await fs.mkdir(testDir, { recursive: true });
  } catch (e) {
    // Игнорируем если директория уже существует
  }

  // Property 2: Целостность файла маппинга (save → load)
  console.log('Тест 1: save(mappings) → load() должен вернуть эквивалентные маппинги');
  try {
    await fc.assert(
      fc.asyncProperty(mappingTableArbitrary, async (originalMappings) => {
        const testFilePath = path.join(testDir, `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
        
        try {
          // Создать store и сохранить маппинги
          const store1 = new ProductMappingStore(testFilePath);
          await store1.save(originalMappings);
          
          // Создать новый store и загрузить маппинги
          const store2 = new ProductMappingStore(testFilePath);
          await store2.load();
          
          // Получить загруженные маппинги
          const loadedMappings = new Map();
          for (const productId of store2.getAllProductIds()) {
            const offerId = store2.getOfferId(productId);
            if (offerId !== null) {
              loadedMappings.set(productId, offerId);
            }
          }
          
          // Проверить эквивалентность
          const areEqual = mapsAreEqual(originalMappings, loadedMappings);
          
          return areEqual;
        } finally {
          // Очистить тестовый файл
          await cleanupTestFiles(testFilePath);
        }
      }),
      { numRuns: 100 } // Минимум 100 итераций согласно дизайн-документу
    );
    
    console.log('  ✓ Property 2 (save-load): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 2 (save-load): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 2 (идемпотентность): load → save → load должен вернуть те же маппинги
  console.log('\nТест 2: load() → save() → load() должен вернуть те же маппинги (идемпотентность)');
  try {
    await fc.assert(
      fc.asyncProperty(mappingTableArbitrary, async (originalMappings) => {
        const testFilePath = path.join(testDir, `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
        
        try {
          // Создать начальный файл
          const store1 = new ProductMappingStore(testFilePath);
          await store1.save(originalMappings);
          
          // Загрузить маппинги
          const store2 = new ProductMappingStore(testFilePath);
          await store2.load();
          
          // Сохранить снова
          await store2.save(store2.productToOfferMap);
          
          // Загрузить еще раз
          const store3 = new ProductMappingStore(testFilePath);
          await store3.load();
          
          // Получить финальные маппинги
          const finalMappings = new Map();
          for (const productId of store3.getAllProductIds()) {
            const offerId = store3.getOfferId(productId);
            if (offerId !== null) {
              finalMappings.set(productId, offerId);
            }
          }
          
          // Проверить эквивалентность с оригиналом
          const areEqual = mapsAreEqual(originalMappings, finalMappings);
          
          return areEqual;
        } finally {
          // Очистить тестовый файл
          await cleanupTestFiles(testFilePath);
        }
      }),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Property 2 (idempotency): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 2 (idempotency): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 2 (размер): Количество маппингов должно сохраняться
  console.log('\nТест 3: Количество маппингов должно сохраняться после save → load');
  try {
    await fc.assert(
      fc.asyncProperty(mappingTableArbitrary, async (originalMappings) => {
        const testFilePath = path.join(testDir, `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
        
        try {
          // Создать store и сохранить маппинги
          const store1 = new ProductMappingStore(testFilePath);
          await store1.save(originalMappings);
          
          // Создать новый store и загрузить маппинги
          const store2 = new ProductMappingStore(testFilePath);
          const loadedCount = await store2.load();
          
          // Проверить что количество совпадает
          return loadedCount === originalMappings.size;
        } finally {
          // Очистить тестовый файл
          await cleanupTestFiles(testFilePath);
        }
      }),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Property 2 (size preservation): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 2 (size preservation): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 2 (обратный маппинг): Обратный маппинг должен сохраняться
  console.log('\nТест 4: Обратный маппинг (offerId → product.id) должен сохраняться после save → load');
  try {
    await fc.assert(
      fc.asyncProperty(mappingTableArbitrary.filter(m => m.size > 0), async (originalMappings) => {
        const testFilePath = path.join(testDir, `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
        
        try {
          // Создать store и сохранить маппинги
          const store1 = new ProductMappingStore(testFilePath);
          await store1.save(originalMappings);
          
          // Создать новый store и загрузить маппинги
          const store2 = new ProductMappingStore(testFilePath);
          await store2.load();
          
          // Проверить обратный маппинг для каждого offerId
          for (const [originalProductId, originalOfferId] of originalMappings.entries()) {
            const loadedProductId = store2.getProductId(originalOfferId);
            
            if (loadedProductId !== originalProductId) {
              return false;
            }
          }
          
          return true;
        } finally {
          // Очистить тестовый файл
          await cleanupTestFiles(testFilePath);
        }
      }),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Property 2 (reverse mapping preservation): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 2 (reverse mapping preservation): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Очистить тестовую директорию
  try {
    await fs.rmdir(testDir);
  } catch (e) {
    // Игнорируем ошибки очистки
  }

  // Итоги
  console.log('\n' + '='.repeat(50));
  
  if (allTestsPassed) {
    console.log('✅ Все property-based тесты пройдены успешно!');
    console.log('Property 2: Mapping file integrity - PASSED');
    process.exit(0);
  } else {
    console.log('❌ Некоторые property-based тесты провалены');
    console.log('Property 2: Mapping file integrity - FAILED');
    process.exit(1);
  }
}

runPropertyTests();
