require('dotenv').config();
const axios = require('axios');

async function checkCampaigns() {
  const token = process.env.YANDEX_TOKEN;
  
  if (!token) {
    console.error('❌ YANDEX_TOKEN не найден в .env');
    process.exit(1);
  }

  console.log('🔍 Проверка доступных кампаний (магазинов) в Яндекс.Маркет...\n');

  try {
    const response = await axios.get('https://api.partner.market.yandex.ru/v2/campaigns', {
      headers: {
        'Api-Key': token,
        'Content-Type': 'application/json'
      }
    });

    const campaigns = response.data.campaigns || [];

    if (campaigns.length === 0) {
      console.log('⚠️  Кампании не найдены');
      return;
    }

    console.log(`✅ Найдено кампаний: ${campaigns.length}\n`);

    campaigns.forEach((campaign, index) => {
      console.log(`Кампания ${index + 1}:`);
      console.log(`  ID (campaignId): ${campaign.id}`);
      console.log(`  Название: ${campaign.domain}`);
      console.log(`  Business ID: ${campaign.business?.id || 'N/A'}`);
      console.log(`  Тип: ${campaign.placementType}`);
      console.log('');
    });

    console.log('💡 Используйте ID (campaignId) в переменной YANDEX_CAMPAIGN_ID');

  } catch (error) {
    console.error('❌ Ошибка при получении кампаний:');
    console.error('  Статус:', error.response?.status);
    console.error('  Сообщение:', error.response?.data || error.message);
  }
}

checkCampaigns();
