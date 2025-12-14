// Проверка к каким Campaign ID имеет доступ текущий токен
require('dotenv').config();
const axios = require('axios');

async function checkTokenCampaigns() {
  const token = process.env.YANDEX_TOKEN;
  
  console.log('🔍 Проверка доступных Campaign ID для текущего токена...\n');
  
  try {
    const response = await axios.get('https://api.partner.market.yandex.ru/campaigns', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const campaigns = response.data.campaigns || [];
    
    console.log(`✅ Токен имеет доступ к ${campaigns.length} магазинам:\n`);
    
    campaigns.forEach(campaign => {
      console.log(`📦 Campaign ID: ${campaign.id}`);
      console.log(`   Название: ${campaign.domain}`);
      console.log(`   Бизнес: ${campaign.business?.name || 'N/A'}`);
      console.log('');
    });
    
    // Проверяем есть ли доступ к нужному Campaign
    const targetCampaignId = '198473170';
    const hasAccess = campaigns.some(c => c.id.toString() === targetCampaignId);
    
    if (hasAccess) {
      console.log(`✅ Токен ИМЕЕТ доступ к Campaign ID ${targetCampaignId}`);
    } else {
      console.log(`❌ Токен НЕ ИМЕЕТ доступа к Campaign ID ${targetCampaignId}`);
      console.log(`\nДоступные Campaign IDs: ${campaigns.map(c => c.id).join(', ')}`);
      console.log(`\nНужно:`);
      console.log(`1. Попросить владельца магазина M2 добавить ваш email в пользователи`);
      console.log(`2. Или получить токен от владельца магазина M2`);
    }
    
  } catch (error) {
    console.error('❌ Ошибка при проверке токена:');
    console.error(`   ${error.message}`);
    if (error.response?.status === 401) {
      console.error('\n⚠️  Токен недействителен или истёк');
    }
  }
}

checkTokenCampaigns();
