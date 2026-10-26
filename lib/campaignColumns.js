import { aggregate, divide } from './metrics.js';
export const CAMPAIGN_COLUMNS = {
  name: { name: 'Tên chiến dịch', type: 'text', group: 'Thông tin' },
  id: { name: 'ID chiến dịch', type: 'text', group: 'Thông tin' },
  account_name: { name: 'Tài khoản quảng cáo', type: 'text', group: 'Thông tin' },
  account_id: { name: 'ID tài khoản', type: 'text', group: 'Thông tin' },
  bm_name: { name: 'BM sở hữu', type: 'text', group: 'Thông tin' },
  bm_id: { name: 'ID BM', type: 'text', group: 'Thông tin' },
  status: { name: 'Trạng thái', type: 'status', group: 'Thông tin' },
  objective: { name: 'Mục tiêu chiến dịch', type: 'text', group: 'Thông tin' },
  daily_budget: { name: 'Ngân sách/ngày', type: 'money', group: 'Thông tin' },
  spend: { name: 'Đã chi tiêu', type: 'money', group: 'Hiệu suất' },
  impressions: { name: 'Lượt hiển thị', type: 'number', group: 'Hiệu suất' },
  reach: { name: 'Tiếp cận cộng dồn*', type: 'number', group: 'Hiệu suất' },
  clicks: { name: 'Lượt nhấp (tất cả)', type: 'number', group: 'Hiệu suất' },
  ctr: { name: 'CTR (tất cả)', type: 'percent', group: 'Hiệu suất' },
  cpc: { name: 'CPC (tất cả)', type: 'money', group: 'Hiệu suất' },
  cpm: { name: 'CPM', type: 'money', group: 'Hiệu suất' },
  frequency: { name: 'Tần suất ước tính*', type: 'number', group: 'Hiệu suất' },
  'actions:purchase': { name: 'Đơn hàng (lượt mua)', type: 'number', group: 'Chuyển đổi' },
  cpa: { name: 'CPA (lượt mua)', type: 'money', group: 'Chuyển đổi' },
  'actions:lead': { name: 'Khách hàng tiềm năng', type: 'number', group: 'Chuyển đổi' },
  cpl: { name: 'Chi phí/lead', type: 'money', group: 'Chuyển đổi' },
  purchase_value: { name: 'Doanh thu ghi nhận', type: 'money', group: 'Chuyển đổi' },
  ROAS: { name: 'ROAS', type: 'ratio', group: 'Chuyển đổi' },
};
export const CAMPAIGN_METRIC_KEYS = Object.keys(CAMPAIGN_COLUMNS).filter(
  (key) => !['text', 'status'].includes(CAMPAIGN_COLUMNS[key].type),
);
export const DEFAULT_CAMPAIGN_COLUMNS = {
  version: 1,
  selected_columns: [
    'name',
    'account_name',
    'daily_budget',
    'spend',
    'actions:purchase',
    'cpa',
    'ROAS',
    'ctr',
    'status',
  ],
  custom_names: {},
  custom_metrics: [],
};
const fail = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
export function validateCampaignMetric(input) {
  if (!input || typeof input.id !== 'string' || !/^custom_[a-zA-Z0-9_-]{1,60}$/.test(input.id))
    fail('ID chỉ số tùy chỉnh không hợp lệ.');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 60)
    fail('Tên chỉ số cần có 1–60 ký tự.');
  if (!CAMPAIGN_METRIC_KEYS.includes(input.left) || !['+', '-', '*', '/'].includes(input.operator))
    fail('Chọn chỉ số và phép tính hợp lệ.');
  if (input.rightType === 'metric') {
    if (!CAMPAIGN_METRIC_KEYS.includes(input.right)) fail('Chỉ số thứ hai không hợp lệ.');
  } else if (
    input.rightType !== 'constant' ||
    !['string', 'number'].includes(typeof input.right) ||
    String(input.right).trim() === '' ||
    String(input.right).length > 100 ||
    !Number.isFinite(Number(input.right))
  )
    fail('Hằng số không hợp lệ.');
  if (!['number', 'money', 'percent', 'ratio'].includes(input.type))
    fail('Định dạng chỉ số không hợp lệ.');
  return {
    id: input.id,
    name: input.name.trim(),
    left: input.left,
    operator: input.operator,
    rightType: input.rightType,
    right: input.right,
    type: input.type,
  };
}
export function validateCampaignColumns(input) {
  if (
    !input ||
    input.version !== 1 ||
    !Array.isArray(input.custom_metrics) ||
    input.custom_metrics.length > 12
  )
    fail('Cấu hình cột không hợp lệ; tối đa 12 chỉ số tùy chỉnh.');
  const custom_metrics = input.custom_metrics.map(validateCampaignMetric);
  if (new Set(custom_metrics.map((metric) => metric.id)).size !== custom_metrics.length)
    fail('Chỉ số tùy chỉnh bị trùng ID.');
  const allowed = new Set([
    ...Object.keys(CAMPAIGN_COLUMNS),
    ...custom_metrics.map((metric) => metric.id),
  ]);
  if (
    !Array.isArray(input.selected_columns) ||
    !input.selected_columns.length ||
    input.selected_columns.length > 40 ||
    input.selected_columns.some((key) => !allowed.has(key))
  )
    fail('Chọn ít nhất một cột hợp lệ, tối đa 40 cột.');
  if (new Set(input.selected_columns).size !== input.selected_columns.length)
    fail('Cột hiển thị bị trùng.');
  if (
    !input.custom_names ||
    typeof input.custom_names !== 'object' ||
    Array.isArray(input.custom_names)
  )
    fail('Tên cột không hợp lệ.');
  const custom_names = {};
  for (const [key, name] of Object.entries(input.custom_names)) {
    if (!Object.hasOwn(CAMPAIGN_COLUMNS, key) || typeof name !== 'string' || name.length > 60)
      fail('Tên cột cần có tối đa 60 ký tự và thuộc chỉ số hợp lệ.');
    if (name.trim()) custom_names[key] = name.trim();
  }
  return {
    version: 1,
    selected_columns: [...input.selected_columns],
    custom_names,
    custom_metrics,
  };
}
export function campaignColumnDefinitions(config) {
  const custom = new Map(config.custom_metrics.map((metric) => [metric.id, metric]));
  return config.selected_columns.map((key) => ({
    key,
    ...(CAMPAIGN_COLUMNS[key] || { ...custom.get(key), group: 'Tùy chỉnh' }),
    name: config.custom_names[key] || CAMPAIGN_COLUMNS[key]?.name || custom.get(key)?.name,
  }));
}
export function evaluateCampaignMetric(metric, row) {
  const left = row[metric.left],
    right = metric.rightType === 'constant' ? Number(metric.right) : row[metric.right];
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  const value =
    metric.operator === '+'
      ? left + right
      : metric.operator === '-'
        ? left - right
        : metric.operator === '*'
          ? left * right
          : divide(left, right);
  return Number.isFinite(value) ? value : null;
}
export function buildCampaignRows(campaigns, rows, accounts, bms, config) {
  const byCampaign = new Map(),
    accountMap = new Map(accounts.map((account) => [account.id, account])),
    bmMap = new Map(bms.map((bm) => [bm.id, bm]));
  for (const row of rows) {
    if (!byCampaign.has(row.campaign_id)) byCampaign.set(row.campaign_id, []);
    byCampaign.get(row.campaign_id).push(row);
  }
  return campaigns.map((campaign) => {
    const stats = aggregate(
      (byCampaign.get(campaign.id) || []).filter((row) => row.account_id === campaign.account_id),
    );
    const account = accountMap.get(campaign.account_id);
    const result = {
      ...campaign,
      ...stats,
      account_name: account?.name || null,
      bm_id: account?.bm_id || null,
      bm_name: bmMap.get(account?.bm_id)?.name || null,
      cpm: stats.impressions ? (stats.spend / stats.impressions) * 1000 : null,
      cpl: divide(stats.spend, stats['actions:lead']),
    };
    for (const metric of config.custom_metrics)
      result[metric.id] = evaluateCampaignMetric(metric, result);
    return result;
  });
}
export function sortCampaignRows(rows, { key, dir }) {
  return [...rows].sort((a, b) => {
    const left = a[key],
      right = b[key];
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    return (
      dir *
      (typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right), 'vi', { numeric: true }))
    );
  });
}
