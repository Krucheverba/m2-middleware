/**
 * Property-Based тест для сохранения данных при миграции
 * 
 * Feature: product-id-mapping-refactor, Property 9: Migration data preservation
 * Validates: Requirements 10.2, 10.3
 * 
 * Property: Для любого набора товаров с атрибутом offerId, миграция в файл
 * должна сохранить все маппинги без потерь.
 * 
 * Формально: ∀ products with offerId attribute: 
 *   migrate(products) → file contains all (product.id → offerId) mappings
 */

// Установить переменные окружения перед загрузкой модулей
process.env.LOG_LEVEL = 'error'; // Минимизировать вывод логов

const fc = require('fast-check');
const MigrationService = require('./src/services/migrationService');
const ProductMappingStore = require('./src/storage/productMappingStore');
const fs = require('fs').promises;
const path = require('path');

// Генератор UUID в формате МойСклад
const uuidArbitrary = fc.uuid();

// Генератор offerId (буквенно-цифровая строка с дефисами и подчеркиваниями)
const offerIdArbitrary = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9_-]{3,49}$/);

// Генератор имени товара
const productNameArbitrary = fc.string({ minLength: 3, maxLength: 50 });

// Генератор товара МойСклад с атрибутом offerId
const productWithOfferIdArbitrary = fc.record({
  id: uuidArbitrary,
  name: productNameArbitrary,
  attributes: fc.constant([]).chain(attrs => 
    fc.record({
      name: fc.constant('offerId'),
      value: offerIdArbitrary
    }).map(attr => [attr])
  )
});

// Генератор списка товаров с уникальными product.id и offerId
const productsListArbitrary = fc.array(productWithOfferIdArbitrary, { minLength: 1, maxLength: 50 })
  .map(products => {
    // Убедиться что product.id и offerId уникальны
    const uniqueProducts = [];
    const usedProductIds = new Set();
    const usedOfferIds = new Set();
    
    for (const product of products) {
      const offerId = product.attributes[0].value;
      
      if (!usedProductIds.has(product.id) && !usedOfferIds.has(offerId)) {
        uniqueProducts.push(product);
        usedProductIds.add(product.id);
        usedOfferIds.add(offerId);
      }
    }
    
    return uniqueProducts;
  })
  .filter(products => products.length > 0); // Убедиться что есть хотя бы один товар

// Мок для MoySkladClient с динамическими данными
class MockMoySkladClient {
  constructor(productsToReturn = []) {
    this.productsToReturn = productsToReturn;
    this.client = {
      get: async (endpoint, options) => {
        return {
          data: {
            rows: this.productsToReturn
          }
        };
      }
    };
  }
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
  console.log('🔬 Property-Based тесты для сохранения данных при миграции\n');
  console.log('Property 9: Migration data preservation');
  console.log('Validates: Requirements 10.2, 10.3\n');
  
  let allTestsPassed = true;
  const testDir = './data/test-migration-property';
  
  // Создать тестовую директорию
  try {
    await fs.mkdir(testDir, { recursive: true });
  } catch (e) {
    // Игнорируем если директория уже существует
  }

