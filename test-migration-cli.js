/**
 * Интеграционный тест для CLI скрипта миграции
 * Проверяет работу scripts/migrate-to-file-mapping.js
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Цвета для вывода
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
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
 * Основная функция тестирования
 */
async function runAllTests() {
  console.log('\n🧪 Интеграционный тест CLI скрипта миграции\n');

  // ============================================================================
  // Тест опций командной строки
  // ============================================================================

  console.log('📋 Тест опций командной строки\n');

  // Тест 1: Опция --help работает
  await runTest('Тест 1: Опция --help работает', async () => {
    const output = execSync('node scripts/migrate-to-file-mapping.js --help', {
      encoding: 'utf8'
    });

    if (!output.includes('Миграция маппинга product.id → offerId')) {
      throw new Error('Справка должна содержать заголовок');
    }

    if (!output.includes('--backup')) {
      throw new Error('Справка должна содержать описание опции --backup');
    }

    if (!output.includes('--validate')) {
      throw new Error('Справка должна содержать описание опции --validate');
    }
  });

  // Тест 2: Неизвестная опция вызывает ошибку
  await runTest('Тест 2: Неизвестная опция вызывает ошибку', async () => {
    let errorThrown = false;
    try {
      execSync('node scripts/migrate-to-file-mapping.js --unknown', {
        encoding: 'utf8',
        stdio: 'pipe'
      });
    } catch (error) {
      errorThrown = true;
      const output = error.stderr || error.stdout;
      if (!output.includes('Неизвестная опция')) {
        throw new Error('Должно быть сообщение о неизвестной опции');
      }
    }

    if (!errorThrown) {
      throw new Error('Должна была быть выброшена ошибка');
    }
  });

  // Тест 3: Скрипт существует и исполняемый
  await runTest('Тест 3: Скрипт существует и исполняемый', async () => {
    const scriptPath = './scripts/migrate-to-file-mapping.js';
    
    try {
      await fs.access(scriptPath);
    } catch (error) {
      throw new Error('Скрипт не существует');
    }

    const stats = await fs.stat(scriptPath);
    // Проверяем что файл имеет права на выполнение (для владельца)
    const isExecutable = (stats.mode & 0o100) !== 0;
    
    if (!isExecutable) {
      throw new Error('Скрипт не имеет прав на выполнение');
    }
  });

  // Тест 4: Скрипт имеет shebang
  await runTest('Тест 4: Скрипт имеет shebang', async () => {
    const scriptPath = './scripts/migrate-to-file-mapping.js';
    const content = await fs.readFile(scriptPath, 'utf8');
    
    if (!content.startsWith('#!/usr/bin/env node')) {
      throw new Error('Скрипт должен начинаться с shebang #!/usr/bin/env node');
    }
  });

  // Тест 5: npm скрипты добавлены в package.json
  await runTest('Тест 5: npm скрипты добавлены в package.json', async () => {
    const packageJson = JSON.parse(await fs.readFile('./package.json', 'utf8'));
    
    if (!packageJson.scripts['migrate-mappings']) {
      throw new Error('Должен быть npm скрипт migrate-mappings');
    }

    if (!packageJson.scripts['migrate-mappings:backup']) {
      throw new Error('Должен быть npm скрипт migrate-mappings:backup');
    }

    if (!packageJson.scripts['migrate-mappings:full']) {
      throw new Error('Должен быть npm скрипт migrate-mappings:full');
    }
  });

  // ============================================================================
  // Тест структуры скрипта
  // ============================================================================

  console.log('\n📋 Тест структуры скрипта\n');

  // Тест 6: Скрипт импортирует необходимые модули
  await runTest('Тест 6: Скрипт импортирует необходимые модули', async () => {
    const scriptPath = './scripts/migrate-to-file-mapping.js';
    const content = await fs.readFile(scriptPath, 'utf8');
    
    const requiredImports = [
      'require(\'dotenv\')',
      'require(\'../src/config\')',
      'require(\'../src/logger\')',
      'require(\'../src/api/moySkladClient\')',
      'require(\'../src/storage/productMappingStore\')',
      'require(\'../src/services/migrationService\')'
    ];

    for (const importStatement of requiredImports) {
      if (!content.includes(importStatement)) {
        throw new Error(`Скрипт должен импортировать ${importStatement}`);
      }
    }
  });

  // Тест 7: Скрипт содержит функцию parseArgs
  await runTest('Тест 7: Скрипт содержит функцию parseArgs', async () => {
    const scriptPath = './scripts/migrate-to-file-mapping.js';
    const content = await fs.readFile(scriptPath, 'utf8');
    
    if (!content.includes('function parseArgs()')) {
      throw new Error('Скрипт должен содержать функцию parseArgs');
    }
  });

  // Тест 8: Скрипт содержит функцию showHelp
  await runTest('Тест 8: Скрипт содержит функцию showHelp', async () => {
    const scriptPath = './scripts/migrate-to-file-mapping.js';
    const content = await fs.readFile(scriptPath, 'utf8');
    
    if (!content.includes('function showHelp()')) {
      throw new Error('Скрипт должен содержать функцию showHelp');
    }
  });

  // Тест 9: Скрипт содержит функцию printStats
  await runTest('Тест 9: Скрипт содержит функцию printStats', async () => {
    const scriptPath = './scripts/migrate-to-file-mapping.js';
    const content = await fs.readFile(scriptPath, 'utf8');
    
    if (!content.includes('function printStats(stats)')) {
      throw new Error('Скрипт должен содержать функцию printStats');
    }
  });

  // Тест 10: Скрипт содержит функцию printValidation
  await runTest('Тест 10: Скрипт содержит функцию printValidation', async () => {
    const scriptPath = './scripts/migrate-to-file-mapping.js';
    const content = await fs.readFile(scriptPath, 'utf8');
    
    if (!content.includes('function printValidation(validation)')) {
      throw new Error('Скрипт должен содержать функцию printValidation');
    }
  });

  // Тест 11: Скрипт содержит главную функцию main
  await runTest('Тест 11: Скрипт содержит главную функцию main', async () => {
    const scriptPath = './scripts/migrate-to-file-mapping.js';
    const content = await fs.readFile(scriptPath, 'utf8');
    
    if (!content.includes('async function main()')) {
      throw new Error('Скрипт должен содержать функцию main');
    }
  });

  // Тест 12: Скрипт вызывает main() при запуске
  await runTest('Тест 12: Скрипт вызывает main() при запуске', async () => {
    const scriptPath = './scripts/migrate-to-file-mapping.js';
    const content = await fs.readFile(scriptPath, 'utf8');
    
    if (!content.includes('main()')) {
      throw new Error('Скрипт должен вызывать main()');
    }
  });

  // ============================================================================
  // Тест документации
  // ============================================================================

  console.log('\n📋 Тест документации\n');

  // Тест 13: Скрипт содержит комментарии с описанием
  await runTest('Тест 13: Скрипт содержит комментарии с описанием', async () => {
    const scriptPath = './scripts/migrate-to-file-mapping.js';
    const content = await fs.readFile(scriptPath, 'utf8');
    
    if (!content.includes('CLI скрипт для миграции')) {
      throw new Error('Скрипт должен содержать описание');
    }

    if (!content.includes('Использование:')) {
      throw new Error('Скрипт должен содержать инструкции по использованию');
    }

    if (!content.includes('Опции:')) {
      throw new Error('Скрипт должен содержать описание опций');
    }
  });

  // Тест 14: Скрипт ссылается на требования
  await runTest('Тест 14: Скрипт ссылается на требования', async () => {
    const scriptPath = './scripts/migrate-to-file-mapping.js';
    const content = await fs.readFile(scriptPath, 'utf8');
    
    if (!content.includes('Требования 10.1, 10.2, 10.3, 10.4, 10.5')) {
      throw new Error('Скрипт должен ссылаться на требования');
    }
  });

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
