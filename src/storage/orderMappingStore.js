const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger');

/**
 * OrderMappingStore - Файловое хранилище для маппинга заказов между M2 и МойСклад
 * 
 * Хранит маппинги в JSON формате с блокировкой файла для предотвращения конфликтов при одновременной записи.
 * Проверяет: Требования 8.1, 8.2, 8.4
 */
class OrderMappingStore {
  constructor(filePath = './data/order-mappings.json') {
    this.filePath = path.resolve(filePath);
    this.lockFilePath = `${this.filePath}.lock`;
    this.lockTimeout = 5000; // 5 секунд
    this.lockCheckInterval = 50; // Проверка каждые 50мс
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
   * Прочитать маппинги из файла
   * @private
   */
  async _readMappings() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(data);
      return parsed.mappings || [];
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Файл не существует, возвращаем пустой массив
        return [];
      }
      throw error;
    }
  }

  /**
   * Записать маппинги в файл
   * @private
   */
  async _writeMappings(mappings) {
    const data = JSON.stringify({ mappings }, null, 2);
    
    // Убедиться что директория существует
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    
    // Записать в файл
    await fs.writeFile(this.filePath, data, 'utf8');
  }

  /**
   * Сохранить маппинг заказа в файл
   * Проверяет: Требования 8.1, 8.4
   * 
   * @param {string} m2OrderId - ID заказа M2
   * @param {string} moySkladOrderId - ID заказа МойСклад
   * @returns {Promise<void>}
   */
  async save(m2OrderId, moySkladOrderId) {
    if (!m2OrderId || !moySkladOrderId) {
      throw new Error('Требуются оба параметра: m2OrderId и moySkladOrderId');
    }

    let lockAcquired = false;
    
    try {
      // Получить блокировку
      await this._acquireLock();
      lockAcquired = true;

      // Прочитать существующие маппинги
      const mappings = await this._readMappings();

      // Проверить существует ли уже маппинг (предотвращение дубликатов - Требование 8.4)
      const existingIndex = mappings.findIndex(m => m.m2OrderId === m2OrderId);
      
      if (existingIndex !== -1) {
        // Обновить существующий маппинг
        mappings[existingIndex] = {
          m2OrderId,
          moySkladOrderId,
          createdAt: mappings[existingIndex].createdAt,
          updatedAt: new Date().toISOString()
        };
        logger.info('Обновлен существующий маппинг заказа', { m2OrderId, moySkladOrderId });
      } else {
        // Добавить новый маппинг
        mappings.push({
          m2OrderId,
          moySkladOrderId,
          createdAt: new Date().toISOString()
        });
        logger.info('Сохранен новый маппинг заказа', { m2OrderId, moySkladOrderId });
      }

      // Записать обратно в файл
      await this._writeMappings(mappings);
      
    } catch (error) {
      logger.logFileError(
        'Не удалось сохранить маппинг заказа',
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
   * Получить ID заказа МойСклад по ID заказа M2
   * Проверяет: Требования 8.2
   * 
   * @param {string} m2OrderId - ID заказа M2
   * @returns {Promise<string|null>} ID заказа МойСклад или null если не найден
   */
  async get(m2OrderId) {
    if (!m2OrderId) {
      throw new Error('Требуется m2OrderId');
    }

    try {
      const mappings = await this._readMappings();
      const mapping = mappings.find(m => m.m2OrderId === m2OrderId);
      
      if (mapping) {
        return mapping.moySkladOrderId;
      }
      
      return null;
    } catch (error) {
      logger.logFileError(
        'Не удалось получить маппинг заказа',
        this.filePath,
        'get',
        error
      );
      throw error;
    }
  }

  /**
   * Проверить существует ли маппинг заказа
   * Проверяет: Требования 8.4
   * 
   * @param {string} m2OrderId - ID заказа M2
   * @returns {Promise<boolean>} True если маппинг существует
   */
  async exists(m2OrderId) {
    if (!m2OrderId) {
      throw new Error('Требуется m2OrderId');
    }

    try {
      const mappings = await this._readMappings();
      return mappings.some(m => m.m2OrderId === m2OrderId);
    } catch (error) {
      logger.logFileError(
        'Не удалось проверить существование маппинга заказа',
        this.filePath,
        'exists',
        error
      );
      throw error;
    }
  }

  /**
   * Загрузить все маппинги в память
   * 
   * @returns {Promise<Array>} Все маппинги заказов
   */
  async loadAll() {
    try {
      return await this._readMappings();
    } catch (error) {
      logger.logFileError(
        'Не удалось загрузить все маппинги заказов',
        this.filePath,
        'loadAll',
        error
      );
      throw error;
    }
  }
}

module.exports = OrderMappingStore;
