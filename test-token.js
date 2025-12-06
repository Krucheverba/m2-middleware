#!/usr/bin/env node

/**
 * Простой тест токена МойСклад
 */

require('dotenv').config();
const axios = require('axios');

const MS_TOKEN = process.env.MS_TOKEN;
const MS_BASE = process.env.MS_BASE || 'https://api.moysklad.ru/api/remap/1.2';

console.log('Проверка токена МойСклад...');
console.log('MS_BASE:', MS_BASE);
console.log('MS_TOKEN длина:', MS_TOKEN ? MS_TOKEN.length : 0);
console.log('MS_TOKEN первые 10 символов:', MS_TOKEN ? MS_TOKEN.substring(0, 10) : 'не установлен');
console.log('');

async function testToken() {
  try {
    console.log('Отправка запроса к API МойСклад...');
    
    const response = await axios.get(`${MS_BASE}/entity/product`, {
      headers: {
        'Authorization': `Bearer ${MS_TOKEN}`,
        'Accept-Encoding': 'gzip'
      },
      params: {
        limit: 1
      },
      timeout: 10000
    });
    
    console.log('✓ Успешно! Статус:', response.status);
    console.log('✓ Получено товаров:', response.data.rows ? response.data.rows.length : 0);
    console.log('');
    console.log('Токен работает корректно!');
    
  } catch (error) {
    console.log('✗ Ошибка!');
    console.log('Статус:', error.response ? error.response.status : 'нет ответа');
    console.log('Сообщение:', error.message);
    
    if (error.response) {
      console.log('Данные ответа:', error.response.data);
    }
    
    console.log('');
    console.log('Токен не работает или недействителен.');
  }
}

testToken();
