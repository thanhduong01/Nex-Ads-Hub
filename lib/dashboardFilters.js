export const UNASSIGNED_BM = 'unassigned';

const STATUS_LABELS = {
  ACTIVE: 'Đang chạy',
  PAUSED: 'Tạm dừng',
  ARCHIVED: 'Đã lưu trữ',
  DELETED: 'Đã xóa',
  UNKNOWN: 'Chưa xác định',
};
const statusOf = (campaign) => campaign.status || 'UNKNOWN';
export const campaignStatusLabel = (status) => STATUS_LABELS[status || 'UNKNOWN'] || status;

export function campaignStatusOptions(campaigns) {
  const values = new Set(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED', ...campaigns.map(statusOf)]);
  return [
    { value: 'all', label: 'Tất cả trạng thái' },
    ...[...values].map((value) => ({ value, label: campaignStatusLabel(value) })),
  ];
}

export function dashboardScope(
  data,
  bm = 'all',
  account = 'all',
  campaign = 'all',
  status = 'all',
) {
  const tracked = data.accounts.filter((a) => a.is_tracked && a.currency === 'VND');
  const choices = tracked.filter(
    (a) => bm === 'all' || (bm === UNASSIGNED_BM ? !a.bm_id : a.bm_id === bm),
  );
  const accounts = choices.filter((a) => account === 'all' || a.id === account);
  const ids = new Set(accounts.map((a) => a.id));
  const campChoices = data.campaigns.filter(
    (c) => ids.has(c.account_id) && (status === 'all' || statusOf(c) === status),
  );
  const campaigns = campChoices.filter((c) => campaign === 'all' || c.id === campaign);
  const campaignIds = new Set(campaigns.map((c) => c.id));
  const rows = data.rows.filter((r) => ids.has(r.account_id) && campaignIds.has(r.campaign_id));
  return { tracked, choices, accounts, campChoices, campaigns, rows };
}
