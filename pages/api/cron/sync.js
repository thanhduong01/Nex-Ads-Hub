import { supabaseAdmin } from '../../../lib/supabase';
import { getDailyInsights } from '../../../lib/metaClient';

export default async function handler(req,res){
  // Bảo vệ cron
  if(req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}` && req.query.secret !== process.env.CRON_SECRET){
    // Vercel Cron tự gọi không có header, cho phép nếu là Vercel Cron
    if(req.headers['x-vercel-cron'] !== '1'){
      // Trong dev cho qua
      if(process.env.NODE_ENV === 'production'){
        return res.status(401).json({error:'Unauthorized cron'});
      }
    }
  }

  const token = process.env.META_ACCESS_TOKEN;
  const { data: accounts } = await supabaseAdmin.from('ad_accounts').select('*').eq('is_tracked', true);
  if(!accounts || !accounts.length) return res.json({message:'Không có TK nào để sync'});

  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = today.toISOString().split('T')[0];
  let total = 0;

  for(const acc of accounts){
    try{
      const insights = await getDailyInsights(acc.id, firstDay, lastDay, token);
      for(const row of insights){
        const actions = {};
        (row.actions || []).forEach(a=> actions[a.action_type]=parseInt(a.value));
        const purchaseVal = (row.action_values||[]).find(v=> v.action_type==='purchase')?.value || 0;
        await supabaseAdmin.from('daily_insights').upsert({
          ad_account_id: acc.id,
          campaign_id: row.campaign_id,
          date: row.date_start,
          spend: parseFloat(row.spend||0),
          impressions: parseInt(row.impressions||0),
          reach: parseInt(row.reach||0),
          clicks: parseInt(row.clicks||0),
          ctr: parseFloat(row.ctr||0),
          cpc: parseFloat(row.cpc||0),
          actions,
          purchase_value: parseFloat(purchaseVal||0)
        }, {onConflict: 'campaign_id,date'});
        total++;
      }
    }catch(e){ console.error('Sync lỗi acc', acc.id, e.message); }
  }
  return res.json({success:true, syncedRows: total, from: firstDay, to: lastDay});
}