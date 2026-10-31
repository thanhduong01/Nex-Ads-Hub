import { getBmsAndAccounts, fromMinor, graph, withMetaDeadline } from './metaClient.js';
import { checked } from './supabase.js';
import { encrypt } from './server.js';
import { runWorkspaceSync } from './syncEngine.js';
export async function connectAccounts(
  db,
  userId,
  token,
  { persist = false, budgetMs = 60000 } = {},
) {
  const { me, bms, accounts } = await withMetaDeadline(Date.now() + budgetMs, async () => ({
    me: await graph('me', { fields: 'id' }, token),
    ...(await getBmsAndAccounts(token)),
  }));
  const cipher = persist ? encrypt(token) : null;
  if (bms.length)
    checked(
      await db.from('bms').upsert(
        bms.map((b) => ({ workspace_id: userId, id: b.id, name: b.name })),
        { onConflict: 'workspace_id,id' },
      ),
    );
  const existing = checked(
    await db.from('ad_accounts').select('id,is_tracked').eq('workspace_id', userId),
  );
  if (accounts.length)
    checked(
      await db.from('ad_accounts').upsert(
        accounts.map((a) => ({
          workspace_id: userId,
          id: a.id,
          bm_id: a.bm_id,
          name: a.name,
          account_status: a.account_status,
          currency: a.currency || 'VND',
          timezone_name: a.timezone_name || 'Asia/Ho_Chi_Minh',
          balance: fromMinor(a.balance, a.currency),
          amount_spent: fromMinor(a.amount_spent, a.currency),
          role: (a.user_tasks || []).includes('MANAGE') ? 'Admin' : 'Advertiser',
          is_tracked: existing.find((e) => e.id === a.id)?.is_tracked ?? true,
          meta_token_encrypted: cipher,
          fb_user_id: me.id,
        })),
        { onConflict: 'workspace_id,id' },
      ),
    );
  return { bms: bms.length, accounts: accounts.length, fb_user_id: me.id };
}
export const syncAccounts = runWorkspaceSync;
