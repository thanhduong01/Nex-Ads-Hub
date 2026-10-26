import {
  getBmsAndAccounts,
  getDailyInsights,
  getDailyInsightsInChunks,
  getCampaigns,
  normalizeInsight,
  fromMinor,
  graph,
  withMetaDeadline,
} from './metaClient.js';
import { checked, allRows } from './supabase.js';
import { encrypt, decrypt } from './server.js';
import { todayISO, monthRange, shiftDate } from './metrics.js';
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
export async function syncAccounts(db, { workspaceId, month, accountIds, budgetMs = 240000 } = {}) {
  const deadline = Date.now() + budgetMs;
  const accounts = await allRows(() => {
    let q = db
      .from('ad_accounts')
      .select('*')
      .eq('is_tracked', true)
      .order('last_synced_at', { ascending: true, nullsFirst: true })
      .order('id');
    if (workspaceId) q = q.eq('workspace_id', workspaceId);
    if (accountIds) q = q.in('id', accountIds);
    return q;
  });
  const results = [];
  for (const account of accounts) {
    if (Date.now() >= deadline) {
      results.push({
        id: account.id,
        ok: false,
        skipped: true,
        error: 'Chờ lượt đồng bộ tiếp theo do giới hạn thời gian.',
      });
      continue;
    }
    const now = todayISO(
      new Date(),
      account.timezone_name || process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh',
    );
    const monthToSync = month || now.slice(0, 7);
    let { since, until } = monthRange(monthToSync);
    if (!month) since = since < shiftDate(now, -27) ? since : shiftDate(now, -27);
    until = until > now ? now : until;
    if (since > until) {
      results.push({ id: account.id, ok: true, rows: 0 });
      continue;
    }
    const claim = await db
      .from('ad_accounts')
      .update({ sync_lock_until: new Date(Date.now() + 330000).toISOString() })
      .eq('workspace_id', account.workspace_id)
      .eq('id', account.id)
      .or(`sync_lock_until.is.null,sync_lock_until.lt.${new Date().toISOString()}`)
      .select('id');
    checked(claim);
    if (!claim.data.length) {
      results.push({
        id: account.id,
        ok: false,
        skipped: true,
        error: 'Đang đồng bộ ở tiến trình khác.',
      });
      continue;
    }
    try {
      const token = account.meta_token_encrypted
        ? decrypt(account.meta_token_encrypted)
        : process.env.META_ACCESS_TOKEN;
      const { campaigns, rows } = await withMetaDeadline(deadline, async () => {
        const campaigns = await getCampaigns(account.id, token);
        // Large campaign histories can make a month-wide Insights query exceed Meta's response time.
        const readInsights = campaigns.length > 500 ? getDailyInsightsInChunks : getDailyInsights;
        const rows = await readInsights(account.id, since, until, token);
        return { campaigns, rows };
      });
      const map = new Map(
        campaigns.map((c) => [
          c.id,
          {
            workspace_id: account.workspace_id,
            id: c.id,
            account_id: account.id,
            name: c.name,
            status: c.effective_status || c.status,
            daily_budget: c.daily_budget ? fromMinor(c.daily_budget, account.currency) : null,
            objective: c.objective,
          },
        ]),
      );
      for (const r of rows)
        if (!map.has(r.campaign_id))
          map.set(r.campaign_id, {
            workspace_id: account.workspace_id,
            id: r.campaign_id,
            account_id: account.id,
            name: r.campaign_name,
            status: 'UNKNOWN',
            daily_budget: null,
          });
      if (map.size)
        checked(
          await db.from('campaigns').upsert([...map.values()], { onConflict: 'workspace_id,id' }),
        );
      // Atomically replace the fully fetched range to remove stale rows when Meta revises attribution.
      checked(
        await db.rpc('replace_insights_range', {
          p_workspace: account.workspace_id,
          p_account: account.id,
          p_since: since,
          p_until: until,
          p_rows: rows.map((r) => normalizeInsight(r, account.workspace_id, account.id)),
        }),
      );
      checked(
        await db
          .from('ad_accounts')
          .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
          .eq('workspace_id', account.workspace_id)
          .eq('id', account.id),
      );
      results.push({ id: account.id, ok: true, rows: rows.length });
    } catch (error) {
      const message = error.message?.replace(
        /(access_token|client_secret|token)=[^&\s]+/gi,
        '$1=[redacted]',
      );
      await db
        .from('ad_accounts')
        .update({ last_sync_error: message })
        .eq('workspace_id', account.workspace_id)
        .eq('id', account.id);
      results.push({ id: account.id, ok: false, error: message });
    } finally {
      await db
        .from('ad_accounts')
        .update({ sync_lock_until: null })
        .eq('workspace_id', account.workspace_id)
        .eq('id', account.id);
    }
  }
  return {
    results,
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };
}
