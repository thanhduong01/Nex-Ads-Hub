import { todayISO, shiftDate, monthRange, datesBetween, DEFAULT_CONFIG } from './metrics.js';
export function createDemo(month = todayISO().slice(0, 7)) {
  const workspace_id = 'demo';
  const bms = [
    { id: 'bm_1', name: 'Studio Commerce', workspace_id },
    { id: 'bm_2', name: 'Growth Partners', workspace_id },
  ];
  const accounts = [
    { id: 'act_102458916', bm_id: 'bm_1', name: 'Lá Natural • Việt Nam', balance: 4250000 },
    { id: 'act_102458927', bm_id: 'bm_1', name: 'Mono Studio • Retail', balance: 7800000 },
    { id: 'act_208761044', bm_id: 'bm_2', name: 'Nếp Living • Home', balance: 3150000 },
  ].map((a) => ({
    ...a,
    workspace_id,
    is_tracked: true,
    role: 'Admin',
    account_status: 1,
    currency: 'VND',
    timezone_name: 'Asia/Ho_Chi_Minh',
    last_synced_at: new Date().toISOString(),
  }));
  const campaigns = [
    ['c1', 0, 'Lá Natural | Always-on • Purchase', 950000, 'ACTIVE', 4.82],
    ['c2', 0, 'Lá Natural | Retargeting 14 ngày', 450000, 'ACTIVE', 6.16],
    ['c3', 1, 'Mono | New collection • Lookalike', 1100000, 'ACTIVE', 1.23],
    ['c4', 1, 'Mono | Best sellers • Conversion', 750000, 'ACTIVE', 3.67],
    ['c5', 2, 'Nếp | Living essentials • Broad', 620000, 'ACTIVE', 3.24],
    ['c6', 2, 'Nếp | Video views • Discovery', 350000, 'ACTIVE', 0.94],
  ].map(([id, a, name, daily_budget, status, roas]) => ({
    id,
    account_id: accounts[a].id,
    workspace_id,
    name,
    daily_budget,
    status,
    roas,
  }));
  const clients = [
    { id: 'client_la', name: 'Lá Natural', owner_email: 'la@example.com' },
    { id: 'client_mono', name: 'Mono Studio', owner_email: 'mono@example.com' },
    { id: 'client_nep', name: 'Nếp Living', owner_email: 'nep@example.com' },
  ].map((c) => ({ ...c, workspace_id }));
  const links = clients.map((c, i) => ({
    client_id: c.id,
    account_id: accounts[i].id,
    workspace_id,
  }));
  const range = monthRange(month);
  const today = todayISO();
  const dates = [
    ...new Set([
      ...datesBetween(range.since, range.until),
      ...datesBetween(shiftDate(today, -35), today),
    ]),
  ].filter((d) => d <= today);
  const rows = [];
  for (const date of dates)
    for (const [i, c] of campaigns.entries()) {
      const day = Number(date.slice(-2)),
        wave = 0.78 + Math.sin(day * 1.18 + i) * 0.12 + day * 0.007;
      const spend = Math.round(c.daily_budget * wave);
      const impressions = Math.round((spend / (28000 + i * 900)) * 1000);
      const clicks = Math.round(
        impressions * (0.018 + i * 0.001) * (i === 2 && date >= shiftDate(today, -2) ? 0.52 : 1),
      );
      const purchases = Math.max(0, Math.round(spend / (i === 2 ? 265000 : 110000 + i * 3000)));
      rows.push({
        date,
        workspace_id,
        campaign_id: c.id,
        account_id: c.account_id,
        spend,
        impressions,
        reach: Math.round(impressions / (i === 5 ? 3.8 : 1.62)),
        clicks,
        'actions:purchase': purchases,
        'actions:lead': Math.round(clicks * 0.04),
        purchase_value: Math.round(spend * c.roas * (1 + Math.sin(day * 0.5) * 0.12)),
        frequency: i === 5 ? 3.8 : 1.62,
      });
    }
  const configs = clients.map((c) => ({
    ...structuredClone(DEFAULT_CONFIG),
    id: `report_${c.id}_${month}`,
    client_id: c.id,
    workspace_id,
    month,
    updated_at: new Date().toISOString(),
  }));
  return {
    bms,
    accounts,
    campaigns,
    clients,
    links,
    rows,
    configs,
    loadedAt: new Date().toISOString(),
  };
}
