const invalid = (message) => Object.assign(new Error(message), { status: 400 });
export const METRICS = {
  spend: { name: 'Chi phí quảng cáo', type: 'money' },
  impressions: { name: 'Lượt hiển thị', type: 'number' },
  reach: { name: 'Tiếp cận cộng dồn*', type: 'number' },
  clicks: { name: 'Lượt nhấp', type: 'number' },
  ctr: { name: 'CTR', type: 'percent' },
  cpc: { name: 'CPC', type: 'money' },
  'actions:lead': { name: 'Khách hàng tiềm năng', type: 'number' },
  'actions:purchase': { name: 'Đơn hàng', type: 'number' },
  purchase_value: { name: 'Doanh thu', type: 'money' },
  ROAS: { name: 'ROAS', type: 'ratio' },
};
export const DEFAULT_CONFIG = {
  selected_metrics: [
    'spend',
    'impressions',
    'clicks',
    'actions:purchase',
    'purchase_value',
    'ROAS',
  ],
  custom_names: {},
  custom_metrics: [],
};
export const SEVEN_DAYS = 7 * 86400000;
export function todayISO(now = new Date(), timezone = 'Asia/Ho_Chi_Minh') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function shiftDate(date, offset) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
export function rangeFor(period, today = todayISO()) {
  const n = period === 'yesterday' ? 1 : Number(period) || 7;
  return period === 'yesterday'
    ? { since: shiftDate(today, -1), until: shiftDate(today, -1) }
    : { since: shiftDate(today, 1 - n), until: today };
}
export function monthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw invalid('Tháng không hợp lệ.');
  const [y, m] = month.split('-').map(Number);
  if (y < 2000 || y > 2100) throw invalid('Năm không hợp lệ.');
  return { since: `${month}-01`, until: `${month}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}` };
}
export function datesBetween(since, until) {
  const r = [];
  for (let d = since; d <= until; d = shiftDate(d, 1)) {
    r.push(d);
    if (r.length > 400) throw invalid('Khoảng ngày quá dài.');
  }
  return r;
}
export const divide = (a, b) => (b ? a / b : null);
export function aggregate(rows = []) {
  const sum = {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    'actions:lead': 0,
    'actions:purchase': 0,
    purchase_value: 0,
  };
  for (const row of rows) for (const k of Object.keys(sum)) sum[k] += Number(row[k] ?? 0);
  return {
    ...sum,
    ctr: sum.impressions ? (sum.clicks / sum.impressions) * 100 : null,
    cpc: divide(sum.spend, sum.clicks),
    ROAS: divide(sum.purchase_value, sum.spend),
    cpa: divide(sum.spend, sum['actions:purchase']),
    frequency: divide(sum.impressions, sum.reach),
    conversions: sum['actions:purchase'],
  };
}
export function metricValue(row, key) {
  return row[key] ?? (key === 'ROAS' ? divide(row.purchase_value, row.spend) : null);
}
export function validateCustom(metric) {
  if (!metric || typeof metric.name !== 'string' || !metric.name.trim() || metric.name.length > 60)
    throw invalid('Tên chỉ số phải có 1–60 ký tự.');
  if (!Object.hasOwn(METRICS, metric.left) || !['+', '-', '*', '/'].includes(metric.operator))
    throw invalid('Công thức không hợp lệ.');
  if (metric.rightType === 'constant') {
    if (!Number.isFinite(Number(metric.right)) || String(metric.right).trim() === '')
      throw invalid('Hằng số không hợp lệ.');
  } else if (metric.rightType !== 'metric' || !Object.hasOwn(METRICS, metric.right))
    throw invalid('Chọn chỉ số thứ hai.');
  if (!['number', 'money', 'percent', 'ratio'].includes(metric.type))
    throw invalid('Định dạng không hợp lệ.');
  return metric;
}
// A structured expression evaluator; never execute user text with eval / new Function.
export function evaluateMetric(metric, row) {
  validateCustom(metric);
  const a = metricValue(row, metric.left),
    b = metric.rightType === 'constant' ? Number(metric.right) : metricValue(row, metric.right);
  if (a == null || b == null) return null;
  const value =
    metric.operator === '+'
      ? a + b
      : metric.operator === '-'
        ? a - b
        : metric.operator === '*'
          ? a * b
          : divide(a, b);
  return Number.isFinite(value) ? value : null;
}
export function validateConfig(config) {
  if (
    !Array.isArray(config.selected_metrics) ||
    !config.selected_metrics.length ||
    config.selected_metrics.some((k) => !Object.hasOwn(METRICS, k))
  )
    throw invalid('Chọn ít nhất một chỉ số hợp lệ.');
  if (new Set(config.selected_metrics).size !== config.selected_metrics.length)
    throw invalid('Chỉ số bị trùng.');
  if (
    !config.custom_names ||
    typeof config.custom_names !== 'object' ||
    Array.isArray(config.custom_names)
  )
    throw invalid('Tên chỉ số không hợp lệ.');
  for (const [k, v] of Object.entries(config.custom_names))
    if (!Object.hasOwn(METRICS, k) || typeof v !== 'string' || v.length > 60)
      throw invalid('Tên tùy chỉnh quá dài hoặc không hợp lệ.');
  if (!Array.isArray(config.custom_metrics) || config.custom_metrics.length > 12)
    throw invalid('Tối đa 12 chỉ số tùy chỉnh.');
  for (const metric of config.custom_metrics) {
    validateCustom(metric);
    if (!/^custom_[a-zA-Z0-9_-]{1,60}$/.test(metric.id)) throw invalid('ID chỉ số không hợp lệ.');
  }
  if (new Set(config.custom_metrics.map((m) => m.id)).size !== config.custom_metrics.length)
    throw invalid('ID chỉ số bị trùng.');
  return {
    selected_metrics: config.selected_metrics,
    custom_names: config.custom_names,
    custom_metrics: config.custom_metrics,
  };
}
export function reportColumns(config) {
  return [
    ...config.selected_metrics.map((key) => ({
      key,
      name: config.custom_names[key] || METRICS[key].name,
      type: METRICS[key].type,
    })),
    ...config.custom_metrics.map((m) => ({ key: m.id, name: m.name, type: m.type })),
  ];
}
export function makeReport(rows, month, config, cutoff = todayISO()) {
  const { since, until } = monthRange(month);
  const decorate = (row) => ({
    ...row,
    ...Object.fromEntries(config.custom_metrics.map((m) => [m.id, evaluateMetric(m, row)])),
  });
  const inMonth = rows.filter((r) => r.date >= since && r.date <= until);
  return {
    rows: datesBetween(since, until).map((date) => ({
      date,
      future: date > cutoff,
      ...decorate(aggregate(inMonth.filter((r) => r.date === date))),
    })),
    total: decorate(aggregate(inMonth)),
    columns: reportColumns(config),
  };
}
export function format(value, type = 'number', currency = 'VND') {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  if (type === 'money')
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'VND' ? 0 : 2,
    }).format(n);
  if (type === 'percent') return `${n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
  if (type === 'ratio')
    return `${n.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}
