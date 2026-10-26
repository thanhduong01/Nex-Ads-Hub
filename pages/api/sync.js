import { api, auth, clientFor } from '../../lib/server.js';
import { checked } from '../../lib/supabase.js';
import { monthRange } from '../../lib/metrics.js';
import { syncAccounts } from '../../lib/sync.js';
export default api(
  async (req, res) => {
    const s = await auth(req, res, { admin: true });
    const { month, client_id } = req.body || {};
    if (month) monthRange(month);
    let accountIds;
    if (client_id) {
      await clientFor(s, client_id);
      accountIds = checked(
        await s.db.from('client_accounts').select('account_id').eq('client_id', client_id),
      ).map((l) => l.account_id);
      if (!accountIds.length) {
        res.json({ results: [], synced: 0, failed: 0 });
        return;
      }
    }
    res.json(await syncAccounts(s.db, { workspaceId: s.user_id, month, accountIds }));
  },
  ['POST'],
);
