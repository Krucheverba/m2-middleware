# Design Document

## Overview

Миграция с OAuth токена на API-key токен для Яндекс.Маркет API. Изменения минимальны и затрагивают только формат заголовка авторизации в YandexClient. Все остальные компоненты системы остаются без изменений.

## Architecture

Изменения касаются только слоя API клиента:

```
┌─────────────────────────────────────────┐
│         Application Layer               │
│  (Services, Routes, Scheduler)          │
└──────────────┬──────────────────────────┘
               │
               │ (no changes)
               │
┌──────────────▼──────────────────────────┐
│         YandexClient                    │
│  ┌────────────────────────────────┐    │
│  │ Authorization Header           │    │
│  │ OLD: Bearer {token}            │    │
│  │ NEW: Api-Key {token}           │◄───┼─── CHANGE HERE
│  └────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

## Components and Interfaces

### YandexClient

Единственный компонент, требующий изменений:

**Текущая реализация:**
```javascript
headers: {
  'Authorization': `Bearer ${this.token}`,
  'Content-Type': 'application/json'
}
```

**Новая реализация:**
```javascript
headers: {
  'Api-Key': this.token,
  'Content-Type': 'application/json'
}
```

### Config

Конфигурация остается без изменений. Переменная `YANDEX_TOKEN` теперь содержит API-key вместо OAuth токена.

## Data Models

Изменений в моделях данных нет. Формат токена меняется, но это прозрачно для всех компонентов кроме YandexClient.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: API-key header format
*For any* HTTP request to Yandex Market API, the request headers should contain `Api-Key` header with the token value, and should NOT contain `Authorization: Bearer` header
**Validates: Requirements 1.1, 1.2**

### Property 2: Backward compatibility of API methods
*For any* existing API method (updateStocks, getOrders, getOrder), calling it with API-key token should produce the same result as with OAuth token (modulo authentication)
**Validates: Requirements 1.4**

## Error Handling

Обработка ошибок остается без изменений. Существующая логика retry и rate limiting продолжает работать:

- 429 Too Many Requests - retry с экспоненциальной задержкой
- 5xx Server Errors - retry с экспоненциальной задержкой
- 401 Unauthorized - новая ошибка может возникнуть при неверном API-key

## Testing Strategy

### Unit Tests

1. Проверка формата заголовков в YandexClient
   - Убедиться что используется `Api-Key` заголовок
   - Убедиться что НЕ используется `Authorization: Bearer`

2. Проверка инициализации клиента
   - Токен корректно читается из конфигурации
   - Axios client создается с правильными заголовками

### Property-Based Tests

Используем существующую библиотеку для property-based testing (fast-check для Node.js).

**Property 1: API-key header format**
- Генерируем различные токены формата API-key
- Создаем YandexClient с каждым токеном
- Проверяем что заголовок `Api-Key` присутствует и содержит токен
- Проверяем что заголовок `Authorization` отсутствует

**Property 2: Backward compatibility**
- Используем mock для axios
- Вызываем все публичные методы YandexClient
- Проверяем что они выполняются без ошибок
- Проверяем что формат запросов не изменился (кроме заголовков)

### Integration Tests

1. Тест реального запроса к API с новым токеном
   - Выполнить запрос getOrders с API-key
   - Убедиться что запрос успешен

## Deployment Strategy

### Локальное тестирование

1. Обновить `.env` с новым API-key токеном (уже сделано)
2. Запустить unit и integration тесты
3. Запустить сервер локально и проверить работу

### Деплой на сервер

Использовать существующий скрипт `deploy-token-update.sh` с модификациями:

```bash
#!/bin/bash
# Обновление на новый API-key токен

# 1. Обновить код
ssh user@server "cd /path/to/app && git pull"

# 2. Обновить .env с новым токеном
ssh user@server "cd /path/to/app && echo 'YANDEX_TOKEN=ACMA:...' >> .env"

# 3. Перезапустить сервис
ssh user@server "pm2 restart moysklad-yandex-integration"

# 4. Проверить логи
ssh user@server "pm2 logs moysklad-yandex-integration --lines 50"
```

## Migration Steps

1. Обновить YandexClient для использования Api-Key заголовка
2. Обновить документацию и примеры
3. Запустить тесты локально
4. Задеплоить на сервер
5. Мониторить логи на наличие ошибок авторизации
