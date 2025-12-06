const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger');

/**
 * MigrationService - Сервис для миграции данных из атрибутов МойСклад в файловое хранилище
 * 
 * Выполняет миграцию маппинга product.id → offerId из кастомных атрибутов МойСклад
 * в файловое хранилище для обеспечения изоляции M1 и M2.
 * 
 * Проверяет: Требования 10.1, 10.2, 10.3, 10.4, 10.5
 */
class MigrationService {
  constructor(moySkladClient, productMappingStore) {
    this.moySkladClient = moySkladClient;
    this.productMappingStore = productMappingStore;
    this.backupDir = './data/backups';
  }

  /**
   * Мигрировать данные из атрибута offerId в файл
   * Проверяет: Требования 10.1, 10.2, 10.3, 10.4
   * 
   * @returns {Promise<Object>} Статистика миграции
   */
  async migrateFromAttributes() {
    logger.info('Начало миграции маппингов из атрибутов МойСклад в файл');
    
    const stats = {
      totalProducts: 0,
      migratedMappings: 0,
      skippedProducts: 0,
      errors: [],
      startTime: new Date(),
      endTime: null
    };

    try {
      // Шаг 1: Получить все товары с атрибутами из МойСклад (Требование 10.1)
      logger.info('Получение товаров с атрибутами из МойСклад');
      
      const products = await this._fetchProductsWithAttributes();
      stats.totalProducts = products.length;
      
      logger.info(`Получено ${products.length} товаров из МойСклад`);

      // Шаг 2: Извлечь маппинги product.id → offerId (Требование 10.2)
      logger.info('Извлечение маппингов product.id → offerId из атрибутов');
      
      const mappings = new Map();
      
      for (const product of products) {
        try {
          const productId = product.id;
          const offerId = this._extractOfferIdFromAttributes(product);
          
          if (offerId) {
            mappings.set(productId, offerId);
            stats.migratedMappings++;
            
            logger.debug('Маппинг извлечен', {
              productId,
              productName: product.name,
              offerId
            });
          } else {
            stats.skippedProducts++;
            logger.debug('Товар пропущен - нет атрибута offerId', {
              productId,
              productName: product.name
            });
          }
        } catch (error) {
          stats.skippedProducts++;
          stats.errors.push({
            productId: product.id,
            productName: product.name,
            error: error.message
          });
          
          logger.warn('Ошибка при обработке товара', {
            productId: product.id,
            productName: product.name,
            error: error.message
          });
        }
      }

      logger.info('Маппинги извлечены', {
        migratedMappings: stats.migratedMappings,
        skippedProducts: stats.skippedProducts
      });

      // Шаг 3: Сохранить маппинги в файл через ProductMappingStore (Требование 10.3)
      logger.info('Сохранение маппингов в файл');
      
      await this.productMappingStore.save(mappings);
      
      logger.info('Маппинги успешно сохранены в файл', {
        filePath: this.productMappingStore.filePath,
        count: mappings.size
      });

      stats.endTime = new Date();
      const durationMs = stats.endTime - stats.startTime;

      logger.info('Миграция завершена успешно', {
        totalProducts: stats.totalProducts,
        migratedMappings: stats.migratedMappings,
        skippedProducts: stats.skippedProducts,
        errorsCount: stats.errors.length,
        durationMs
      });

      return stats;

    } catch (error) {
      stats.endTime = new Date();
      
      logger.error('Критическая ошибка при миграции', {
        error: error.message,
        stack: error.stack,
        stats
      });
      
      throw error;
    }
  }

