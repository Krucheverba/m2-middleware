# Инструкция по импорту маппингов из МойСклад

## Шаг 1: Скачайте Excel файл из МойСклад

1. Зайдите в МойСклад
2. Перейдите в раздел **Товары и склад** → **Товары**
3. Нажмите кнопку **Экспорт** (обычно справа вверху)
4. Выберите формат: **"Товары (Excel, старый)"**
5. Нажмите **"Экспортировать"**
6. Дождитесь скачивания файла (обычно называется `products.xlsx`)

## Шаг 2: Положите файл в проект

Скачанный Excel файл положите в папку **`data/`** и переименуйте в:
```
data/moysklad-export.xlsx
```

## Шаг 3: Установите библиотеку для работы с Excel

Выполните в корне проекта:
```bash
npm install xlsx
```

## Шаг 4: Запустите скрипт импорта

```bash
node scripts/import-from-moysklad-excel.js
```

Скрипт:
- Прочитает Excel файл из МойСклад (article → product.id)
- Прочитает существующий CSV файл (offerId → article)
- Создаст финальный маппинг (product.id → offerId)
- Сохранит результат в `data/product-mappings.json`

## Шаг 5: Проверьте результат

Откройте файл `data/product-mappings.json` и убедитесь, что маппинги выглядят правильно:
```json
{
  "product-id-1": "offerId-1",
  "product-id-2": "offerId-2",
  ...
}
```

## Шаг 6: Загрузите на сервер

```bash
scp data/product-mappings.json root@89.223.125.212:/root/m2-middleware/data/
```

Введите пароль от сервера.

## Шаг 7: Перезапустите приложение на сервере

Подключитесь к серверу:
```bash
ssh root@89.223.125.212
```

Перезапустите PM2:
```bash
cd /root/m2-middleware
pm2 restart m2-middleware
```

Проверьте, что маппинги загрузились:
```bash
curl https://mirmasla.online/m2/api/mapping/stats
```

## Возможные проблемы

### Ошибка: "Cannot find module 'xlsx'"
Установите библиотеку:
```bash
npm install xlsx
```

### Ошибка: "Файл не найден"
Убедитесь, что файл лежит в `data/moysklad-export.xlsx`

### Артикулы не найдены в Excel
Проверьте:
1. Артикулы в CSV и МойСклад написаны одинаково
2. Товары не были удалены из МойСклад
3. Нет опечаток в артикулах

## Структура файлов

```
m2-middleware/
├── data/
│   ├── moysklad-export.xlsx      ← Положите сюда Excel из МойСклад
│   ├── m2&m1.csv                 ← Уже есть (offerId → article)
│   └── product-mappings.json     ← Результат работы скрипта
└── scripts/
    └── import-from-moysklad-excel.js  ← Скрипт импорта
```

## Что делает скрипт

1. **Читает Excel** из МойСклад:
   - Колонка "Артикул" → article
   - Колонка "ID" → product.id
   - Создаёт маппинг: `article → product.id`

2. **Читает CSV** файл:
   - Колонка 1 (М2) → offerId
   - Колонка 2 (М1) → article
   - Создаёт маппинг: `offerId → article`

3. **Объединяет** два маппинга:
   - Для каждого offerId находит article
   - Для каждого article находит product.id
   - Создаёт финальный маппинг: `product.id → offerId`

4. **Сохраняет** результат в `data/product-mappings.json`
