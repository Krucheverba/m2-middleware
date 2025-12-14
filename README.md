# M2 Middleware

Middleware для интеграции между МойСклад и Яндекс.Маркет (M2).

## Архитектура: Файловый маппинг product.id → offerId

```
┌─────────────────────────────────────────────────────────────┐
│                  МойСклад (единая база)                      │
│                                                              │
│  Товар: product.id = "f8a2da33-bf0a-11ef-0a80-17e3..."      │
│         product.offerId = "8100-X-clean-EFE-5w-30-5L"       │
└─────────────────────────────────────────────────────────────┘
           │                                    │
           │ Встроенная                         │ Webhook
           │ интеграция                         │ (product.id)
           ▼                                    ▼
    ┌──────────┐                         ┌──────────────────┐
    │ M1       │                         │ Middleware       │
    │          │                         │                  │
    │ offerId: │                         │ Mapping Table:   │
    │ "8100-   │                         │ product.id →     │
    │  X-clean"│                         │ offerId          │
    └──────────┘                         │                  │
           │                             │ "f8a2da33..." →  │
           │                             │ "8100-X-clean_   │
           │                             │  DBSA"           │
           ▼                             └──────────────────┘
    Яндекс M1                                    │
    Campaign ID: XXX                             ▼
                                          Яндекс M2
                                          Campaign ID: YYY
                                          offerId: "8100-X-clean_DBSA"
```

### Принципы

1. **Файловый маппинг**: Используется `data/product-mappings.json` для связи `product.id ↔ offerId`
   - Полная изоляция M1 и M2 - разные offerId для одного товара
   - Webhook от МойСклад содержит только product.id
   
2. **МойСклад → M2**: Только остатки (offerId + количество)
   - M2 НЕ видит product.id, названия товаров, цены
   
3. **M2 → МойСклад**: Только заказы (резервирование и продажи)
   - МойСклад НЕ видит внутреннюю структуру M2

4. **Изоляция данных**: Системы не знают о внутренностях друг друга

5. **Маппинг на границе**: Преобразование product.id ↔ offerId происходит в middleware

## Компоненты

- **ProductMappingStore** - Управление файловым хранилищем маппинга product.id → offerId
- **MapperService** - Маппинг между product.id и offerId для M2
- **StockService** - Синхронизация остатков МойСклад → M2
- **OrderService** - Перенос заказов M2 → МойСклад
- **MoySkladClient** - API клиент для МойСклад
- **YandexClient** - API клиент для Яндекс.Маркет
- **MigrationService** - Миграция данных из атрибутов в файловый маппинг

## Документация

- [Архитектура потоков данных](docs/architecture-data-flow.md)
- [Руководство по файловому маппингу товаров](docs/product-mapping-guide.md)
- [Синхронизация остатков с минимизацией данных](docs/stock-sync-privacy.md)
- [Руководство по MapperService](docs/mapper-service-usage.md)
- [Руководство по ProductMappingStore](docs/product-mapping-store-usage.md)

## Быстрый старт

### Установка

```bash
npm install
```

### Конфигурация

Создайте файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Настройте переменные окружения:

```env
PORT=3000

# Яндекс.Маркет API Configuration
YANDEX_CAMPAIGN_ID=your-campaign-id

# API-key токен (новый формат, рекомендуется)
# Получите в личном кабинете: API и модули → Токены авторизации → Создать
# Формат: ACMA:xxxxx:xxxxx
# Документация: https://yandex.ru/dev/market/partner-api/doc/ru/concepts/api-key
YANDEX_TOKEN=ACMA:your-api-key-here

# МойСклад API Configuration
MS_TOKEN=your-moysklad-token
MS_BASE=https://api.moysklad.ru/api/remap/1.2

# Sync Configuration
SYNC_INTERVAL_MINUTES=10
ORDER_POLL_INTERVAL_MINUTES=5
LOG_LEVEL=error

# Product Mapping Configuration
PRODUCT_MAPPING_FILE=./data/product-mappings.json
ENABLE_MIGRATION=false
MIGRATION_BACKUP_DIR=./data/backups
```

### Получение API-key токена Яндекс.Маркет

