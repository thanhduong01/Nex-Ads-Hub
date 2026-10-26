import { api, auth, accessibleClients } from '../../lib/server.js';
import { allRows, checked } from '../../lib/supabase.js';
import { todayISO, shiftDate, monthRange } from '../../lib/metrics.js';
import { toMetricRow } from '../../lib/metaClient.js';
import { accountColumns } from './accounts.js';
export default api(async (req, res) => {
  const s = await auth(req, res);
  const clients = await accessibleClients(s);
  const ids = clients.map((c) => c.id);
  const links = ids.length
    ? await allRows(() =>
        s.db.from('client_accounts').select('*').in('client_id', ids).order('client_id'),
      )
    : [];
  const configs = ids.length
    ? await allRows(() => s.db.from('report_configs').select('*').in('client_id', ids).order('id'))
    : [];
  const today = todayISO(new Date(), process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh');
  const range = req.query.month
    ? monthRange(req.query.month)
    : { since: [`${today.slice(0, 7)}-01`, shiftDate(today, -27)].sort()[0], until: today };
  const groups =
    s.role === 'admin'
      ? [[s.user_id, null]]
      : [...new Set(links.map((l) => l.workspace_id))].map((w) => [
          w,
          links.filter((l) => l.workspace_id === w).map((l) => l.account_id),
        ]);
  let accounts = [],
    bms = [],
    campaigns = [],
    rows = [];
  for (const [workspace, allowed] of groups) {
    const query = (table, columns, idColumn) => {
      let q = s.db.from(table).select(columns).eq('workspace_id', workspace);
      if (allowed) q = q.in(idColumn, allowed);
      return q;
    };
    const fetched = await Promise.all([
      allRows(() => query('ad_accounts', accountColumns, 'id').order('id')),
      allRows(() => query('campaigns', '*', 'account_id').order('id')),
      allRows(() =>
        query('daily_insights', '*', 'account_id')
          .gte('date', range.since)
          .lte('date', range.until)
          .order('campaign_id')
          .order('date'),
      ),
    ]);
    accounts.push(...fetched[0]);
    campaigns.push(...fetched[1]);
    rows.push(...fetched[2]);
    if (s.role === 'admin')
      bms.push(
        ...checked(
          await s.db.from('bms').select('id,name,workspace_id').eq('workspace_id', workspace),
        ),
      );
  }
  res.json({
    accounts,
    bms,
    campaigns,
    rows: rows.map(toMetricRow),
    clients,
    links,
    configs,
    loadedAt: new Date().toISOString(),
    range,
  });
});
