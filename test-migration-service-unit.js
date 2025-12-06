/**
 * Unit тесты для MigrationService
 * Проверяет: Требования 10.1, 10.2, 10.3, 10.4
 */

// Установить переменные окружения перед загрузкой модулей
process.env.LOG_LEVEL = 'error'; // Минимизировать вывод логов

const MigrationService = require('./src/services/migrationService');
const fs = require('fs').promises;
const path = require('path');

// Цвета для вывода
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

/**
 * Вспомогательная функция для запуска теста
 */
async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`${GREEN}✓${RESET} ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${RED}Ошибка: ${error.message}${RESET}`);
    testsFailed++;
  }
}

/**
 * Вспомогательная функция для очистки тестовых файлов
 */
async function cleanup(filePath) {
  try {
    await fs.unlink(filePath);
    await fs.unlink(`${filePath}.lock`);
  } catch (e) {
    // Игнорируем ошибки
  }
}

/**
 * Очистка директории резервных копий
 */
async function cleanupBackupDir(backupDir) {
  try {
    const files = await fs.readdir(backupDir);
    for (const file of files) {
      await fs.unlink(path.join(backupDir, file));
    }
    await fs.rmdir(backupDir);
  } catch (e) {
    // Игнорируем ошибки
  }
}

// Мок для MoySkladClient
class MockMoySkladClient {
  constructor(testData = {}) {
    this.shouldThrowOnFetch = testData.shouldThrowOnFetch || false;
    this.productsToReturn = testData.productsToReturn || [];
    this.client = {
      get: async (endpoint, options) => {
        if (this.shouldThrowOnFetch) {
          throw new Error('МойСклад API error');
        }
        return {
          data: {
            rows: this.productsToReturn
          }
        };
      }
    };
  }
}

// Мок для ProductMappingStore
class MockProductMappingStore {
  constructor(testData = {}) {
    this.filePath = testData.filePath || './data/test-migration-mappings.json';
    this.shouldThrowOnSave = testData.shouldThrowOnSave || false;
    this.savedMappings = null;
  }

  async save(mappings) {
    if (this.shouldThrowOnSave) {
      throw new Error('Ошибка сохранения файла маппинга');
    }
    this.savedMappings = mappings;
  }
}

/**
 * Основная функция тестирования
 */