1. Войдите в личный кабинет Яндекс.Маркет
2. Перейдите в раздел **"API и модули"**
3. В блоке **"Токены авторизации"** нажмите **"Создать"**
4. Укажите уникальное название токена
5. Выберите необходимые доступы (управление остатками, получение заказов)
6. Нажмите **"Создать"**
7. Скопируйте полученный токен в формате `ACMA:xxxxx:xxxxx`

**Важно:** API-key токены рекомендуются вместо устаревших OAuth токенов. Подробнее в [документации Яндекс](https://yandex.ru/dev/market/partner-api/doc/ru/concepts/api-key).

### Настройка файла маппинга

#### Вариант 1: Миграция из атрибутов МойСклад (рекомендуется)

Если у вас уже есть товары с атрибутом `offerId` в МойСклад, используйте автоматическую миграцию:

```bash
# Проверка готовности к миграции
node scripts/check-migration-readiness.js

# Запуск миграции с резервной копией и валидацией
node scripts/migrate-to-file-mapping.js --backup --validate
```

Подробное руководство: [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)

#### Вариант 2: Ручное создание файла маппинга

Создайте файл `data/product-mappings.json` на основе примера:

```bash
cp data/product-mappings.example.json data/product-mappings.json
```

Затем отредактируйте файл, добавив маппинги ваших товаров (см. [руководство](docs/product-mapping-guide.md)).

### Запуск

```bash
npm start
```

Сервер запустится на порту 3000 (или указанном в `PORT`).

### Проверка работы

```bash
# Health check
curl http://localhost:3000/health
```

## Endpoints

### Health Check

**GET /health**

Проверка состояния сервера.

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 123.45
}
```

### Webhook от МойСклад

**POST /webhook/moysklad**

Обработка webhook событий от МойСклад о изменении остатков.

### Статистика маппинга

**GET /api/mapping/stats**

Получить полную статистику операций маппинга (успешные/неудачные lookup, пропущенные товары, последние ошибки).

**GET /api/mapping/summary**

Получить краткую статистику для dashboard (общее количество маппингов, процент успешных операций).

Подробная документация: [Mapping Metrics API](docs/mapping-metrics-api.md)

## Дополнительная документация

### Миграция и настройка
- [Руководство по миграции данных](MIGRATION_GUIDE.md) - Полное руководство по миграции маппингов
- [Руководство по маппингу товаров](docs/product-mapping-guide.md) - Работа с файлом маппинга
- [Статус миграции (задача 16)](TASK_16_MIGRATION_STATUS.md) - Текущий статус миграции

### Компоненты системы
- [Использование главного сервера](docs/server-usage.md)
- [Webhook endpoint](docs/webhook-endpoint-usage.md)
- [Cron планировщик](docs/cron-scheduler-usage.md)
- [Сервис остатков](docs/stock-service-usage.md)
- [Сервис заказов](docs/order-service-usage.md)
- [Логирование](docs/logging-guide.md)
- [Устойчивость к ошибкам](docs/resilience-guide.md)
- [Метрики маппинга](docs/mapping-metrics-api.md)

## Тестирование

```bash
# Интеграционный тест сервера
node test-server-integration.js

# Тест MapperService
node test-mapper.js

# Тест StockService
node test-stock-service.js

# Тест OrderService
node test-order-service.js

# Тест Webhook endpoint
node test-webhook-simple.js

# Тест Cron планировщика
node test-cron-scheduler.js
```

## Мониторинг

### Логи

Логи записываются в:
- `logs/combined.log` - все логи
- `logs/error.log` - только ошибки

### Уровни логирования

- `error` - только ошибки (по умолчанию)
- `warn` - предупреждения и ошибки
- `info` - информационные сообщения
- `debug` - детальная отладочная информация

## Graceful Shutdown

Сервер корректно обрабатывает сигналы завершения (SIGTERM, SIGINT):

1. Останавливаются все cron jobs
2. Закрывается HTTP сервер
3. Ожидается завершение текущих запросов (до 10 секунд)
4. Процесс завершается

## Требования

- Node.js 18+
- npm 8+
- Доступ к API МойСклад
- Доступ к API Яндекс.Маркет
- Файл маппинга `data/product-mappings.json` (см. [руководство](docs/product-mapping-guide.md))

## Лицензия

ISC
