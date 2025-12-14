# ✅ Отчёт: Исправление логирования Winston

## Проблема
Winston логи не писались в файлы `logs/combined.log` и `logs/error.log`, хотя файлы были созданы.

## Причина
Функция `sanitizeLog()` в `src/logger.js` неправильно возвращала результат. Winston format должен возвращать модифицированный `info` объект, а не новый объект.

## Решение

### 1. Исправлен `src/logger.js`
```javascript
// БЫЛО (неправильно):
const sanitizeLog = winston.format((info) => {
  // ...
  return sanitize(info);  // ❌ Возвращает новый объект
});

// СТАЛО (правильно):
const sanitizeLog = winston.format((info) => {
  // ...
  const sanitized = sanitize(info);
  // Копируем все свойства обратно в info
  Object.keys(sanitized).forEach(key => {
    info[key] = sanitized[key];
  });
  return info;  // ✅ Возвращает модифицированный info
});
```

### 2. Добавлены абсолютные пути
```javascript
const path = require('path');
const fs = require('fs');

// Создаём директорию для логов если её нет
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Абсолютные пути к файлам логов
const errorLogPath = path.join(logDir, 'error.log');
const combinedLogPath = path.join(logDir, 'combined.log');
```

### 3. Добавлено логирование при инициализации
```javascript
console.log(`[Winston] Логи будут записываться в:`);
console.log(`  - Combined: ${combinedLogPath}`);
console.log(`  - Errors:   ${errorLogPath}`);
```

## Результат

### ✅ Логи теперь пишутся
```bash
$ ssh root@89.223.125.212 "tail -5 /root/m2-middleware/logs/combined.log"
{"level":"info","message":"Запуск M2 Middleware сервера","timestamp":"2025-12-07 09:01:10"}
{"level":"info","message":"Инициализация MapperService...","timestamp":"2025-12-07 09:01:10"}
{"level":"info","message":"Загрузка маппингов товаров из файла...","timestamp":"2025-12-07 09:01:10"}
{"level":"info","message":"Маппинги загружены успешно","timestamp":"2025-12-07 09:01:10"}
{"level":"info","message":"Сервер запущен на порту 3001","timestamp":"2025-12-07 09:01:10"}
```

### ✅ Логи ошибок пишутся
```bash
$ ssh root@89.223.125.212 "tail -3 /root/m2-middleware/logs/error.log"
{"level":"error","message":"Ошибка API Яндекс.Маркет Request failed with status code 403","timestamp":"2025-12-07 09:05:14"}
{"level":"error","message":"Ошибка при polling заказов","timestamp":"2025-12-07 09:05:14"}
{"level":"error","message":"Ошибка при polling отгруженных заказов","timestamp":"2025-12-07 09:05:14"}
```

## Обнаруженная проблема: YANDEX_TOKEN

Благодаря работающим логам обнаружена **критическая проблема**:

```
403 Forbidden - Access denied
endpoint: /campaigns/198473170/orders
```

**YANDEX_TOKEN в .env не имеет прав на Campaign ID 198473170**

### Решение
См. инструкцию в `FIX_YANDEX_TOKEN.md`

## Файлы изменены
- ✅ `src/logger.js` - исправлен sanitizeLog и добавлены абсолютные пути
- ✅ `deploy-logger-fix.sh` - скрипт для деплоя
- ✅ `diagnose-m2.sh` - улучшенный скрипт диагностики
- ✅ `FIX_YANDEX_TOKEN.md` - инструкция по исправлению токена

## Проверка
```bash
# Проверить что логи пишутся
ssh root@89.223.125.212 "tail -f /root/m2-middleware/logs/combined.log"

# Полная диагностика
./diagnose-m2.sh
```

## Следующие шаги
1. ✅ Winston логи работают
2. ⏳ Нужно обновить YANDEX_TOKEN (см. FIX_YANDEX_TOKEN.md)
3. ⏳ После обновления токена проверить polling заказов
4. ⏳ Создать тестовый заказ на M2 для проверки webhook
