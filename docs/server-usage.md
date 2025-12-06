# Главный сервер M2 Middleware

## Обзор

Главный сервер M2 Middleware объединяет все компоненты системы и обеспечивает:

- Инициализацию конфигурации и логирования
- Создание и настройку всех API клиентов и сервисов
- Запуск HTTP сервера для обработки webhook событий
- Планирование периодических задач (cron jobs)
- Graceful shutdown при завершении работы
- Health check endpoint для мониторинга

**Проверяет: Требование 7.1**

## Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                    Главный сервер                        │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │   Config   │  │   Logger   │  │  Express   │        │
│  └────────────┘  └────────────┘  └────────────┘        │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │              API Clients                        │    │
│  │  • MoySkladClient                              │    │
│  │  • YandexClient                                │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │              Services                           │    │
│  │  • MapperService                               │    │
│  │  • StockService                                │    │
│  │  • OrderService                                │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │              Scheduler                          │    │
│  │  • Stock Sync (каждые N минут)                 │    │
│  │  • Order Polling (каждые M минут)              │    │
│  │  • Shipment Polling (каждые M минут)           │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Запуск сервера

### Через npm

```bash
npm start
```

### Напрямую через Node.js

```bash
node src/server.js
```

### С переменными окружения

```bash
PORT=3000 \
YANDEX_CAMPAIGN_ID=your-campaign-id \
YANDEX_TOKEN=your-token \
MS_TOKEN=your-moysklad-token \
MS_BASE=https://api.moysklad.ru/api/remap/1.2 \
STOCK_SYNC_INTERVAL_MINUTES=10 \
ORDER_POLL_INTERVAL_MINUTES=5 \
LOG_LEVEL=info \
node src/server.js
```

## Конфигурация

Все параметры настраиваются через переменные окружения:

| Переменная | Описание | Обязательная | Значение по умолчанию |
|-----------|----------|--------------|----------------------|
| `PORT` | Порт HTTP сервера | Нет | 3000 |
| `YANDEX_CAMPAIGN_ID` | ID кампании Яндекс.Маркет | Да | - |
| `YANDEX_TOKEN` | API токен Яндекс.Маркет | Да | - |
| `MS_TOKEN` | API токен МойСклад | Да | - |
| `MS_BASE` | Базовый URL API МойСклад | Нет | https://api.moysklad.ru/api/remap/1.2 |
| `STOCK_SYNC_INTERVAL_MINUTES` | Интервал синхронизации остатков | Нет | 10 |
| `ORDER_POLL_INTERVAL_MINUTES` | Интервал polling заказов | Нет | 5 |
| `LOG_LEVEL` | Уровень логирования | Нет | error |

## Endpoints

### Health Check

**GET /health**

Проверка состояния сервера.

**Ответ:**
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

**Заголовки:**
- `Content-Type: application/json`
- `User-Agent: MoySklad-Webhook`

**Тело запроса:**
```json
{
  "action": "UPDATE",
  "entityType": "product",
  "events": [
    {
      "meta": {
        "href": "https://api.moysklad.ru/api/remap/1.2/entity/product/...",
        "type": "product"
      }
    }
  ]
}
```

**Ответ:**
```json
{
  "status": "accepted",
  "message": "Webhook received and processing"
}
```

## Процесс запуска

1. **Загрузка конфигурации**
   - Чтение переменных окружения
   - Валидация обязательных параметров
   - Инициализация logger

2. **Создание API клиентов**
   - MoySkladClient для работы с МойСклад API
   - YandexClient для работы с Яндекс.Маркет API

3. **Создание сервисов**
   - MapperService для маппинга SKU
   - StockService для синхронизации остатков
   - OrderService для переноса заказов и отгрузок

4. **Инициализация MapperService**
   - Получение ID атрибута offerId_M2
   - Загрузка маппингов товаров из МойСклад

5. **Запуск Express сервера**
   - Настройка middleware
   - Регистрация маршрутов
   - Запуск HTTP сервера

6. **Запуск cron планировщика**
   - Синхронизация остатков (каждые N минут)
   - Polling заказов (каждые M минут)
   - Polling отгрузок (каждые M минут)

7. **Готовность к работе**
   - Сервер слушает входящие запросы
   - Cron jobs выполняются по расписанию

