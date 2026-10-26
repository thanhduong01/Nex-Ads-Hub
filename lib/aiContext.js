import { dashboardScope } from './dashboardFilters.js';
import { aggregate, datesBetween, shiftDate, todayISO } from './metrics.js';
const invalid = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
export function validateAnalysisInput(body) {
  const { since, until } = body?.range || {};
  for (const date of [since, until]) {
    if (
      typeof date !== 'string' ||
      !/^20\d{2}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ||
      new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
    )
      invalid('Khoảng ngày phân tích không hợp lệ.');
  }
  const days = (Date.parse(until) - Date.parse(since)) / 86400000 + 1;
  if (days < 1 || days > 31 || until > todayISO())
    invalid('Chọn khoảng phân tích tối đa 31 ngày, không gồm ngày tương lai.');
  const filters = {};
  for (const name of ['bm', 'account', 'campaign', 'status']) {
    const value = body.filters?.[name] ?? 'all';
    if (typeof value !== 'string' || !value || value.length > 200)
      invalid('Bộ lọc phân tích không hợp lệ.');
    filters[name] = value;
  }
  const targetCPA = Number(body.targetCPA ?? 150000);
  if (!Number.isFinite(targetCPA) || targetCPA < 1 || targetCPA > 1e12)
    invalid('CPA mục tiêu không hợp lệ.');
  if (typeof body.promptId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(body.promptId))
    invalid('Hãy chọn prompt để phân tích.');
  return {
    filters,
    range: { since, until },
    previousRange: { since: shiftDate(since, -days), until: shiftDate(since, -1) },
    targetCPA,
    promptId: body.promptId,
  };
}
export function buildAIContext(data, input) {
  const { filters, range, previousRange, targetCPA } = input;
  const scope = dashboardScope(data, filters.bm, filters.account, filters.campaign, filters.status);
  const inRange = (row, period) => row.date >= period.since && row.date <= period.until;
  const rows = scope.rows.filter((row) => inRange(row, range));
  const previous = scope.rows.filter((row) => inRange(row, previousRange));
  if (!rows.length)
    invalid(
      'Bộ lọc này chưa có dữ liệu báo cáo trong khoảng ngày đã chọn. Hãy đồng bộ hoặc đổi bộ lọc.',
    );
  const currentByCampaign = new Map(),
    previousByCampaign = new Map();
  for (const [source, map] of [
    [rows, currentByCampaign],
    [previous, previousByCampaign],
  ])
    for (const row of source) {
      if (!map.has(row.campaign_id)) map.set(row.campaign_id, []);
      map.get(row.campaign_id).push(row);
    }
  const accounts = new Map(data.accounts.map((account) => [account.id, account]));
  const bms = new Map(data.bms.map((bm) => [bm.id, bm]));
  const campaigns = scope.campaigns
    .filter((campaign) => currentByCampaign.has(campaign.id) || previousByCampaign.has(campaign.id))
    .map((campaign) => {
      const account = accounts.get(campaign.account_id);
      const current = currentByCampaign.get(campaign.id) || [],
        prior = previousByCampaign.get(campaign.id) || [];
      const daily = new Map();
      for (const row of [...prior, ...current]) {
        if (!daily.has(row.date)) daily.set(row.date, []);
        daily.get(row.date).push(row);
      }
      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status || 'UNKNOWN',
        dailyBudget: campaign.daily_budget,
        account: {
          id: account.id,
          name: account.name,
          bm: bms.get(account.bm_id)?.name || null,
          lastSyncedAt: account.last_synced_at || null,
        },
        current: aggregate(current),
        previous: aggregate(prior),
        currentRowCount: current.length,
        previousRowCount: prior.length,
        daily: [...daily]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, points]) => ({ date, ...aggregate(points) })),
      };
    });
  const context = {
    currency: 'VND',
    filters,
    range,
    previousRange,
    targetCPA,
    accountCount: scope.accounts.length,
    campaignCount: scope.campaigns.length,
    campaignsWithInsights: campaigns.length,
    campaignsWithoutInsights: scope.campaigns.length - campaigns.length,
    notes: [
      'Chiến dịch không có dòng insight trong cả hai kỳ chỉ được đếm, không có đủ số liệu để đánh giá hiệu suất.',
      'Kỳ trước có thể chưa đồng bộ đủ; kiểm tra số dòng và thời điểm đồng bộ của tài khoản.',
    ],
    current: aggregate(rows),
    previous: aggregate(previous),
    currentRowCount: rows.length,
    previousRowCount: previous.length,
    daily: datesBetween(range.since, range.until).map((date) => ({
      date,
      ...aggregate(rows.filter((row) => row.date === date)),
    })),
    campaigns,
  };
  if (JSON.stringify(context).length > 500000)
    invalid(
      'Phạm vi phân tích quá lớn. Chọn một BM, tài khoản hoặc chiến dịch cụ thể để gửi đầy đủ dữ liệu.',
    );
  return context;
}
