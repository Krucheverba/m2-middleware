const cron = require('cron');
const logger = require('../logger');

/**
 * CronScheduler - Планировщик для периодических задач
 * 
 * Управляет:
 * - Синхронизацией остатков из МойСклад в M2
 * - Polling заказов из M2
 * - Polling отгруженных заказов из M2
 * 
 * Проверяет: Требования 5.3, 5.4, 5.5
 */
class CronScheduler {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * Запланировать синхронизацию остатков
   * Проверяет: Требования 5.3, 5.4, 5.5
   * 
   * @param {number} intervalMinutes - Интервал в минутах
   * @param {Function} syncFunction - Функция синхронизации (async)
   * @returns {void}
   */
  scheduleStockSync(intervalMinutes, syncFunction) {
    try {
      // Валидация параметров
      if (!intervalMinutes || intervalMinutes < 1) {
        throw new Error('Интервал синхронизации остатков должен быть не менее 1 минуты');
      }

      if (typeof syncFunction !== 'function') {
        throw new Error('syncFunction должна быть функцией');
      }

      // Создать cron выражение для интервала в минутах
      const cronExpression = `*/${intervalMinutes} * * * *`;

      logger.info('Планирование синхронизации остатков', {
        intervalMinutes,
        cronExpression
      });

      // Создать cron job с обработкой ошибок
      const job = new cron.CronJob(
        cronExpression,
        async () => {
          try {
            logger.info('Запуск cron job: синхронизация остатков');
            
            const startTime = Date.now();
            await syncFunction();
            const duration = Date.now() - startTime;
            
            logger.info('Cron job завершен: синхронизация остатков', {
              durationMs: duration
            });
          } catch (error) {
            // Обработка ошибок - логируем, но не останавливаем выполнение (Требование 5.5)
            logger.error('Ошибка при выполнении cron job синхронизации остатков', {
              errorType: 'CRON_ERROR',
              error: error.message,
              stack: error.stack
            });
            // Продолжаем выполнение - следующий запуск произойдет по расписанию
          }
        },
        null, // onComplete
        true, // start immediately
        'Europe/Moscow' // timezone
      );

      // Сохранить job для возможности остановки
      this.jobs.set('stockSync', job);

      logger.info('Синхронизация остатков запланирована', {
        intervalMinutes,
        nextRun: job.nextDate().toISO()
      });

    } catch (error) {
      logger.error('Не удалось запланировать синхронизацию остатков', {
        errorType: 'SCHEDULER_ERROR',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Запланировать polling заказов
   * Проверяет: Требования 5.3, 5.4, 5.5
   * 
   * @param {number} intervalMinutes - Интервал в минутах
   * @param {Function} pollFunction - Функция polling (async)
   * @returns {void}
   */
  scheduleOrderPolling(intervalMinutes, pollFunction) {
    try {
      // Валидация параметров
      if (!intervalMinutes || intervalMinutes < 1) {
        throw new Error('Интервал polling заказов должен быть не менее 1 минуты');
      }

      if (typeof pollFunction !== 'function') {
        throw new Error('pollFunction должна быть функцией');
      }

      // Создать cron выражение для интервала в минутах
      const cronExpression = `*/${intervalMinutes} * * * *`;

      logger.info('Планирование polling заказов', {
        intervalMinutes,
        cronExpression
      });

      // Создать cron job с обработкой ошибок
      const job = new cron.CronJob(
        cronExpression,
        async () => {
          try {
            logger.info('Запуск cron job: polling заказов');
            
            const startTime = Date.now();
            await pollFunction();
            const duration = Date.now() - startTime;
            
            logger.info('Cron job завершен: polling заказов', {
              durationMs: duration
            });
          } catch (error) {
            // Обработка ошибок - логируем, но не останавливаем выполнение (Требование 5.5)
            logger.error('Ошибка при выполнении cron job polling заказов', {
              errorType: 'CRON_ERROR',
              error: error.message,
              stack: error.stack
            });
            // Продолжаем выполнение - следующий запуск произойдет по расписанию
          }
        },
        null, // onComplete
        true, // start immediately
        'Europe/Moscow' // timezone
      );

      // Сохранить job для возможности остановки
      this.jobs.set('orderPolling', job);

      logger.info('Polling заказов запланирован', {
        intervalMinutes,
        nextRun: job.nextDate().toISO()
      });

    } catch (error) {
      logger.error('Не удалось запланировать polling заказов', {
        errorType: 'SCHEDULER_ERROR',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Запланировать polling отгруженных заказов
   * Проверяет: Требования 5.3, 5.4, 5.5
   * 
   * @param {number} intervalMinutes - Интервал в минутах
   * @param {Function} pollFunction - Функция polling (async)
   * @returns {void}
   */
  scheduleShipmentPolling(intervalMinutes, pollFunction) {
    try {
      // Валидация параметров
      if (!intervalMinutes || intervalMinutes < 1) {
        throw new Error('Интервал polling отгрузок должен быть не менее 1 минуты');
      }

      if (typeof pollFunction !== 'function') {
        throw new Error('pollFunction должна быть функцией');
      }

      // Создать cron выражение для интервала в минутах
      const cronExpression = `*/${intervalMinutes} * * * *`;

      logger.info('Планирование polling отгрузок', {
        intervalMinutes,
        cronExpression
      });

      // Создать cron job с обработкой ошибок
      const job = new cron.CronJob(
        cronExpression,
        async () => {
          try {
            logger.info('Запуск cron job: polling отгрузок');
            
            const startTime = Date.now();
            await pollFunction();
            const duration = Date.now() - startTime;
            
            logger.info('Cron job завершен: polling отгрузок', {
              durationMs: duration
            });
          } catch (error) {
            // Обработка ошибок - логируем, но не останавливаем выполнение (Требование 5.5)
            logger.error('Ошибка при выполнении cron job polling отгрузок', {
              errorType: 'CRON_ERROR',
              error: error.message,
              stack: error.stack
            });
            // Продолжаем выполнение - следующий запуск произойдет по расписанию
          }
        },
        null, // onComplete
        true, // start immediately
        'Europe/Moscow' // timezone
      );

      // Сохранить job для возможности остановки
      this.jobs.set('shipmentPolling', job);

      logger.info('Polling отгрузок запланирован', {
        intervalMinutes,
        nextRun: job.nextDate().toISO()
      });

    } catch (error) {
      logger.error('Не удалось запланировать polling отгрузок', {
        errorType: 'SCHEDULER_ERROR',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Остановить все cron jobs
   * Проверяет: Требования 5.5
   * 
   * @returns {void}
   */
  stopAll() {
    try {
      logger.info('Остановка всех cron jobs', {
        jobCount: this.jobs.size
      });

      for (const [name, job] of this.jobs.entries()) {
        try {
          job.stop();
          logger.info('Cron job остановлен', { name });
        } catch (error) {
          logger.error('Ошибка при остановке cron job', {
            errorType: 'SCHEDULER_ERROR',
            name,
            error: error.message
          });
        }
      }

      this.jobs.clear();

      logger.info('Все cron jobs остановлены');

    } catch (error) {
      logger.error('Ошибка при остановке cron jobs', {
        errorType: 'SCHEDULER_ERROR',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Получить статус всех cron jobs
   * 
   * @returns {Array} Массив с информацией о jobs
   */
  getStatus() {
    const status = [];

    for (const [name, job] of this.jobs.entries()) {
      status.push({
        name,
        running: job.running,
        nextRun: job.running ? job.nextDate().toISO() : null
      });
    }

    return status;
  }

  /**
   * Остановить конкретный cron job
   * 
   * @param {string} name - Имя job ('stockSync', 'orderPolling', 'shipmentPolling')
   * @returns {boolean} true если job был остановлен, false если не найден
   */
  stop(name) {
    const job = this.jobs.get(name);

    if (!job) {
      logger.warn('Cron job не найден', { name });
      return false;
    }

    try {
      job.stop();
      this.jobs.delete(name);
      logger.info('Cron job остановлен', { name });
      return true;
    } catch (error) {
      logger.error('Ошибка при остановке cron job', {
        errorType: 'SCHEDULER_ERROR',
        name,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = CronScheduler;