  // Property 9: Сохранение всех маппингов при миграции
  console.log('Тест 1: Все маппинги product.id → offerId должны сохраниться при миграции');
  try {
    await fc.assert(
      fc.asyncProperty(productsListArbitrary, async (products) => {
        const testFilePath = path.join(testDir, `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
        
        try {
          // Создать ожидаемые маппинги из товаров
          const expectedMappings = new Map();
          for (const product of products) {
            const offerId = product.attributes[0].value;
            expectedMappings.set(product.id, offerId);
          }
          
          // Создать мок клиента с товарами
          const mockClient = new MockMoySkladClient(products);
          const productStore = new ProductMappingStore(testFilePath);
          const migrationService = new MigrationService(mockClient, productStore);
          
          // Выполнить миграцию
          const stats = await migrationService.migrateFromAttributes();
          
          // Проверить что все товары были обработаны
          if (stats.totalProducts !== products.length) {
            return false;
          }
          
          // Проверить что все маппинги были мигрированы
          if (stats.migratedMappings !== expectedMappings.size) {
            return false;
          }
          
          // Загрузить маппинги из файла
          const loadedStore = new ProductMappingStore(testFilePath);
          await loadedStore.load();
          
          // Проверить что все ожидаемые маппинги присутствуют в файле
          for (const [productId, expectedOfferId] of expectedMappings.entries()) {
            const loadedOfferId = loadedStore.getOfferId(productId);
            
            if (loadedOfferId !== expectedOfferId) {
              return false;
            }
          }
          
          // Проверить что в файле нет лишних маппингов
          const loadedProductIds = loadedStore.getAllProductIds();
          if (loadedProductIds.length !== expectedMappings.size) {
            return false;
          }
          
          return true;
        } finally {
          // Очистить тестовый файл
          await cleanupTestFiles(testFilePath);
        }
      }),
      { numRuns: 100 } // Минимум 100 итераций согласно дизайн-документу
    );
    
    console.log('  ✓ Property 9 (all mappings preserved): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 9 (all mappings preserved): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 9: Обратный маппинг также должен сохраниться
  console.log('\nТест 2: Обратный маппинг offerId → product.id должен сохраниться при миграции');
  try {
    await fc.assert(
      fc.asyncProperty(productsListArbitrary, async (products) => {
        const testFilePath = path.join(testDir, `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
        
        try {
          // Создать ожидаемые обратные маппинги
          const expectedReverseMappings = new Map();
          for (const product of products) {
            const offerId = product.attributes[0].value;
            expectedReverseMappings.set(offerId, product.id);
          }
          
          // Создать мок клиента с товарами
          const mockClient = new MockMoySkladClient(products);
          const productStore = new ProductMappingStore(testFilePath);
          const migrationService = new MigrationService(mockClient, productStore);
          
          // Выполнить миграцию
          await migrationService.migrateFromAttributes();
          
          // Загрузить маппинги из файла
          const loadedStore = new ProductMappingStore(testFilePath);
          await loadedStore.load();
          
          // Проверить обратный маппинг для каждого offerId
          for (const [offerId, expectedProductId] of expectedReverseMappings.entries()) {
            const loadedProductId = loadedStore.getProductId(offerId);
            
            if (loadedProductId !== expectedProductId) {
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
    
    console.log('  ✓ Property 9 (reverse mapping preserved): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 9 (reverse mapping preserved): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 9: Количество мигрированных маппингов должно совпадать с количеством товаров с offerId
  console.log('\nТест 3: Количество мигрированных маппингов должно совпадать с количеством товаров');
  try {
    await fc.assert(
      fc.asyncProperty(productsListArbitrary, async (products) => {
        const testFilePath = path.join(testDir, `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
        
        try {
          // Создать мок клиента с товарами
          const mockClient = new MockMoySkladClient(products);
          const productStore = new ProductMappingStore(testFilePath);
          const migrationService = new MigrationService(mockClient, productStore);
          
          // Выполнить миграцию
          const stats = await migrationService.migrateFromAttributes();
          
          // Проверить что количество мигрированных маппингов совпадает
          if (stats.migratedMappings !== products.length) {
            return false;
          }
          
          // Проверить что не было пропущенных товаров
          if (stats.skippedProducts !== 0) {
            return false;
          }
          
          // Проверить что не было ошибок
          if (stats.errors.length !== 0) {
            return false;
          }
          
          return true;
        } finally {
          // Очистить тестовый файл
          await cleanupTestFiles(testFilePath);
        }
      }),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Property 9 (count preservation): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 9 (count preservation): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 9: Валидация мигрированного файла должна проходить успешно
  console.log('\nТест 4: Мигрированный файл должен проходить валидацию');
  try {
    await fc.assert(
      fc.asyncProperty(productsListArbitrary, async (products) => {
        const testFilePath = path.join(testDir, `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
        
        try {
          // Создать мок клиента с товарами
          const mockClient = new MockMoySkladClient(products);
          const productStore = new ProductMappingStore(testFilePath);
          const migrationService = new MigrationService(mockClient, productStore);
          
          // Выполнить миграцию
          await migrationService.migrateFromAttributes();
          
          // Валидировать мигрированный файл
          const validation = await migrationService.validateMappings();
          
          // Проверить что валидация прошла успешно
          if (!validation.isValid) {
            return false;
          }
          
          // Проверить что все маппинги валидны
          if (validation.validMappings !== products.length) {
            return false;
          }
          
          // Проверить что нет невалидных маппингов
          if (validation.invalidMappings.length !== 0) {
            return false;
          }
          
          // Проверить что нет дубликатов offerId
          if (validation.duplicateOfferIds.length !== 0) {
            return false;
          }
          
          return true;
        } finally {
          // Очистить тестовый файл
          await cleanupTestFiles(testFilePath);
        }
      }),
      { numRuns: 100 }
    );
    
    console.log('  ✓ Property 9 (validation passes): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 9 (validation passes): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Property 9: Двойная миграция не должна изменять данные (идемпотентность)
  console.log('\nТест 5: Повторная миграция не должна изменять данные (идемпотентность)');
  try {
    await fc.assert(
      fc.asyncProperty(productsListArbitrary, async (products) => {
        const testFilePath = path.join(testDir, `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
        
        try {
          // Создать мок клиента с товарами
          const mockClient = new MockMoySkladClient(products);
          const productStore = new ProductMappingStore(testFilePath);
          const migrationService = new MigrationService(mockClient, productStore);
          
          // Выполнить первую миграцию
          await migrationService.migrateFromAttributes();
          
          // Загрузить маппинги после первой миграции
          const store1 = new ProductMappingStore(testFilePath);
          await store1.load();
          const mappingsAfterFirst = new Map();
          for (const productId of store1.getAllProductIds()) {
            mappingsAfterFirst.set(productId, store1.getOfferId(productId));
          }
          
          // Выполнить вторую миграцию
          await migrationService.migrateFromAttributes();
          
          // Загрузить маппинги после второй миграции
          const store2 = new ProductMappingStore(testFilePath);
          await store2.load();
          const mappingsAfterSecond = new Map();
          for (const productId of store2.getAllProductIds()) {
            mappingsAfterSecond.set(productId, store2.getOfferId(productId));
          }
          
          // Проверить что маппинги не изменились
          if (mappingsAfterFirst.size !== mappingsAfterSecond.size) {
            return false;
          }
          
          for (const [productId, offerId] of mappingsAfterFirst.entries()) {
            if (mappingsAfterSecond.get(productId) !== offerId) {
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
    
    console.log('  ✓ Property 9 (idempotency): Пройдено 100 итераций');
  } catch (error) {
    console.error('  ✗ Property 9 (idempotency): Провалено');
    console.error('  Контрпример:', error.counterexample);
    console.error('  Ошибка:', error.message);
    allTestsPassed = false;
  }

  // Очистить тестовую директорию
  try {
    const files = await fs.readdir(testDir);
    for (const file of files) {
      await fs.unlink(path.join(testDir, file));
    }
    await fs.rmdir(testDir);
  } catch (e) {
    // Игнорируем ошибки очистки
  }

  // Итоги
  console.log('\n' + '='.repeat(50));
  
  if (allTestsPassed) {
    console.log('✅ Все property-based тесты пройдены успешно!');
    console.log('Property 9: Migration data preservation - PASSED');
    process.exit(0);
  } else {
    console.log('❌ Некоторые property-based тесты провалены');
    console.log('Property 9: Migration data preservation - FAILED');
    process.exit(1);
  }
}

runPropertyTests();
