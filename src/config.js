require('dotenv').config();

class Config {
  constructor() {
    this.PORT = process.env.PORT || 3000;
    this.YANDEX_CAMPAIGN_ID = process.env.YANDEX_CAMPAIGN_ID;
    this.YANDEX_TOKEN = process.env.YANDEX_TOKEN;
    this.MS_TOKEN = process.env.MS_TOKEN;
    this.MS_BASE = process.env.MS_BASE || 'https://api.moysklad.ru/api/remap/1.2';
    this.STOCK_SYNC_INTERVAL_MINUTES = parseInt(process.env.SYNC_INTERVAL_MINUTES || '10', 10);
    this.ORDER_POLL_INTERVAL_MINUTES = parseInt(process.env.ORDER_POLL_INTERVAL_MINUTES || '5', 10);
    this.LOG_LEVEL = process.env.LOG_LEVEL || 'info';
    
    // Product mapping configuration
    this.PRODUCT_MAPPING_FILE = process.env.PRODUCT_MAPPING_FILE || './data/product-mappings.json';
    
    this.validate();
  }

  validate() {
    const required = [
      'YANDEX_CAMPAIGN_ID',
      'YANDEX_TOKEN',
      'MS_TOKEN'
    ];

    const missing = required.filter(key => !this[key]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required configuration: ${missing.join(', ')}. ` +
        `Please set these environment variables.`
      );
    }

    // Validate intervals
    if (this.STOCK_SYNC_INTERVAL_MINUTES < 1) {
      throw new Error('STOCK_SYNC_INTERVAL_MINUTES must be at least 1 minute');
    }

    if (this.ORDER_POLL_INTERVAL_MINUTES < 1) {
      throw new Error('ORDER_POLL_INTERVAL_MINUTES must be at least 1 minute');
    }

    // Validate log level
    const validLogLevels = ['error', 'warn', 'info', 'debug'];
    if (!validLogLevels.includes(this.LOG_LEVEL)) {
      throw new Error(
        `Invalid LOG_LEVEL: ${this.LOG_LEVEL}. ` +
        `Must be one of: ${validLogLevels.join(', ')}`
      );
    }
  }

  // Sanitize config for logging (remove credentials)
  toSafeObject() {
    return {
      PORT: this.PORT,
      MS_BASE: this.MS_BASE,
      STOCK_SYNC_INTERVAL_MINUTES: this.STOCK_SYNC_INTERVAL_MINUTES,
      ORDER_POLL_INTERVAL_MINUTES: this.ORDER_POLL_INTERVAL_MINUTES,
      LOG_LEVEL: this.LOG_LEVEL,
      YANDEX_CAMPAIGN_ID: this.YANDEX_CAMPAIGN_ID,
      PRODUCT_MAPPING_FILE: this.PRODUCT_MAPPING_FILE,
      // Credentials are excluded
      YANDEX_TOKEN: '[REDACTED]',
      MS_TOKEN: '[REDACTED]'
    };
  }
}

module.exports = new Config();