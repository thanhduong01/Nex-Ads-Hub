const GRAPH = 'https://graph.facebook.com/v19.0';

export async function getBmsAndAccounts(token){
  const bmRes = await fetch(`${GRAPH}/me/businesses?fields=id,name&access_token=${token}`);
  const bmData = await bmRes.json();
  const result = [];
  if(bmData.data && bmData.data.length){
    for(const bm of bmData.data){
      const accRes = await fetch(`${GRAPH}/${bm.id}/owned_ad_accounts?fields=id,name,account_status,balance,amount_spent&limit=100&access_token=${token}`);
      const accData = await accRes.json();
      result.push({bm, accounts: accData.data || []});
    }
  } else {
    const accRes = await fetch(`${GRAPH}/me/adaccounts?fields=id,name,account_status,balance,amount_spent&limit=100&access_token=${token}`);
    const accData = await accRes.json();
    result.push({bm: {id: 'personal', name: 'Tài khoản cá nhân'}, accounts: accData.data || []});
  }
  return result;
}

export async function getDailyInsights(adAccountId, since, until, token){
  const act = adAccountId.replace('act_','');
  const url = `${GRAPH}/act_${act}/insights?fields=campaign_id,campaign_name,date_start,spend,impressions,reach,clicks,ctr,cpc,actions,action_values&time_range={'since':'${since}','until':'${until}'}&time_increment=1&limit=500&access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();
  if(data.error) throw new Error(JSON.stringify(data.error));
  return data.data || [];
}