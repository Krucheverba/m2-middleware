require('dotenv').config();
const axios = require('axios');

const YANDEX_TOKEN = process.env.YANDEX_TOKEN;
const CAMPAIGN_ID = process.env.YANDEX_CAMPAIGN_ID;

async function checkTokenPermissions() {
  console.log('Проверка прав токена...');
  console.log('Campaign ID:', CAMPAIGN_ID);
  console.log('Token:', YANDEX_TOKEN ? `${YANDEX_TOKEN.substring(0, 10)}...` : 'НЕ УСТАНОВЛЕН');
  
  try {
    // Проверка доступа к кампании
    console.log('\n1. Проверка доступа к кампании...');
    const campaignResponse = await axios.get(
      `https://api.partner.market.yandex.ru/campaigns/${CAMPAIGN_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${YANDEX_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✓ Доступ к кампании есть');
    console.log('  Название:', campaignResponse.data.result.domain);
    
    // Проверка доступа к офферам
    console.log('\n2. Проверка доступа к офферам...');
    const offersResponse = await axios.post(
      `https://api.partner.market.yandex.ru/campaigns/${CAMPAIGN_ID}/offer-mapping-entries`,
      {
        offerIds: ['BARDAHL_XTC_10W-40_DBSA']
      },
      {
        headers: {
          'Authorization': `Bearer ${YANDEX_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✓ Доступ к офферам есть');
    
    // Проверка доступа к обновлению остатков
    console.log('\n3. Проверка доступа к обновлению остатков...');
    const stocksResponse = await axios.put(
      `https://api.partner.market.yandex.ru/campaigns/${CAMPAIGN_ID}/offers/stocks`,
      {
        skus: [{
          sku: 'BARDAHL_XTC_10W-40_DBSA',
          warehouseId: 0,
          items: [{
            count: 10,
            type: 'FIT',
            updatedAt: new Date().toISOString()
          }]
        }]
      },
      {
        headers: {
          'Authorization': `Bearer ${YANDEX_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✓ Доступ к обновлению остатков есть');
    console.log('  Результат:', JSON.stringify(stocksResponse.data, null, 2));
    
  } catch (error) {
    console.error('\n✗ Ошибка:', error.response?.status, error.response?.statusText);
    console.error('  Детали:', JSON.stringify(error.response?.data, null, 2));
    
    if (error.response?.status === 403) {
      console.error('\n⚠️  У токена нет прав на выполнение операции!');
      console.error('   Необходимо:');
      console.error('   1. Зайти в личный кабинет Яндекс.Маркет');
      console.error('   2. Настройки → API → Токены');
      console.error('   3. Создать новый токен с правами:');
      console.error('      - Управление каталогом');
      console.error('      - Управление остатками');
      console.error('      - Управление ценами');
    }
  }
}

checkTokenPermissions();