## Graceful Shutdown

Сервер корректно обрабатывает сигналы завершения:

- **SIGTERM** - завершение от системы
- **SIGINT** - Ctrl+C в терминале

При получении сигнала:

1. Останавливаются все cron jobs
2. Закрывается HTTP сервер (перестает принимать новые соединения)
3. Ожидается завершение текущих запросов (до 10 секунд)
4. Процесс завершается

## Мониторинг

### Health Check

Используйте endpoint `/health` для проверки состояния сервера:

```bash
curl http://localhost:3000/health
```

### Логи

Логи записываются в:
- `logs/combined.log` - все логи
- `logs/error.log` - только ошибки

Уровни логирования:
- `error` - только ошибки (по умолчанию)
- `warn` - предупреждения и ошибки
- `info` - информационные сообщения
- `debug` - детальная отладочная информация

### Метрики

Сервер логирует:
- Время запуска
- Количество загруженных маппингов
- Выполнение cron jobs
- Обработку webhook событий
- Ошибки API вызовов

## Обработка ошибок

### Ошибки при запуске

Если сервер не может запуститься:
- Проверьте переменные окружения
- Проверьте доступность API МойСклад
- Проверьте наличие атрибута offerId_M2 в МойСклад

Сервер завершится с кодом 1 и выведет ошибку в лог.

### Ошибки во время работы

Сервер устойчив к ошибкам:
- Ошибки API не останавливают сервер
- Ошибки в cron jobs не останавливают следующие выполнения
- Ошибки webhook обрабатываются и логируются

## Примеры использования

### Запуск в production

```bash
# Создать .env файл с production конфигурацией
cp .env.example .env
nano .env

# Запустить сервер
npm start
```

### Запуск в development

```bash
# Использовать .env.test для разработки
cp .env.test .env

# Установить уровень логирования
echo "LOG_LEVEL=debug" >> .env

# Запустить сервер
npm start
```

### Запуск с PM2

```bash
# Установить PM2
npm install -g pm2

# Запустить сервер
pm2 start src/server.js --name m2-middleware

# Просмотр логов
pm2 logs m2-middleware

# Остановка
pm2 stop m2-middleware
```

### Запуск в Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
```

```bash
# Сборка образа
docker build -t m2-middleware .

# Запуск контейнера
docker run -d \
  --name m2-middleware \
  -p 3000:3000 \
  --env-file .env \
  m2-middleware
```

## Тестирование

### Интеграционный тест

```bash
node test-server-integration.js
```

Тест проверяет:
- ✓ Инициализацию конфигурации
- ✓ Создание всех компонентов
- ✓ Запуск HTTP сервера
- ✓ Работу health check endpoint
- ✓ Работу webhook endpoint
- ✓ Запуск cron планировщика
- ✓ Graceful shutdown

## Troubleshooting

### Сервер не запускается

**Проблема:** `Missing required configuration`

**Решение:** Проверьте что все обязательные переменные окружения установлены:
```bash
echo $YANDEX_CAMPAIGN_ID
echo $YANDEX_TOKEN
echo $MS_TOKEN
```

### Ошибка при загрузке маппингов

**Проблема:** `Атрибут offerId_M2 не найден`

**Решение:** Создайте пользовательский атрибут `offerId_M2` в МойСклад:
1. Перейдите в Настройки → Справочники → Товары
2. Добавьте дополнительное поле "offerId_M2" (тип: Строка)

### Webhook не работает

**Проблема:** Webhook события не обрабатываются

**Решение:**
1. Проверьте что сервер доступен из интернета
2. Настройте webhook в МойСклад на URL: `https://your-domain.com/webhook/moysklad`
3. Проверьте логи на наличие ошибок

### Cron jobs не выполняются

**Проблема:** Синхронизация не происходит

**Решение:**
1. Проверьте логи на наличие ошибок
2. Убедитесь что интервалы настроены корректно
3. Проверьте доступность API МойСклад и Яндекс.Маркет

## См. также

- [Конфигурация](../README.md#конфигурация)
- [Архитектура](./architecture-data-flow.md)
- [Webhook endpoint](./webhook-endpoint-usage.md)
- [Cron планировщик](./cron-scheduler-usage.md)
- [Логирование](./logging-guide.md)
