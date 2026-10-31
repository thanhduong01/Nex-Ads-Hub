import { allRows, checked } from './supabase.js';
import { accessibleClients, fail } from './server.js';
import { todayISO, monthRange, rangeFor, shiftDate } from './metrics.js';
import { toMetricRow } from './metaClient.js';

export const ACCOUNT_DATA_FIELDS =
  'workspace_id,id,bm_id,name,account_status,role,currency,timezone_name,balance,amount_spent,is_tracked,last_synced_at,last_sync_error';
export const INSIGHT_DATA_FIELDS =
  'workspace_id,account_id,campaign_id,date,spend,impressions,reach,clicks,leads,purchases,purchase_value';
export function dataRequest(input = {}, role = 'admin', now = new Date()) {
  const legacy =
    !input.view &&
    !input.month &&
    !input.period &&
    !input.account &&
    !input.bm &&
    !input.status &&
    !input.camp;
  const view = input.view || (input.month ? 'reports' : legacy ? 'legacy' : 'dashboard');
  if (!['dashboard', 'accounts', 'reports', 'legacy'].includes(view))
    throw fail('Trang dữ liệu không hợp lệ.');
  if (role !== 'admin' && view !== 'reports')
    throw fail('Bạn chỉ có quyền xem báo cáo của mình.', 403);
  const today = todayISO(now, process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh');
  const month = input.month || today.slice(0, 7);
  monthRange(month);
  const period = input.period || '7';
  if (!['1', 'yesterday', '3', '7', '14'].includes(period)) throw fail('Khoảng ngày không hợp lệ.');
  const range =
    view === 'dashboard'
      ? rangeFor(period, today)
      : view === 'legacy'
        ? { since: [`${today.slice(0, 7)}-01`, shiftDate(today, -27)].sort()[0], until: today }
        : monthRange(month);
  const days = (Date.parse(range.until) - Date.parse(range.since)) / 86400000 + 1;
  const since = view === 'dashboard' ? shiftDate(range.since, -days) : range.since;
  const filters = {
    bm: input.bm || 'all',
    account: input.account || 'all',
    camp: input.camp || 'all',
    status: input.status || 'all',
    period,
  };
  if (
    Object.values(filters).some(
      (v) => typeof v !== 'string' || v.length > 100 || !/^[-_a-zA-Z0-9]+$/.test(v),
    )
  )
    throw fail('Bộ lọc không hợp lệ.');
  return {
    view,
    month,
    range: { since, until: range.until },
    displayRange: range,
    filters,
    includeMeta: input.include_meta !== '0',
  };
}
export async function loadWorkspaceData(session, input = {}, { now = new Date() } = {}) {
  const request = dataRequest(input, session.role, now);
  const [clients, adminAccounts] = await Promise.all([
    request.includeMeta || session.role !== 'admin' ? accessibleClients(session) : [],
    session.role === 'admin'
      ? allRows(() =>
          session.db
            .from('ad_accounts')
            .select(ACCOUNT_DATA_FIELDS)
            .eq('workspace_id', session.user_id)
            .order('id'),
        )
      : null,
  ]);
  const clientIds = clients.map((c) => c.id);
  const links = clientIds.length
    ? await allRows(() =>
        session.db
          .from('client_accounts')
          .select('workspace_id,client_id,account_id')
          .in('client_id', clientIds)
          .order('client_id')
          .order('account_id'),
      )
    : [];
  const groups =
    session.role === 'admin'
      ? [[session.user_id, null]]
      : [...new Set(links.map((l) => l.workspace_id))].map((w) => [
          w,
          links.filter((l) => l.workspace_id === w).map((l) => l.account_id),
        ]);
  const accounts = [],
    bms = [],
    campaigns = [],
    rows = [];
  for (const [workspace, allowed] of groups) {
    if (allowed?.length === 0) continue;
    const query = (table, fields, idColumn) => {
      let q = session.db.from(table).select(fields).eq('workspace_id', workspace);
      return allowed ? q.in(idColumn, allowed) : q;
    };
    const accountRows = adminAccounts
      ? await adminAccounts
      : await allRows(() => query('ad_accounts', ACCOUNT_DATA_FIELDS, 'id').order('id'));
    accounts.push(...accountRows);
    const { filters, view, range } = request;
    const scoped = accountRows.filter(
      (a) =>
        (view === 'accounts' || view === 'legacy' || a.is_tracked) &&
        (view !== 'dashboard' ||
          (a.currency === 'VND' &&
            (filters.bm === 'all' ||
              (filters.bm === 'unassigned' ? !a.bm_id : a.bm_id === filters.bm)) &&
            (filters.account === 'all' || a.id === filters.account))),
    );
    const ids = scoped.map((a) => a.id);
    const readInsights = () => {
      if (!ids.length) return [];
      return allRows(() => {
        let q = session.db
          .from('daily_insights')
          .select(
            INSIGHT_DATA_FIELDS +
              (view === 'dashboard' && filters.status !== 'all' ? ',campaigns!inner(status)' : ''),
          )
          .eq('workspace_id', workspace)
          .in('account_id', ids)
          .gte('date', range.since)
          .lte('date', range.until)
          .order('account_id')
          .order('date')
          .order('campaign_id');
        if (view === 'dashboard' && filters.camp !== 'all') q = q.eq('campaign_id', filters.camp);
        if (view === 'dashboard' && filters.status !== 'all')
          q = q.eq('campaigns.status', filters.status);
        return q;
      });
    };
    const fetched = await Promise.all([
      readInsights(),
      request.includeMeta && session.role === 'admin'
        ? allRows(
            () =>
              query(
                'campaigns',
                'workspace_id,id,account_id,name,status,objective,daily_budget',
                'account_id',
              ).order('id'),
            { concurrency: 3 },
          )
        : [],
      request.includeMeta && session.role === 'admin'
        ? query('bms', 'workspace_id,id,name', 'id').order('id')
        : Promise.resolve({ data: [], error: null }),
    ]);
    rows.push(...fetched[0]);
    campaigns.push(...fetched[1]);
    bms.push(...checked(fetched[2]));
  }
  const configs =
    request.includeMeta && clientIds.length
      ? await allRows(() =>
          session.db
            .from('report_configs')
            .select(
              'id,workspace_id,client_id,month,selected_metrics,custom_names,custom_metrics,updated_at',
            )
            .in('client_id', clientIds)
            .order('id'),
        )
      : [];
  const result = {
    accounts,
    rows: rows.map((row) => {
      const { campaigns: joined, ...values } = row;
      return toMetricRow(values);
    }),
    range: request.range,
    displayRange: request.displayRange,
    view: request.view,
    loadedAt: new Date().toISOString(),
  };
  if (request.includeMeta)
    Object.assign(result, {
      bms,
      campaigns: [...new Map(campaigns.map((c) => [`${c.workspace_id}/${c.id}`, c])).values()],
      clients,
      links,
      configs,
    });
  return result;
}
