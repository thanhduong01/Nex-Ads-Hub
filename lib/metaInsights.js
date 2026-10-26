import { graphList, withMetaDeadline, apiVersion } from './metaClient.js';
import { META_INSIGHT_FIELDS, metaColumn } from './metaMetricCatalog.js';
import { checked } from './supabase.js';
import { decrypt, fail } from './server.js';

export function validateMetaInsightRequest(input) {
  if (!input || !/^act_\d{1,40}$/.test(input.account_id || ''))
    throw fail('Tài khoản quảng cáo không hợp lệ.');
  const validDate = (value) =>
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (
    !validDate(input.since) ||
    !validDate(input.until) ||
    input.since > input.until ||
    (Date.parse(input.until) - Date.parse(input.since)) / 86400000 > 30
  )
    throw fail('Chọn khoảng ngày hợp lệ, tối đa 31 ngày.');
  if (
    !Array.isArray(input.fields) ||
    !input.fields.length ||
    input.fields.length > Object.keys(META_INSIGHT_FIELDS).length ||
    input.fields.some(
      (field) => typeof field !== 'string' || !Object.hasOwn(META_INSIGHT_FIELDS, field),
    )
  )
    throw fail('Trường Meta Insights không hợp lệ.');
  if (input.campaign_id && !/^\d{1,40}$/.test(input.campaign_id))
    throw fail('Chiến dịch không hợp lệ.');
  return {
    account_id: input.account_id,
    since: input.since,
    until: input.until,
    fields: [...new Set(input.fields)],
    campaign_id: input.campaign_id || null,
  };
}
export const safeMetaError = (error) =>
  String(error?.message || 'Không đọc được dữ liệu Meta.')
    .replace(/(access_token|client_secret|appsecret_proof|token)=[^&\s]+/gi, '$1=[redacted]')
    .slice(0, 500);

// Whole-period requests preserve Meta's non-additive metrics (reach, frequency, rates and costs).
export async function readMetaPeriod(input, token, { fetcher = fetch, budgetMs = 50000 } = {}) {
  const request = validateMetaInsightRequest(input);
  const deadline = Date.now() + budgetMs;
  const rows = new Map(),
    unavailable = [],
    available = new Set(),
    discovered = new Set();
  const fields = request.fields.filter(
    (field) => !['campaign_id', 'date_start', 'date_stop'].includes(field),
  );
  async function read(group) {
    if (Date.now() >= deadline) {
      unavailable.push(
        ...group.map((field) => ({
          field,
          code: 'TIMEOUT',
          message: 'Chưa lấy xong trong lượt này. Nhấn tải lại chỉ số Meta hoặc thu hẹp bộ lọc.',
        })),
      );
      return;
    }
    let result;
    try {
      result = await graphList(
        `${request.account_id}/insights`,
        {
          fields: [...new Set(['campaign_id', 'date_start', 'date_stop', ...group])].join(','),
          level: 'campaign',
          time_range: { since: request.since, until: request.until },
          ...(request.campaign_id
            ? {
                filtering: [{ field: 'campaign.id', operator: 'IN', value: [request.campaign_id] }],
              }
            : {}),
          action_report_time: 'conversion',
          use_account_attribution_setting: true,
        },
        token,
        fetcher,
      );
    } catch (error) {
      // Isolate only parameter/field errors. Authentication, permission and rate limits surface intact.
      if (error.code === 100 && group.length > 1) {
        const middle = Math.ceil(group.length / 2);
        await read(group.slice(0, middle));
        await read(group.slice(middle));
        return;
      }
      if (error.code === 100) {
        unavailable.push(
          ...group.map((field) => ({ field, code: 100, message: safeMetaError(error) })),
        );
        return;
      }
      if (
        [1, 2, 4, 17, 32, 613].includes(error.code) ||
        /Hết thời gian|phản hồi quá lâu/i.test(error.message)
      ) {
        unavailable.push(
          ...group.map((field) => ({
            field,
            code: error.code || 'TIMEOUT',
            message: safeMetaError(error),
          })),
        );
        return;
      }
      throw error;
    }
    group.forEach((field) => available.add(field));
    for (const row of result) {
      if (!/^\d+$/.test(row.campaign_id || '')) continue;
      const target = rows.get(row.campaign_id) || {
        campaign_id: row.campaign_id,
        account_id: request.account_id,
        metrics: { campaign_id: row.campaign_id },
      };
      for (const field of group)
        if (Object.hasOwn(row, field)) {
          target.metrics[field] = row[field];
          if (META_INSIGHT_FIELDS[field].includes('AdsActionStats') && Array.isArray(row[field]))
            for (const item of row[field]) {
              const key = `meta:${field}:${item.action_type}`;
              if (metaColumn(key)) discovered.add(key);
            }
        }
      target.metrics.date_start = row.date_start;
      target.metrics.date_stop = row.date_stop;
      rows.set(row.campaign_id, target);
    }
  }
  await withMetaDeadline(deadline, async () => {
    if (!fields.length) await read([]);
    for (let start = 0; start < fields.length; start += 16)
      await read(fields.slice(start, start + 16));
  });
  const result = {
    account_id: request.account_id,
    since: request.since,
    until: request.until,
    api_version: apiVersion(),
    rows: [...rows.values()],
    available_fields: [...available],
    unavailable_fields: unavailable,
    discovered_columns: [...discovered],
    fetched_at: new Date().toISOString(),
  };
  if (Buffer.byteLength(JSON.stringify(result)) > 3000000)
    throw fail('Dữ liệu chỉ số quá lớn. Chọn một chiến dịch hoặc giảm số cột rồi tải lại.', 503);
  return result;
}

export async function loadWorkspaceMetaInsights(session, input, options) {
  const request = validateMetaInsightRequest(input);
  // Never use an account/token supplied by the browser without checking server-owned workspace scope.
  const account = checked(
    await session.db
      .from('ad_accounts')
      .select('id,currency,is_tracked,meta_token_encrypted,fb_user_id')
      .eq('workspace_id', session.user_id)
      .eq('id', request.account_id)
      .maybeSingle(),
  );
  if (!account || !account.is_tracked)
    throw fail('Không có quyền đọc tài khoản quảng cáo này.', 403);
  if (account.currency !== 'VND')
    throw fail('Bảng Tổng quan chỉ dùng tài khoản VND để không trộn đơn vị tiền.', 400);
  const token = account.meta_token_encrypted
    ? decrypt(account.meta_token_encrypted)
    : process.env.META_ACCESS_TOKEN;
  try {
    return await readMetaPeriod(request, token, options);
  } catch (error) {
    throw fail(safeMetaError(error), 503);
  }
}
