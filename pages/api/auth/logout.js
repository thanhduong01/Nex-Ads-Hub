import { api, auth, setCookie } from '../../../lib/server.js';
import { checked } from '../../../lib/supabase.js';
export default api(
  async (req, res) => {
    try {
      const s = await auth(req, res);
      checked(await s.db.from('user_sessions').delete().eq('id', s.id));
    } catch (error) {
      if (error.status !== 401) throw error;
    }
    setCookie(res, 'ads_hub_sid', '', 0);
    res.json({ ok: true });
  },
  ['POST'],
);