export function campaignInsights(campaigns, rows, { since, until }, targetCPA = 150000) {
  const result = [];
  for (const campaign of campaigns) {
    const cr = rows.filter((r) => r.campaign_id === campaign.id);
    const stats = aggregate(cr.filter((r) => r.date >= since && r.date <= until));
    if (stats.spend <= 0) continue;
    const add = (rule, title, reason, action, severity) =>
      result.push({
        id: `${campaign.id}_${rule}`,
        campaign_id: campaign.id,
        campaign: campaign.name,
        title,
        reason,
        action,
        severity,
      });
    if (stats.ROAS < 1.5)
      add(
        'roas',
        'ROAS dưới ngưỡng hiệu quả',
        `ROAS ${format(stats.ROAS, 'ratio')} trên ${format(stats.spend, 'money')} chi tiêu.`,
        'Rà soát nhóm quảng cáo và trang đích trước khi tăng ngân sách.',
        'danger',
      );
    if (stats.cpa > targetCPA * 1.5)
      add(
        'cpa',
        'Chi phí chuyển đổi tăng cao',
        `CPA ${format(stats.cpa, 'money')} vượt 150% mục tiêu ${format(targetCPA, 'money')}.`,
        'Thử tệp đối tượng mới và giảm phân bổ cho nhóm CPA cao.',
        'warning',
      );
    const recentStart = shiftDate(until, -2),
      priorStart = shiftDate(until, -5);
    const recent = aggregate(
      cr.filter((r) => r.date >= recentStart && r.date <= until && r.date >= since),
    );
    const priorRows = cr.filter(
      (r) => r.date >= priorStart && r.date < recentStart && r.date >= since,
    );
    const prior = aggregate(priorRows);
    if (prior.ctr > 0 && recent.ctr != null && recent.ctr / prior.ctr < 0.7)
      add(
        'ctr',
        'Nội dung có dấu hiệu giảm sức hút',
        `CTR 3 ngày cuối giảm ${Math.round((1 - recent.ctr / prior.ctr) * 100)}% so với 3 ngày trước trong bộ lọc.`,
        'Thử hình ảnh và hook mới; giữ một mẫu đối chứng.',
        'warning',
      );
    // Frequency is evaluated per campaign-day; summed daily reach is not unique period reach.
    const maxFrequency = Math.max(
      0,
      ...cr.filter((r) => r.date >= since && r.date <= until).map((r) => Number(r.frequency) || 0),
    );
    if (maxFrequency > 3.5)
      add(
        'frequency',
        'Tần suất tiếp cận cao',
        `Có ngày tần suất đạt ${format(maxFrequency)} lần/người.`,
        'Làm mới creative hoặc mở rộng tệp đối tượng.',
        'warning',
      );
  }
  return result.sort(
    (a, b) => (a.severity === 'danger' ? -1 : 1) - (b.severity === 'danger' ? -1 : 1),
  );
}
