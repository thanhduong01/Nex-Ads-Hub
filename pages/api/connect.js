import { getBmsAndAccounts } from '../../lib/metaClient';
import { supabaseAdmin } from '../../lib/supabase';

export default async function handler(req,res){
  if(req.method !== 'POST') return res.status(405).end();
  const { token, fbUserId } = req.body;
  if(!token) return res.status(400).json({error:'Thiếu token'});
  try{
    const bmsData = await getBmsAndAccounts(token);
    // Lưu vào Supabase để persist
    for(const item of bmsData){
      await supabaseAdmin.from('bms').upsert({id: item.bm.id, name: item.bm.name, fb_user_id: fbUserId || 'me'});
      for(const acc of item.accounts){
        await supabaseAdmin.from('ad_accounts').upsert({
          id: acc.id,
          name: acc.name,
          bm_id: item.bm.id,
          account_status: acc.account_status,
          balance: acc.balance,
          amount_spent: acc.amount_spent,
          fb_user_id: fbUserId || 'me',
          is_tracked: true
        });
      }
    }
    return res.json({success:true, data: bmsData});
  }catch(e){
    return res.status(500).json({error: e.message});
  }
}