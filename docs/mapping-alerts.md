# Алерты для критических ошибок маппинга

Система мониторинга для отслеживания критических проблем с маппингом товаров.

## Критические алерты

### 1. Маппинги не загружены

**Условие:** `isLoaded === false`

**Серьезность:** CRITICAL

**Описание:** Файл маппинга не был загружен при старте системы. Все операции маппинга будут неудачными.

**Проверка:**
```bash
curl http://localhost:3000/api/mapping/summary | jq '.isLoaded'
```

**Действия:**
1. Проверить существование файла `data/product-mappings.json`
2. Проверить права доступа к файлу
3. Проверить логи на наличие ошибок загрузки
4. Проверить валидность JSON структуры файла
5. Перезапустить сервер после исправления

**Пример скрипта мониторинга:**
```bash
#!/bin/bash
IS_LOADED=$(curl -s http://localhost:3000/api/mapping/summary | jq -r '.isLoaded')

if [ "$IS_LOADED" != "true" ]; then
  echo "CRITICAL: Маппинги не загружены!"
  # Отправить уведомление
  send_alert "Маппинги не загружены" "CRITICAL"
fi
```

---

### 2. Высокий процент ошибок lookup

**Условие:** `successRate < 90%`

**Серьезность:** CRITICAL

**Описание:** Более 10% операций lookup завершаются неудачей. Это указывает на проблемы с целостностью маппинга.

**Проверка:**
```bash
# Проверить success rate для product.id → offerId
curl http://localhost:3000/api/mapping/stats | \
  jq '.metrics.lookups.productIdToOfferId.successRate'

# Проверить success rate для offerId → product.id
curl http://localhost:3000/api/mapping/stats | \
  jq '.metrics.lookups.offerIdToProductId.successRate'
```

**Действия:**
1. Проверить последние ошибки: `GET /api/mapping/stats` → `metrics.recentErrors`
2. Проверить целостность файла маппинга
3. Сравнить с резервной копией
4. Проверить логи на наличие ошибок валидации
5. При необходимости восстановить из резервной копии

**Пример скрипта мониторинга:**
```bash
#!/bin/bash
SUCCESS_RATE=$(curl -s http://localhost:3000/api/mapping/stats | \
  jq -r '.metrics.lookups.productIdToOfferId.successRate' | \
  sed 's/%//')

if (( $(echo "$SUCCESS_RATE < 90" | bc -l) )); then
  echo "CRITICAL: Success rate слишком низкий: $SUCCESS_RATE%"
  send_alert "Low success rate: $SUCCESS_RATE%" "CRITICAL"
fi
```

---

### 3. Большое количество пропущенных товаров

**Условие:** `totalSkipped > 100`

**Серьезность:** CRITICAL

**Описание:** Большое количество товаров пропускается из-за отсутствия маппинга. Это приводит к несинхронизированным остаткам и потере заказов.

**Проверка:**
```bash
curl http://localhost:3000/api/mapping/summary | jq '.totalSkipped'
```

**Действия:**
1. Получить список пропущенных товаров из логов
2. Проверить актуальность файла маппинга
3. Добавить недостающие маппинги
4. Запустить миграцию если нужно
5. Перезагрузить маппинги: перезапустить сервер

**Пример скрипта мониторинга:**
```bash
#!/bin/bash
TOTAL_SKIPPED=$(curl -s http://localhost:3000/api/mapping/summary | \
  jq -r '.totalSkipped')

if [ "$TOTAL_SKIPPED" -gt 100 ]; then
  echo "CRITICAL: Пропущено товаров: $TOTAL_SKIPPED"
  send_alert "Too many skipped items: $TOTAL_SKIPPED" "CRITICAL"
fi
```

---

## Предупреждающие алерты

### 4. Маппинги не обновлялись долго

**Условие:** `lastLoaded` старше 24 часов

**Серьезность:** WARNING

**Описание:** Маппинги не обновлялись более суток. Возможно устаревшие данные.

**Проверка:**
```bash
curl http://localhost:3000/api/mapping/summary | jq '.lastLoaded'
```

**Действия:**
1. Проверить процесс обновления маппингов
2. Проверить нужно ли обновить маппинги
3. Запустить миграцию если добавились новые товары
4. Обновить файл маппинга вручную если нужно

**Пример скрипта мониторинга:**
```bash
#!/bin/bash
LAST_LOADED=$(curl -s http://localhost:3000/api/mapping/summary | \
  jq -r '.lastLoaded')
LAST_LOADED_TS=$(date -d "$LAST_LOADED" +%s)
NOW_TS=$(date +%s)
DIFF_HOURS=$(( ($NOW_TS - $LAST_LOADED_TS) / 3600 ))

if [ "$DIFF_HOURS" -gt 24 ]; then
  echo "WARNING: Маппинги не обновлялись $DIFF_HOURS часов"
  send_alert "Mappings not updated for $DIFF_HOURS hours" "WARNING"
fi
```

---

### 5. Растущее количество notFound

**Условие:** `notFoundLookups` растет быстрее чем `successfulLookups`

**Серьезность:** WARNING

**Описание:** Количество ненайденных маппингов растет. Возможно добавились новые товары без маппинга.

**Проверка:**
```bash
# Сохранить текущие значения
curl http://localhost:3000/api/mapping/summary > /tmp/metrics_prev.json

# Подождать 5 минут
sleep 300

# Получить новые значения
curl http://localhost:3000/api/mapping/summary > /tmp/metrics_curr.json

# Сравнить рост
```

