import { api, auth, fail } from '../../lib/server.js';
import { connectAccounts } from '../../lib/sync.js';
import { checked } from '../../lib/supabase.js';
export default api(
  async (req, res) => {
    const s = await auth(req, res, { admin: true });
    const token = req.body?.token || process.env.META_ACCESS_TOKEN;
    if (!token || typeof token !== 'string' || token.length > 8192)
      throw fail('Chưa cấu hình META_ACCESS_TOKEN trên máy chủ.', 503);
    const result = await connectAccounts(s.db, s.user_id, token, {
      persist: Boolean(req.body?.token),
    });
    checked(
      await s.db.from('user_sessions').update({ fb_user_id: result.fb_user_id }).eq('id', s.id),
    );
    res.json(result);
  },
  ['POST'],
);