  /**
   * Получить товары с атрибутами из МойСклад
   * @private
   */
  async _fetchProductsWithAttributes() {
    try {
      // Получаем товары с expand=attributes для чтения старых данных
      const params = {
        limit: 1000,
        expand: 'attributes'
      };
      
      const response = await this.moySkladClient.client.get('/entity/product', { params });
      return response.data.rows || [];
      
    } catch (error) {
      logger.error('Ошибка при получении товаров с атрибутами', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Извлечь offerId из атрибутов товара
   * @private
   */
  _extractOfferIdFromAttributes(product) {
    if (!product.attributes || !Array.isArray(product.attributes)) {
      return null;
    }

    // Ищем атрибут с именем 'offerId'
    const offerIdAttribute = product.attributes.find(attr => 
      attr.name === 'offerId'
    );

    if (!offerIdAttribute || !offerIdAttribute.value) {
      return null;
    }

    return offerIdAttribute.value;
  }

  /**
   * Создать резервную копию текущего файла маппинга
   * Проверяет: Требование 10.5
   * 
   * @returns {Promise<string>} Путь к файлу резервной копии
   */
  async backupCurrentMappings() {
    logger.info('Создание резервной копии текущего файла маппинга');

    try {
      const sourceFile = this.productMappingStore.filePath;
      
      // Проверить существует ли файл маппинга
      try {
        await fs.access(sourceFile);
      } catch (error) {
        if (error.code === 'ENOENT') {
          logger.info('Файл маппинга не существует, резервная копия не требуется');
          return null;
        }
        throw error;
      }

      // Создать директорию для резервных копий
      await fs.mkdir(this.backupDir, { recursive: true });

      // Создать имя файла резервной копии с timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `product-mappings-backup-${timestamp}.json`;
      const backupFilePath = path.join(this.backupDir, backupFileName);

      // Скопировать файл
      await fs.copyFile(sourceFile, backupFilePath);

      logger.info('Резервная копия создана успешно', {
        sourceFile,
        backupFile: backupFilePath
      });

      return backupFilePath;

    } catch (error) {
      logger.logFileError(
        'Не удалось создать резервную копию файла маппинга',
        this.productMappingStore.filePath,
        'backup',
        error
      );
      throw error;
    }
  }

  /**
   * Валидировать маппинги в файле
   * Проверяет: Требование 10.4
   * 
   * @returns {Promise<Object>} Результат валидации
   */
  async validateMappings() {
    logger.info('Валидация маппингов в файле');

    const validation = {
      isValid: true,
      totalMappings: 0,
      validMappings: 0,
      invalidMappings: [],
      duplicateOfferIds: [],
      emptyValues: []
    };

    try {
      // Загрузить файл маппинга
      const fileContent = await fs.readFile(this.productMappingStore.filePath, 'utf8');
      const data = JSON.parse(fileContent);

      if (!data.mappings || typeof data.mappings !== 'object') {
        validation.isValid = false;
        logger.error('Невалидная структура файла маппинга: отсутствует поле mappings');
        return validation;
      }

      const mappings = data.mappings;
      validation.totalMappings = Object.keys(mappings).length;

      // Проверка на дубликаты offerId
      const offerIdCounts = new Map();

      for (const [productId, offerId] of Object.entries(mappings)) {
        // Проверка на пустые значения
        if (!productId || !offerId) {
          validation.emptyValues.push({ productId, offerId });
          validation.isValid = false;
          continue;
        }

        // Проверка формата UUID для productId
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(productId)) {
          validation.invalidMappings.push({
            productId,
            offerId,
            reason: 'Невалидный формат product.id (не UUID)'
          });
          validation.isValid = false;
          continue;
        }

        // Проверка на непустой offerId
        if (typeof offerId !== 'string' || offerId.trim().length === 0) {
          validation.invalidMappings.push({
            productId,
            offerId,
            reason: 'Пустой или невалидный offerId'
          });
          validation.isValid = false;
          continue;
        }

        // Подсчет использования offerId
        offerIdCounts.set(offerId, (offerIdCounts.get(offerId) || 0) + 1);

        validation.validMappings++;
      }

      // Проверка на дубликаты offerId
      for (const [offerId, count] of offerIdCounts.entries()) {
        if (count > 1) {
          validation.duplicateOfferIds.push({ offerId, count });
          validation.isValid = false;
        }
      }

      // Логирование результатов валидации
      if (validation.isValid) {
        logger.info('Валидация маппингов успешна', {
          totalMappings: validation.totalMappings,
          validMappings: validation.validMappings
        });
      } else {
        logger.error('Валидация маппингов обнаружила ошибки', {
          totalMappings: validation.totalMappings,
          validMappings: validation.validMappings,
          invalidMappingsCount: validation.invalidMappings.length,
          duplicateOfferIdsCount: validation.duplicateOfferIds.length,
          emptyValuesCount: validation.emptyValues.length
        });
      }

      return validation;

    } catch (error) {
      validation.isValid = false;
      
      logger.logFileError(
        'Ошибка при валидации файла маппинга',
        this.productMappingStore.filePath,
        'validate',
        error
      );
      
      throw error;
    }
  }
}

module.exports = MigrationService;