**Действия:**
1. Проверить логи на наличие новых product.id или offerId
2. Добавить недостающие маппинги
3. Проверить нужна ли миграция новых товаров

---

### 6. Высокая частота ошибок в определенном сервисе

**Условие:** `skipped.stock > 50` или `skipped.order > 20` или `skipped.webhook > 30`

**Серьезность:** WARNING

**Описание:** Один из сервисов пропускает много товаров.

**Проверка:**
```bash
curl http://localhost:3000/api/mapping/stats | \
  jq '.metrics.skipped'
```

**Действия:**
1. Проверить логи конкретного сервиса
2. Определить какие товары пропускаются
3. Добавить маппинги для этих товаров
4. Проверить корректность работы сервиса

---

## Интеграция с системами мониторинга

### Prometheus

Пример экспортера метрик для Prometheus:

```javascript
const express = require('express');
const app = express();

app.get('/metrics', async (req, res) => {
  const summary = await fetch('http://localhost:3000/api/mapping/summary')
    .then(r => r.json());
  
  const metrics = `
# HELP mapping_total Total number of mappings
# TYPE mapping_total gauge
mapping_total ${summary.totalMappings}

# HELP mapping_loaded Mapping loaded status (1=loaded, 0=not loaded)
# TYPE mapping_loaded gauge
mapping_loaded ${summary.isLoaded ? 1 : 0}

# HELP mapping_lookups_total Total number of lookup operations
# TYPE mapping_lookups_total counter
mapping_lookups_total ${summary.totalLookups}

# HELP mapping_lookups_successful Successful lookup operations
# TYPE mapping_lookups_successful counter
mapping_lookups_successful ${summary.successfulLookups}

# HELP mapping_lookups_not_found Lookup operations where mapping not found
# TYPE mapping_lookups_not_found counter
mapping_lookups_not_found ${summary.notFoundLookups}

# HELP mapping_skipped_total Total number of skipped items
# TYPE mapping_skipped_total counter
mapping_skipped_total ${summary.totalSkipped}
  `.trim();
  
  res.set('Content-Type', 'text/plain');
  res.send(metrics);
});

app.listen(9090);
```

### Grafana Dashboard

Пример запросов для Grafana:

```promql
# Success rate
(mapping_lookups_successful / mapping_lookups_total) * 100

# Skipped items rate
rate(mapping_skipped_total[5m])

# Alert: Mappings not loaded
mapping_loaded == 0

# Alert: Low success rate
(mapping_lookups_successful / mapping_lookups_total) * 100 < 90
```

---

## Автоматический мониторинг

### Cron job для проверки метрик

```bash
#!/bin/bash
# /etc/cron.d/mapping-metrics-monitor
# Запускать каждые 5 минут

*/5 * * * * /usr/local/bin/check-mapping-metrics.sh
```

### Скрипт проверки

```bash
#!/bin/bash
# /usr/local/bin/check-mapping-metrics.sh

API_URL="http://localhost:3000/api/mapping/summary"
ALERT_EMAIL="admin@example.com"

# Получить метрики
METRICS=$(curl -s "$API_URL")

# Проверить загрузку
IS_LOADED=$(echo "$METRICS" | jq -r '.isLoaded')
if [ "$IS_LOADED" != "true" ]; then
  echo "CRITICAL: Mappings not loaded" | mail -s "Mapping Alert" "$ALERT_EMAIL"
fi

# Проверить пропущенные товары
TOTAL_SKIPPED=$(echo "$METRICS" | jq -r '.totalSkipped')
if [ "$TOTAL_SKIPPED" -gt 100 ]; then
  echo "CRITICAL: Too many skipped items: $TOTAL_SKIPPED" | \
    mail -s "Mapping Alert" "$ALERT_EMAIL"
fi

# Проверить success rate
TOTAL_LOOKUPS=$(echo "$METRICS" | jq -r '.totalLookups')
SUCCESSFUL=$(echo "$METRICS" | jq -r '.successfulLookups')

if [ "$TOTAL_LOOKUPS" -gt 0 ]; then
  SUCCESS_RATE=$(echo "scale=2; ($SUCCESSFUL / $TOTAL_LOOKUPS) * 100" | bc)
  if (( $(echo "$SUCCESS_RATE < 90" | bc -l) )); then
    echo "CRITICAL: Low success rate: $SUCCESS_RATE%" | \
      mail -s "Mapping Alert" "$ALERT_EMAIL"
  fi
fi
```

---

## Логирование алертов

Все алерты автоматически логируются через систему логирования:

```javascript
// Критические ошибки
logger.error('ALERT: Mappings not loaded', {
  alertType: 'CRITICAL',
  alertName: 'MAPPINGS_NOT_LOADED'
});

// Предупреждения
logger.warn('ALERT: High skipped items count', {
  alertType: 'WARNING',
  alertName: 'HIGH_SKIPPED_COUNT',
  totalSkipped: 150
});
```

Проверить алерты в логах:

```bash
# Критические алерты
grep "ALERT.*CRITICAL" logs/error.log

# Все алерты
grep "ALERT" logs/combined.log
```

---

## Требования

Эта система алертов реализует следующие требования:

- **9.1** - Мониторинг количества загруженных маппингов
- **9.2** - Отслеживание ненайденных маппингов
- **9.3** - Детальное логирование ошибок с контекстом
- **9.4** - API для получения статистики
- **9.5** - Статус загрузки и количество маппингов
