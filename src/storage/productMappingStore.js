const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger');
const mappingMetrics = require('../metrics/mappingMetrics');

/**
 * ProductMappingStore - Файловое хранилище для маппинга товаров между product.id и offerId
 * 
 * Хранит маппинги в JSON формате с блокировкой файла для предотвращения конфликтов при одновременной записи.
 * Обеспечивает двунаправленный маппинг: product.id ↔ offerId
 * Проверяет: Требования 1.1, 1.2, 1.3, 1.4, 1.5
 */
class ProductMappingStore {
  constructor(filePath = './data/product-mappings.json') {
    this.filePath = path.resolve(filePath);
    this.lockFilePath = `${this.filePath}.lock`;
    this.lockTimeout = 5000; // 5 секунд
    this.lockCheckInterval = 50; // Проверка каждые 50мс
    
    // Кэш маппингов в памяти для быстрого доступа (Требование 1.5)
    this.productToOfferMap = new Map(); // product.id → offerId
    this.offerToProductMap = new Map(); // offerId → product.id
    this.lastLoaded = null;
    this.isLoaded = false;
  }

  /**
   * Получить блокировку файла с таймаутом
   * @private
   */
  async _acquireLock() {
    const startTime = Date.now();
    
    while (Date.now() - startTime < this.lockTimeout) {
      try {
        // Попытка создать файл блокировки эксклюзивно
        await fs.writeFile(this.lockFilePath, process.pid.toString(), { flag: 'wx' });
        return true;
      } catch (error) {
        if (error.code === 'EEXIST') {
          // Файл блокировки существует, ждем и повторяем попытку
          await new Promise(resolve => setTimeout(resolve, this.lockCheckInterval));
        } else {
          throw error;
        }
      }
    }
    
    throw new Error('Не удалось получить блокировку файла: таймаут');
  }

  /**
   * Освободить блокировку файла
   * @private
   */
  async _releaseLock() {
    try {
      await fs.unlink(this.lockFilePath);
    } catch (error) {
      // Игнорируем ошибки если файл блокировки не существует
      if (error.code !== 'ENOENT') {
        logger.warn('Не удалось освободить файл блокировки', { error: error.message });
      }
    }
  }

  /**
   * Валидировать структуру JSON файла маппинга
   * Проверяет: Требование 1.3
   * @private
   */
  _validateMappingStructure(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Невалидная структура: данные должны быть объектом');
    }

    if (!data.version) {
      throw new Error('Невалидная структура: отсутствует поле version');
    }

    if (!data.mappings || typeof data.mappings !== 'object') {
      throw new Error('Невалидная структура: отсутствует или невалидно поле mappings');
    }

    // Валидация каждого маппинга
    const invalidMappings = [];
    for (const [productId, offerId] of Object.entries(data.mappings)) {
      if (!productId || typeof productId !== 'string') {
        invalidMappings.push({ productId, reason: 'невалидный product.id' });
        continue;
      }
      if (!offerId || typeof offerId !== 'string') {
        invalidMappings.push({ productId, reason: 'невалидный offerId' });
      }
    }