async function runAllTests() {
  console.log('\n🧪 Unit тесты для MigrationService\n');

  const testFilePath = './data/test-migration-mappings.json';
  const testBackupDir = './data/test-backups';

  // Очистка перед началом
  await cleanup(testFilePath);
  await cleanupBackupDir(testBackupDir);

  // ============================================================================
  // Тест миграции из атрибутов в файл (Требования 10.1, 10.2, 10.3)
  // ============================================================================

  console.log('📋 Тест миграции из атрибутов в файл\n');

  // Тест 1: Миграция товаров с атрибутом offerId
  await runTest('Тест 1: Миграция товаров с атрибутом offerId', async () => {
    const mockProducts = [
      {
        id: 'product-id-001',
        name: 'Товар 1',
        attributes: [
          { name: 'offerId', value: 'OFFER001' }
        ]
      },
      {
        id: 'product-id-002',
        name: 'Товар 2',
        attributes: [
          { name: 'offerId', value: 'OFFER002' }
        ]
      },
      {
        id: 'product-id-003',
        name: 'Товар 3',
        attributes: [
          { name: 'offerId', value: 'OFFER003' }
        ]
      }
    ];

    const mockClient = new MockMoySkladClient({ productsToReturn: mockProducts });
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);

    const stats = await migrationService.migrateFromAttributes();

    if (stats.totalProducts !== 3) {
      throw new Error(`Ожидалось 3 товара, получено ${stats.totalProducts}`);
    }

    if (stats.migratedMappings !== 3) {
      throw new Error(`Ожидалось 3 мигрированных маппинга, получено ${stats.migratedMappings}`);
    }

    if (stats.skippedProducts !== 0) {
      throw new Error(`Ожидалось 0 пропущенных товаров, получено ${stats.skippedProducts}`);
    }

    if (stats.errors.length !== 0) {
      throw new Error(`Ожидалось 0 ошибок, получено ${stats.errors.length}`);
    }

    // Проверить что маппинги были сохранены
    if (!mockStore.savedMappings) {
      throw new Error('Маппинги не были сохранены');
    }

    if (mockStore.savedMappings.size !== 3) {
      throw new Error(`Ожидалось 3 сохраненных маппинга, получено ${mockStore.savedMappings.size}`);
    }

    await cleanup(testFilePath);
  });

  // Тест 2: Пропуск товаров без атрибута offerId
  await runTest('Тест 2: Пропуск товаров без атрибута offerId', async () => {
    const mockProducts = [
      {
        id: 'product-id-001',
        name: 'Товар с offerId',
        attributes: [
          { name: 'offerId', value: 'OFFER001' }
        ]
      },
      {
        id: 'product-id-002',
        name: 'Товар без offerId',
        attributes: [
          { name: 'otherAttribute', value: 'someValue' }
        ]
      },
      {
        id: 'product-id-003',
        name: 'Товар без атрибутов',
        attributes: []
      }
    ];

    const mockClient = new MockMoySkladClient({ productsToReturn: mockProducts });
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);

    const stats = await migrationService.migrateFromAttributes();

    if (stats.totalProducts !== 3) {
      throw new Error(`Ожидалось 3 товара, получено ${stats.totalProducts}`);
    }

    if (stats.migratedMappings !== 1) {
      throw new Error(`Ожидалось 1 мигрированный маппинг, получено ${stats.migratedMappings}`);
    }

    if (stats.skippedProducts !== 2) {
      throw new Error(`Ожидалось 2 пропущенных товара, получено ${stats.skippedProducts}`);
    }

    // Проверить что сохранен только 1 маппинг
    if (mockStore.savedMappings.size !== 1) {
      throw new Error(`Ожидалось 1 сохраненный маппинг, получено ${mockStore.savedMappings.size}`);
    }

    await cleanup(testFilePath);
  });

  // Тест 3: Корректность маппинга product.id → offerId
  await runTest('Тест 3: Корректность маппинга product.id → offerId', async () => {
    const mockProducts = [
      {
        id: 'f8a2da33-bf0a-11ef-0a80-17e3002d7201',
        name: 'Масло моторное',
        attributes: [
          { name: 'offerId', value: '8100-X-clean-EFE-5w-30-5L_DBSA' }
        ]
      }
    ];

    const mockClient = new MockMoySkladClient({ productsToReturn: mockProducts });
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);

    await migrationService.migrateFromAttributes();

    const savedMapping = mockStore.savedMappings.get('f8a2da33-bf0a-11ef-0a80-17e3002d7201');
    if (savedMapping !== '8100-X-clean-EFE-5w-30-5L_DBSA') {
      throw new Error(`Неверный маппинг: ожидалось '8100-X-clean-EFE-5w-30-5L_DBSA', получено '${savedMapping}'`);
    }

    await cleanup(testFilePath);
  });

  // Тест 4: Обработка пустого списка товаров
  await runTest('Тест 4: Обработка пустого списка товаров', async () => {
    const mockClient = new MockMoySkladClient({ productsToReturn: [] });
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);

    const stats = await migrationService.migrateFromAttributes();

    if (stats.totalProducts !== 0) {
      throw new Error(`Ожидалось 0 товаров, получено ${stats.totalProducts}`);
    }

    if (stats.migratedMappings !== 0) {
      throw new Error(`Ожидалось 0 мигрированных маппингов, получено ${stats.migratedMappings}`);
    }

    // Проверить что был вызван save с пустым Map
    if (!mockStore.savedMappings || mockStore.savedMappings.size !== 0) {
      throw new Error('Должен быть сохранен пустой маппинг');
    }

    await cleanup(testFilePath);
  });

  // Тест 5: Обработка товаров с пустым значением offerId
  await runTest('Тест 5: Обработка товаров с пустым значением offerId', async () => {
    const mockProducts = [
      {
        id: 'product-id-001',
        name: 'Товар с пустым offerId',
        attributes: [
          { name: 'offerId', value: '' }
        ]
      },
      {
        id: 'product-id-002',
        name: 'Товар с null offerId',
        attributes: [
          { name: 'offerId', value: null }
        ]
      },
      {
        id: 'product-id-003',
        name: 'Товар с валидным offerId',
        attributes: [
          { name: 'offerId', value: 'OFFER003' }
        ]
      }
    ];

    const mockClient = new MockMoySkladClient({ productsToReturn: mockProducts });
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);

    const stats = await migrationService.migrateFromAttributes();

    if (stats.migratedMappings !== 1) {
      throw new Error(`Ожидалось 1 мигрированный маппинг, получено ${stats.migratedMappings}`);
    }

    if (stats.skippedProducts !== 2) {
      throw new Error(`Ожидалось 2 пропущенных товара, получено ${stats.skippedProducts}`);
    }

    await cleanup(testFilePath);
  });

  // Тест 6: Статистика миграции содержит все необходимые поля
  await runTest('Тест 6: Статистика миграции содержит все необходимые поля', async () => {
    const mockProducts = [
      {
        id: 'product-id-001',
        name: 'Товар 1',
        attributes: [{ name: 'offerId', value: 'OFFER001' }]
      }
    ];

    const mockClient = new MockMoySkladClient({ productsToReturn: mockProducts });
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);

    const stats = await migrationService.migrateFromAttributes();

    if (!stats.hasOwnProperty('totalProducts')) {
      throw new Error('Статистика должна содержать totalProducts');
    }

    if (!stats.hasOwnProperty('migratedMappings')) {
      throw new Error('Статистика должна содержать migratedMappings');
    }

    if (!stats.hasOwnProperty('skippedProducts')) {
      throw new Error('Статистика должна содержать skippedProducts');
    }

    if (!stats.hasOwnProperty('errors')) {
      throw new Error('Статистика должна содержать errors');
    }

    if (!stats.hasOwnProperty('startTime')) {
      throw new Error('Статистика должна содержать startTime');
    }

    if (!stats.hasOwnProperty('endTime')) {
      throw new Error('Статистика должна содержать endTime');
    }

    if (!(stats.startTime instanceof Date)) {
      throw new Error('startTime должен быть Date');
    }

    if (!(stats.endTime instanceof Date)) {
      throw new Error('endTime должен быть Date');
    }

    await cleanup(testFilePath);
  });

  // ============================================================================
  // Тест создания резервной копии (Требование 10.5)
  // ============================================================================

  console.log('\n📋 Тест создания резервной копии\n');

  // Тест 7: Создание резервной копии существующего файла
  await runTest('Тест 7: Создание резервной копии существующего файла', async () => {
    // Создать тестовый файл маппинга
    const testData = {
      version: '1.0',
      lastUpdated: '2024-12-04T10:00:00Z',
      mappings: {
        'product-1': 'offer-1',
        'product-2': 'offer-2'
      }
    };
    await fs.mkdir('./data', { recursive: true });
    await fs.writeFile(testFilePath, JSON.stringify(testData, null, 2), 'utf8');

    const mockClient = new MockMoySkladClient();
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);
    migrationService.backupDir = testBackupDir;

    const backupPath = await migrationService.backupCurrentMappings();

    if (!backupPath) {
      throw new Error('Должен быть возвращен путь к резервной копии');
    }

    // Проверить что файл резервной копии существует
    const backupExists = await fs.access(backupPath).then(() => true).catch(() => false);
    if (!backupExists) {
      throw new Error('Файл резервной копии не был создан');
    }

    // Проверить содержимое резервной копии
    const backupContent = await fs.readFile(backupPath, 'utf8');
    const backupData = JSON.parse(backupContent);

    if (backupData.mappings['product-1'] !== 'offer-1') {
      throw new Error('Содержимое резервной копии не совпадает с оригиналом');
    }

    await cleanup(testFilePath);
    await cleanupBackupDir(testBackupDir);
  });

  // Тест 8: Обработка отсутствующего файла маппинга
  await runTest('Тест 8: Обработка отсутствующего файла маппинга', async () => {
    await cleanup(testFilePath);

    const mockClient = new MockMoySkladClient();
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);
    migrationService.backupDir = testBackupDir;

    const backupPath = await migrationService.backupCurrentMappings();

    if (backupPath !== null) {
      throw new Error('Должен вернуть null для несуществующего файла');
    }

    await cleanupBackupDir(testBackupDir);
  });

  // Тест 9: Создание директории для резервных копий
  await runTest('Тест 9: Создание директории для резервных копий', async () => {
    // Создать тестовый файл маппинга
    const testData = {
      version: '1.0',
      mappings: { 'product-1': 'offer-1' }
    };
    await fs.mkdir('./data', { recursive: true });
    await fs.writeFile(testFilePath, JSON.stringify(testData), 'utf8');

    // Убедиться что директория резервных копий не существует
    await cleanupBackupDir(testBackupDir);

    const mockClient = new MockMoySkladClient();
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);
    migrationService.backupDir = testBackupDir;

    await migrationService.backupCurrentMappings();

    // Проверить что директория была создана
    const dirExists = await fs.access(testBackupDir).then(() => true).catch(() => false);
    if (!dirExists) {
      throw new Error('Директория резервных копий не была создана');
    }

    await cleanup(testFilePath);
    await cleanupBackupDir(testBackupDir);
  });

  // Тест 10: Имя файла резервной копии содержит timestamp
  await runTest('Тест 10: Имя файла резервной копии содержит timestamp', async () => {
    const testData = {
      version: '1.0',
      mappings: { 'product-1': 'offer-1' }
    };
    await fs.mkdir('./data', { recursive: true });
    await fs.writeFile(testFilePath, JSON.stringify(testData), 'utf8');

    const mockClient = new MockMoySkladClient();
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);
    migrationService.backupDir = testBackupDir;

    const backupPath = await migrationService.backupCurrentMappings();

    const fileName = path.basename(backupPath);
    if (!fileName.includes('product-mappings-backup-')) {
      throw new Error('Имя файла должно содержать префикс product-mappings-backup-');
    }

    if (!fileName.endsWith('.json')) {
      throw new Error('Имя файла должно заканчиваться на .json');
    }

    await cleanup(testFilePath);
    await cleanupBackupDir(testBackupDir);
  });

  // ============================================================================
  // Тест валидации маппинга (Требование 10.4)
  // ============================================================================

  console.log('\n📋 Тест валидации маппинга\n');

  // Тест 11: Валидация корректного файла маппинга
  await runTest('Тест 11: Валидация корректного файла маппинга', async () => {
    const validData = {
      version: '1.0',
      lastUpdated: '2024-12-04T10:00:00Z',
      mappings: {
        'f8a2da33-bf0a-11ef-0a80-17e3002d7201': 'OFFER001',
        'a1b2c3d4-e5f6-11ef-0a80-17e3002d7202': 'OFFER002',
        'b2c3d4e5-f6a7-11ef-0a80-17e3002d7203': 'OFFER003'
      }
    };
    await fs.mkdir('./data', { recursive: true });
    await fs.writeFile(testFilePath, JSON.stringify(validData, null, 2), 'utf8');

    const mockClient = new MockMoySkladClient();
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);

    const validation = await migrationService.validateMappings();

    if (!validation.isValid) {
      throw new Error('Валидация должна пройти успешно для корректного файла');
    }

    if (validation.totalMappings !== 3) {
      throw new Error(`Ожидалось 3 маппинга, получено ${validation.totalMappings}`);
    }

    if (validation.validMappings !== 3) {
      throw new Error(`Ожидалось 3 валидных маппинга, получено ${validation.validMappings}`);
    }

    if (validation.invalidMappings.length !== 0) {
      throw new Error('Не должно быть невалидных маппингов');
    }

    await cleanup(testFilePath);
  });

  // Тест 12: Обнаружение невалидного формата product.id
  await runTest('Тест 12: Обнаружение невалидного формата product.id', async () => {
    const invalidData = {
      version: '1.0',
      mappings: {
        'not-a-uuid': 'OFFER001',
        'f8a2da33-bf0a-11ef-0a80-17e3002d7201': 'OFFER002'
      }
    };
    await fs.mkdir('./data', { recursive: true });
    await fs.writeFile(testFilePath, JSON.stringify(invalidData), 'utf8');

    const mockClient = new MockMoySkladClient();
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);

    const validation = await migrationService.validateMappings();

    if (validation.isValid) {
      throw new Error('Валидация должна провалиться для невалидного UUID');
    }

    if (validation.invalidMappings.length !== 1) {
      throw new Error(`Ожидалось 1 невалидный маппинг, получено ${validation.invalidMappings.length}`);
    }

    if (validation.validMappings !== 1) {
      throw new Error(`Ожидалось 1 валидный маппинг, получено ${validation.validMappings}`);
    }

    await cleanup(testFilePath);
  });

  // Тест 13: Обнаружение пустых значений
  await runTest('Тест 13: Обнаружение пустых значений', async () => {
    const invalidData = {
      version: '1.0',
      mappings: {
        'f8a2da33-bf0a-11ef-0a80-17e3002d7201': '',
        '': 'OFFER002',
        'a1b2c3d4-e5f6-11ef-0a80-17e3002d7202': 'OFFER003'
      }
    };
    await fs.mkdir('./data', { recursive: true });
    await fs.writeFile(testFilePath, JSON.stringify(invalidData), 'utf8');

    const mockClient = new MockMoySkladClient();
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);

    const validation = await migrationService.validateMappings();

    if (validation.isValid) {
      throw new Error('Валидация должна провалиться для пустых значений');
    }

    if (validation.emptyValues.length !== 2) {
      throw new Error(`Ожидалось 2 пустых значения, получено ${validation.emptyValues.length}`);
    }

    if (validation.validMappings !== 1) {
      throw new Error(`Ожидалось 1 валидный маппинг, получено ${validation.validMappings}`);
    }

    await cleanup(testFilePath);
  });

  // Тест 14: Обнаружение дубликатов offerId
  await runTest('Тест 14: Обнаружение дубликатов offerId', async () => {
    const invalidData = {
      version: '1.0',
      mappings: {
        'f8a2da33-bf0a-11ef-0a80-17e3002d7201': 'OFFER001',
        'a1b2c3d4-e5f6-11ef-0a80-17e3002d7202': 'OFFER001', // дубликат
        'b2c3d4e5-f6a7-11ef-0a80-17e3002d7203': 'OFFER003'
      }
    };
    await fs.mkdir('./data', { recursive: true });
    await fs.writeFile(testFilePath, JSON.stringify(invalidData), 'utf8');

    const mockClient = new MockMoySkladClient();
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);

    const validation = await migrationService.validateMappings();

    if (validation.isValid) {
      throw new Error('Валидация должна провалиться для дубликатов offerId');
    }

    if (validation.duplicateOfferIds.length !== 1) {
      throw new Error(`Ожидалось 1 дубликат offerId, получено ${validation.duplicateOfferIds.length}`);
    }

    if (validation.duplicateOfferIds[0].offerId !== 'OFFER001') {
      throw new Error('Должен быть обнаружен дубликат OFFER001');
    }

    if (validation.duplicateOfferIds[0].count !== 2) {
      throw new Error('Дубликат должен встречаться 2 раза');
    }

    await cleanup(testFilePath);
  });

  // Тест 15: Обнаружение невалидной структуры файла
  await runTest('Тест 15: Обнаружение невалидной структуры файла', async () => {
    const invalidData = {
      version: '1.0'
      // отсутствует поле mappings
    };
    await fs.mkdir('./data', { recursive: true });
    await fs.writeFile(testFilePath, JSON.stringify(invalidData), 'utf8');

    const mockClient = new MockMoySkladClient();
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);

    const validation = await migrationService.validateMappings();

    if (validation.isValid) {
      throw new Error('Валидация должна провалиться для невалидной структуры');
    }

    await cleanup(testFilePath);
  });

  // Тест 16: Валидация возвращает все необходимые поля
  await runTest('Тест 16: Валидация возвращает все необходимые поля', async () => {
    const validData = {
      version: '1.0',
      mappings: {
        'f8a2da33-bf0a-11ef-0a80-17e3002d7201': 'OFFER001'
      }
    };
    await fs.mkdir('./data', { recursive: true });
    await fs.writeFile(testFilePath, JSON.stringify(validData), 'utf8');

    const mockClient = new MockMoySkladClient();
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);

    const validation = await migrationService.validateMappings();

    if (!validation.hasOwnProperty('isValid')) {
      throw new Error('Валидация должна содержать isValid');
    }

    if (!validation.hasOwnProperty('totalMappings')) {
      throw new Error('Валидация должна содержать totalMappings');
    }

    if (!validation.hasOwnProperty('validMappings')) {
      throw new Error('Валидация должна содержать validMappings');
    }

    if (!validation.hasOwnProperty('invalidMappings')) {
      throw new Error('Валидация должна содержать invalidMappings');
    }

    if (!validation.hasOwnProperty('duplicateOfferIds')) {
      throw new Error('Валидация должна содержать duplicateOfferIds');
    }

    if (!validation.hasOwnProperty('emptyValues')) {
      throw new Error('Валидация должна содержать emptyValues');
    }

    await cleanup(testFilePath);
  });

  // ============================================================================
  // Тест обработки ошибок миграции
  // ============================================================================

  console.log('\n📋 Тест обработки ошибок миграции\n');

  // Тест 17: Обработка ошибки при получении товаров из МойСклад
  await runTest('Тест 17: Обработка ошибки при получении товаров из МойСклад', async () => {
    const mockClient = new MockMoySkladClient({ shouldThrowOnFetch: true });
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);

    let errorThrown = false;
    try {
      await migrationService.migrateFromAttributes();
    } catch (error) {
      errorThrown = true;
      if (!error.message.includes('МойСклад API error')) {
        throw new Error(`Неожиданная ошибка: ${error.message}`);
      }
    }

    if (!errorThrown) {
      throw new Error('Должна была быть выброшена ошибка');
    }

    await cleanup(testFilePath);
  });

  // Тест 18: Обработка ошибки при сохранении маппинга
  await runTest('Тест 18: Обработка ошибки при сохранении маппинга', async () => {
    const mockProducts = [
      {
        id: 'product-id-001',
        name: 'Товар 1',
        attributes: [{ name: 'offerId', value: 'OFFER001' }]
      }
    ];

    const mockClient = new MockMoySkladClient({ productsToReturn: mockProducts });
    const mockStore = new MockProductMappingStore({ 
      filePath: testFilePath,
      shouldThrowOnSave: true 
    });
    const migrationService = new MigrationService(mockClient, mockStore);

    let errorThrown = false;
    try {
      await migrationService.migrateFromAttributes();
    } catch (error) {
      errorThrown = true;
      if (!error.message.includes('Ошибка сохранения')) {
        throw new Error(`Неожиданная ошибка: ${error.message}`);
      }
    }

    if (!errorThrown) {
      throw new Error('Должна была быть выброшена ошибка');
    }

    await cleanup(testFilePath);
  });

  // Тест 19: Обработка товаров с null атрибутами (пропуск без ошибки)
  await runTest('Тест 19: Обработка товаров с null атрибутами', async () => {
    const mockProducts = [
      {
        id: 'product-id-001',
        name: 'Товар 1',
        attributes: [{ name: 'offerId', value: 'OFFER001' }]
      },
      {
        id: 'product-id-002',
        name: 'Товар 2',
        attributes: null // будет пропущен
      },
      {
        id: 'product-id-003',
        name: 'Товар 3',
        attributes: [{ name: 'offerId', value: 'OFFER003' }]
      }
    ];

    const mockClient = new MockMoySkladClient({ productsToReturn: mockProducts });
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);

    const stats = await migrationService.migrateFromAttributes();

    // Товар с null атрибутами просто пропускается
    if (stats.migratedMappings !== 2) {
      throw new Error(`Ожидалось 2 мигрированных маппинга, получено ${stats.migratedMappings}`);
    }

    if (stats.skippedProducts !== 1) {
      throw new Error(`Ожидалось 1 пропущенный товар, получено ${stats.skippedProducts}`);
    }

    // Это не ошибка, а просто пропуск
    if (stats.errors.length !== 0) {
      throw new Error(`Ожидалось 0 ошибок, получено ${stats.errors.length}`);
    }

    await cleanup(testFilePath);
  });

  // Тест 20: Обработка большого количества товаров
  await runTest('Тест 20: Обработка большого количества товаров', async () => {
    const mockProducts = [];
    for (let i = 1; i <= 100; i++) {
      mockProducts.push({
        id: `product-id-${String(i).padStart(3, '0')}`,
        name: `Товар ${i}`,
        attributes: [{ name: 'offerId', value: `OFFER${String(i).padStart(3, '0')}` }]
      });
    }

    const mockClient = new MockMoySkladClient({ productsToReturn: mockProducts });
    const mockStore = new MockProductMappingStore({ filePath: testFilePath });
    const migrationService = new MigrationService(mockClient, mockStore);

    const stats = await migrationService.migrateFromAttributes();

    if (stats.totalProducts !== 100) {
      throw new Error(`Ожидалось 100 товаров, получено ${stats.totalProducts}`);
    }

    if (stats.migratedMappings !== 100) {
      throw new Error(`Ожидалось 100 мигрированных маппингов, получено ${stats.migratedMappings}`);
    }

    if (mockStore.savedMappings.size !== 100) {
      throw new Error(`Ожидалось 100 сохраненных маппингов, получено ${mockStore.savedMappings.size}`);
    }

    await cleanup(testFilePath);
  });

  // Финальная очистка
  await cleanup(testFilePath);
  await cleanupBackupDir(testBackupDir);

  // Вывод результатов
  console.log('\n' + '='.repeat(50));
  if (testsFailed === 0) {
    console.log(`${GREEN}✅ Все тесты пройдены успешно!${RESET}`);
  } else {
    console.log(`${RED}❌ Некоторые тесты провалены${RESET}`);
  }
  console.log(`Пройдено: ${testsPassed}, Провалено: ${testsFailed}`);
  console.log('='.repeat(50) + '\n');

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Запуск тестов
runAllTests().catch(error => {
  console.error(`${RED}Критическая ошибка:${RESET}`, error);
  process.exit(1);
});
