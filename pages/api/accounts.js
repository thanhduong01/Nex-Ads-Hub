import { api, auth, fail } from '../../lib/server.js';
import { checked, allRows } from '../../lib/supabase.js';
export const accountColumns =
  'workspace_id,id,bm_id,name,account_status,role,currency,timezone_name,balance,amount_spent,is_tracked,last_synced_at,last_sync_error';
export default api(
  async (req, res) => {
    const s = await auth(req, res, { admin: true });
    if (req.method === 'GET') {
      res.json({
        accounts: await allRows(() =>
          s.db
            .from('ad_accounts')
            .select(accountColumns)
            .eq('workspace_id', s.user_id)
            .eq('is_tracked', true)
            .order('id'),
        ),
      });
      return;
    }
    if (req.method === 'PATCH') {
      const { id, is_tracked } = req.body || {};
      if (typeof id !== 'string' || typeof is_tracked !== 'boolean')
        throw fail('Tài khoản hoặc trạng thái không hợp lệ.');
      const account = checked(
        await s.db
          .from('ad_accounts')
          .update({ is_tracked })
          .eq('workspace_id', s.user_id)
          .eq('id', id)
          .select(accountColumns)
          .maybeSingle(),
      );
      if (!account) throw fail('Không tìm thấy tài khoản.', 404);
      res.json({ account });
      return;
    }
    checked(await s.db.from('ad_accounts').delete().eq('workspace_id', s.user_id));
    checked(await s.db.from('bms').delete().eq('workspace_id', s.user_id));
    checked(await s.db.from('user_sessions').update({ fb_user_id: null }).eq('user_id', s.user_id));
    res.json({ ok: true });
  },
  ['GET', 'PATCH', 'DELETE'],
);