    return invalidMappings;
  }

  /**
   * Загрузить маппинги из файла в память
   * Проверяет: Требования 1.1, 1.2, 1.3, 1.4, 1.5
   * 
   * @returns {Promise<number>} Количество загруженных маппингов
   */
  async load() {
    try {
      let data;
      
      try {
        const fileContent = await fs.readFile(this.filePath, 'utf8');
        data = JSON.parse(fileContent);
      } catch (error) {
        if (error.code === 'ENOENT') {
          // Файл не существует, создаем пустой файл (Требование 1.2)
          logger.info('Файл маппинга не существует, создаем новый', { filePath: this.filePath });
          await this._createEmptyMappingFile();
          this.lastLoaded = new Date();
          this.isLoaded = true;
          return 0;
        }
        
        if (error instanceof SyntaxError) {
          // Невалидный JSON (Требование 1.4)
          logger.logFileError(
            'Невалидный JSON в файле маппинга',
            this.filePath,
            'load',
            error
          );
          throw new Error(`Невалидный JSON в файле маппинга: ${error.message}`);
        }
        
        throw error;
      }

      // Валидация структуры (Требование 1.3)
      const invalidMappings = this._validateMappingStructure(data);
      
      if (invalidMappings.length > 0) {
        // Логируем невалидные записи и пропускаем их (Требование 1.4)
        logger.warn('Обнаружены невалидные маппинги, они будут пропущены', {
          count: invalidMappings.length,
          invalid: invalidMappings
        });
      }

      // Очистить существующие кэши
      this.productToOfferMap.clear();
      this.offerToProductMap.clear();

      // Загрузить валидные маппинги в память (Требование 1.5)
      let loadedCount = 0;
      for (const [productId, offerId] of Object.entries(data.mappings)) {
        // Пропускаем невалидные записи
        if (invalidMappings.some(inv => inv.productId === productId)) {
          continue;
        }

        this.productToOfferMap.set(productId, offerId);
        this.offerToProductMap.set(offerId, productId);
        loadedCount++;
      }

      this.lastLoaded = new Date();
      this.isLoaded = true;

      // Обновить метрики (Требование 9.1)
      mappingMetrics.updateMappingCount(loadedCount);

      logger.info('Маппинги успешно загружены', {
        count: loadedCount,
        skipped: invalidMappings.length,
        filePath: this.filePath
      });

      return loadedCount;
    } catch (error) {
      logger.logFileError(
        'Не удалось загрузить маппинги из файла',
        this.filePath,
        'load',
        error
      );
      throw error;
    }
  }

  /**
   * Создать пустой файл маппинга с корректной структурой
   * @private
   */
  async _createEmptyMappingFile() {
    const emptyData = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      mappings: {}
    };

    // Убедиться что директория существует
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    // Записать пустой файл
    await fs.writeFile(this.filePath, JSON.stringify(emptyData, null, 2), 'utf8');
    
    logger.info('Создан пустой файл маппинга', { filePath: this.filePath });
  }

  /**
   * Сохранить маппинги в файл
   * Проверяет: Требование 1.1
   * 
   * @param {Map<string, string>} mappings - Map с маппингами product.id → offerId
   * @returns {Promise<void>}
   */
  async save(mappings) {
    if (!(mappings instanceof Map)) {
      throw new Error('Параметр mappings должен быть экземпляром Map');
    }

    let lockAcquired = false;

    try {
      // Получить блокировку
      await this._acquireLock();
      lockAcquired = true;

      // Преобразовать Map в объект для JSON
      const mappingsObject = {};
      for (const [productId, offerId] of mappings.entries()) {
        mappingsObject[productId] = offerId;
      }

      const data = {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        mappings: mappingsObject
      };

      // Убедиться что директория существует
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      // Записать в файл
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');

      logger.info('Маппинги успешно сохранены в файл', {
        count: mappings.size,
        filePath: this.filePath
      });

    } catch (error) {
      logger.logFileError(
        'Не удалось сохранить маппинги в файл',
        this.filePath,
        'save',
        error
      );
      throw error;
    } finally {
      // Всегда освобождать блокировку
      if (lockAcquired) {
        await this._releaseLock();
      }
    }
  }

  /**
   * Получить offerId по product.id
   * Проверяет: Требование 2.1, 2.2
   * 
   * @param {string} productId - UUID товара в МойСклад
   * @returns {string|null} offerId для M2 или null если маппинг не найден
   */
  getOfferId(productId) {
    if (!productId || typeof productId !== 'string') {
      logger.warn('Невалидный product.id передан в getOfferId', { productId });
      return null;
    }

    if (!this.isLoaded) {
      throw new Error('Маппинги не загружены. Вызовите load() перед использованием.');
    }

    const offerId = this.productToOfferMap.get(productId);
    
    if (!offerId) {
      logger.debug('Маппинг не найден для product.id', { productId });
      // Записать метрику о ненайденном маппинге (Требование 9.2)
      mappingMetrics.recordNotFoundProductId(productId, 'productMappingStore');
      return null;
    }

    // Записать метрику об успешном lookup (Требование 9.2)
    mappingMetrics.recordSuccessfulProductIdLookup(productId, offerId);
    return offerId;
  }

  /**
   * Получить product.id по offerId (обратный маппинг)
   * Проверяет: Требование 8.1, 8.2
   * 
   * @param {string} offerId - Идентификатор товара в Яндекс.Маркет M2
   * @returns {string|null} product.id или null если маппинг не найден
   */
  getProductId(offerId) {
    if (!offerId || typeof offerId !== 'string') {
      logger.warn('Невалидный offerId передан в getProductId', { offerId });
      return null;
    }

    if (!this.isLoaded) {
      throw new Error('Маппинги не загружены. Вызовите load() перед использованием.');
    }

    const productId = this.offerToProductMap.get(offerId);
    
    if (!productId) {
      logger.debug('Обратный маппинг не найден для offerId', { offerId });
      // Записать метрику о ненайденном обратном маппинге (Требование 9.2)
      mappingMetrics.recordNotFoundOfferId(offerId, 'productMappingStore');
      return null;
    }

    // Записать метрику об успешном обратном lookup (Требование 9.2)
    mappingMetrics.recordSuccessfulOfferIdLookup(offerId, productId);
    return productId;
  }

  /**
   * Добавить маппинг в память (не сохраняет в файл автоматически)
   * 
   * @param {string} productId - UUID товара в МойСклад
   * @param {string} offerId - Идентификатор товара в Яндекс.Маркет M2
   */
  addMapping(productId, offerId) {
    if (!productId || typeof productId !== 'string') {
      throw new Error('Невалидный product.id');
    }
    if (!offerId || typeof offerId !== 'string') {
      throw new Error('Невалидный offerId');
    }

    this.productToOfferMap.set(productId, offerId);
    this.offerToProductMap.set(offerId, productId);

    logger.debug('Маппинг добавлен в память', { productId, offerId });
  }

  /**
   * Удалить маппинг из памяти (не сохраняет в файл автоматически)
   * 
   * @param {string} productId - UUID товара в МойСклад
   */
  removeMapping(productId) {
    if (!productId || typeof productId !== 'string') {
      throw new Error('Невалидный product.id');
    }

    const offerId = this.productToOfferMap.get(productId);
    
    if (offerId) {
      this.productToOfferMap.delete(productId);
      this.offerToProductMap.delete(offerId);
      logger.debug('Маппинг удален из памяти', { productId, offerId });
    }
  }

  /**
   * Получить список всех product.id
   * Проверяет: Требование 5.1
   * 
   * @returns {string[]} Массив всех product.id
   */
  getAllProductIds() {
    if (!this.isLoaded) {
      throw new Error('Маппинги не загружены. Вызовите load() перед использованием.');
    }

    return Array.from(this.productToOfferMap.keys());
  }

  /**
   * Получить список всех offerId
   * Проверяет: Требование 2.4
   * 
   * @returns {string[]} Массив всех offerId
   */
  getAllOfferIds() {
    if (!this.isLoaded) {
      throw new Error('Маппинги не загружены. Вызовите load() перед использованием.');
    }

    return Array.from(this.offerToProductMap.keys());
  }

  /**
   * Получить статистику маппинга
   * Проверяет: Требование 9.5
   * 
   * @returns {Object} Статистика с количеством маппингов и датой загрузки
   */
  getStats() {
    return {
      totalMappings: this.productToOfferMap.size,
      lastLoaded: this.lastLoaded,
      isLoaded: this.isLoaded,
      filePath: this.filePath
    };
  }
}

module.exports = ProductMappingStore;
