import { api, fail, constantEqual } from '../../../lib/server.js';
import { supabaseAdmin, checked } from '../../../lib/supabase.js';
import { syncAccounts } from '../../../lib/sync.js';
export const config = { maxDuration: 300 };
export default api(async (req, res) => {
  const secret = process.env.CRON_SECRET;
  // x-vercel-cron alone is forgeable and must never authorize this endpoint.
  if (!secret || !constantEqual(req.headers.authorization, `Bearer ${secret}`))
    throw fail('Unauthorized', 401);
  const db = supabaseAdmin();
  checked(await db.from('user_sessions').delete().lt('expires_at', new Date().toISOString()));
  const result = await syncAccounts(db);
  res.status(result.failed ? 207 : 200).json(result);
});
