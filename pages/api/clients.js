import { api, auth, fail, accessibleClients, clientFor } from '../../lib/server.js';
import { checked } from '../../lib/supabase.js';
export default api(
  async (req, res) => {
    const s = await auth(req, res, { admin: req.method !== 'GET' });
    if (req.method === 'GET') {
      res.json({ clients: await accessibleClients(s) });
      return;
    }
    const { id, name, owner_email, account_ids = [] } = req.body || {};
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 80 ||
      typeof owner_email !== 'string' ||
      !/^\S+@\S+\.\S+$/.test(owner_email) ||
      owner_email.length > 254 ||
      !Array.isArray(account_ids) ||
      account_ids.some((a) => typeof a !== 'string')
    )
      throw fail('Kiểm tra tên, email và tài khoản khách hàng.');
    if (id) await clientFor(s, id);
    if (account_ids.length) {
      const accounts = checked(
        await s.db
          .from('ad_accounts')
          .select('id,currency')
          .eq('workspace_id', s.user_id)
          .in('id', account_ids),
      );
      if (accounts.length !== new Set(account_ids).size)
        throw fail('Tài khoản không thuộc workspace.');
      if (new Set(accounts.map((a) => a.currency)).size > 1)
        throw fail('Mỗi khách hàng chỉ gán tài khoản cùng một đơn vị tiền tệ.');
    }
    const result = checked(
      await s.db.rpc('save_client', {
        p_workspace: s.user_id,
        p_id: id || null,
        p_name: name.trim(),
        p_email: owner_email.toLowerCase().trim(),
        p_accounts: account_ids,
      }),
    );
    res.json({ client: result });
  },
  ['GET', 'POST', 'PUT'],
);
