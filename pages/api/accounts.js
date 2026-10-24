import { supabaseAdmin } from '../../lib/supabase';
export default async function handler(req,res){
  const { data } = await supabaseAdmin.from('ad_accounts').select('*, bms(name)').eq('is_tracked', true);
  res.json(data);
}