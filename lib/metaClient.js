import { createHmac } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { shiftDate } from './metrics.js';
const root = 'https://graph.facebook.com';
const deadlineContext = new AsyncLocalStorage();
export const withMetaDeadline = (deadline, task) => deadlineContext.run(deadline, task);
export const apiVersion = () => process.env.META_API_VERSION || 'v25.0';
export async function graph(path, params, token, fetcher = fetch, { method = 'GET' } = {}) {
  if (!token)
    throw Object.assign(new Error('Chưa cấu hình META_ACCESS_TOKEN hoặc chưa kết nối Facebook.'), {
      status: 503,
    });
  const url = new URL(`${root}/${apiVersion()}/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params || {}))
    url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  if (process.env.META_APP_SECRET)
    url.searchParams.set(
      'appsecret_proof',
      createHmac('sha256', process.env.META_APP_SECRET).update(token).digest('hex'),
    );
  const body = method === 'POST' ? url.searchParams.toString() : undefined;
  if (method === 'POST') url.search = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = (deadlineContext.getStore() ?? Infinity) - Date.now();
    if (remaining <= 0)
      throw new Error('Hết thời gian đồng bộ. Dữ liệu cũ được giữ; hãy đồng bộ lại.');
    let response, data;
    try {
      response = await fetcher(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        ...(method === 'POST' ? { method, body } : {}),
        signal: AbortSignal.timeout(Math.max(1, Math.min(25000, remaining))),
      });
      data = await response.json();
    } catch (error) {
      const transient = ['TimeoutError', 'AbortError', 'TypeError'].includes(error.name);
      const waitMs = 500 * 2 ** attempt;
      const timeLeft = (deadlineContext.getStore() ?? Infinity) - Date.now();
      if (transient && attempt < 2 && timeLeft > waitMs) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      if (['TimeoutError', 'AbortError'].includes(error.name))
        throw new Error('Meta phản hồi quá lâu. Vui lòng đồng bộ lại tài khoản này.');
      throw error;
    }
    if (response.ok && !data.error) return data;
    const retry =
      response.status === 429 ||
      response.status >= 500 ||
      [1, 2, 4, 17, 32, 613].includes(data.error?.code);
    if (retry && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      continue;
    }
    const error = new Error(`Meta API: ${data.error?.message || response.status}`);
    error.status = 502;
    error.code = data.error?.code;
    throw error;
  }
}
export async function graphList(path, params, token, fetcher = fetch) {
  const result = [];
  let after;
  const seen = new Set();
  do {
    const page = await graph(
      path,
      { ...params, limit: 200, ...(after ? { after } : {}) },
      token,
      fetcher,
    );
    result.push(...(page.data || []));
    after = page.paging?.next ? page.paging?.cursors?.after : undefined;
    if (after && seen.has(after)) throw new Error('Meta pagination cursor repeated.');
    seen.add(after);
  } while (after);
  return result;
}
const accountFields =
  'id,name,account_status,balance,amount_spent,currency,timezone_name,user_tasks,business{id,name}';
export async function getBmsAndAccounts(token, fetcher = fetch) {
  let bms;
  try {
    bms = await graphList('me/businesses', { fields: 'id,name' }, token, fetcher);
  } catch (error) {
    // Some System User token types expose adaccounts but not the businesses edge.
    if (error.code === 100 && /nonexisting field|unsupported get request/i.test(error.message))
      bms = [];
    else throw error;
  }
  const businesses = new Map(bms.map((b) => [b.id, b]));
  const accounts = new Map();
  const addAccount = (account, owningBusiness = null) => {
    // The business field identifies the owner, even for accounts shared with another BM.
    const owner = account.business?.id ? account.business : owningBusiness;
    if (owner?.id)
      businesses.set(owner.id, {
        id: owner.id,
        name: owner.name || businesses.get(owner.id)?.name || `BM ${owner.id}`,
      });
    const previous = accounts.get(account.id);
    accounts.set(account.id, {
      ...previous,
      ...account,
      bm_id: owner?.id || previous?.bm_id || null,
    });
  };
  for (const bm of bms) {
    const owned = await graphList(
      `${bm.id}/owned_ad_accounts`,
      { fields: accountFields },
      token,
      fetcher,
    );
    const shared = await graphList(
      `${bm.id}/client_ad_accounts`,
      { fields: accountFields },
      token,
      fetcher,
    );
    for (const a of shared) addAccount(a);
    for (const a of owned) addAccount(a, bm);
  }
  // System Users may expose no /me/businesses while their assigned accounts still have owners.
  const assigned = await graphList('me/adaccounts', { fields: accountFields }, token, fetcher);
  for (const a of assigned) addAccount(a);
  return { bms: [...businesses.values()], accounts: [...accounts.values()] };
}
export function getDailyInsights(adAccountId, since, until, token, fetcher = fetch) {
  return graphList(
    `${adAccountId}/insights`,
    {
      fields:
        'campaign_id,campaign_name,date_start,spend,impressions,reach,clicks,ctr,cpc,frequency,actions,action_values',
      level: 'campaign',
      time_increment: 1,
      time_range: { since, until },
      action_report_time: 'conversion',
      use_account_attribution_setting: true,
    },
    token,
    fetcher,
  );
}
export async function getDailyInsightsInChunks(adAccountId, since, until, token, fetcher = fetch) {
  const rows = [];
  for (let start = since; start <= until; ) {
    const end = [shiftDate(start, 6), until].sort()[0];
    rows.push(...(await getDailyInsights(adAccountId, start, end, token, fetcher)));
    start = shiftDate(end, 1);
  }
  return rows;
}
export const campaignFields = 'id,name,status,effective_status,daily_budget,objective';
export function getCampaigns(id, token, fetcher = fetch) {
  return graphList(`${id}/campaigns`, { fields: campaignFields }, token, fetcher);
}
export function getActiveCampaigns(id, token, fetcher = fetch) {
  return graphList(
    `${id}/campaigns`,
    { fields: campaignFields, effective_status: ['ACTIVE'] },
    token,
    fetcher,
  );
}
export async function getCampaignsByIds(ids, token, fetcher = fetch) {
  const campaigns = [],
    warnings = [];
  const unique = [...new Set(ids)].filter((id) => /^\d{1,40}$/.test(id));
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const result = await graph(
      '',
      {
        batch: batch.map((id) => ({
          method: 'GET',
          relative_url: `${id}?fields=${encodeURIComponent(campaignFields)}`,
        })),
      },
      token,
      fetcher,
      { method: 'POST' },
    );
    if (!Array.isArray(result))
      throw new Error('Meta trả phản hồi batch không hợp lệ. Vui lòng thử lại.');
    for (let index = 0; index < batch.length; index++) {
      const id = batch[index];
      let item;
      try {
        item =
          typeof result[index]?.body === 'string'
            ? JSON.parse(result[index].body)
            : result[index]?.body;
      } catch {}
      if (item?.error?.code === 190)
        throw Object.assign(new Error('Token Meta đã hết hạn. Vui lòng kết nối lại Facebook.'), {
          code: 190,
        });
      if (result[index]?.code === 200 && item?.id === id) campaigns.push(item);
      else warnings.push(`Không xác minh được trạng thái chiến dịch ${id}; giữ dữ liệu đã có.`);
    }
  }
  return { campaigns, warnings };
}
export function fromMinor(value, currency = 'VND') {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits;
  return Number(value || 0) / 10 ** digits;
}
// Meta returns overlapping action aliases; take the first canonical entry, never sum aliases.
export function actionValue(actions, type) {
  const aliases =
    type === 'purchase'
      ? ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']
      : ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];
  for (const alias of aliases) {
    const match = (actions || []).find((a) => a.action_type === alias);
    if (match) return Number(match.value) || 0;
  }
  return 0;
}
export function normalizeInsight(row, workspace_id, account_id) {
  return {
    workspace_id,
    account_id,
    campaign_id: row.campaign_id,
    date: row.date_start,
    spend: Number(row.spend) || 0,
    impressions: Number(row.impressions) || 0,
    reach: Number(row.reach) || 0,
    clicks: Number(row.clicks) || 0,
    ctr: Number(row.ctr) || 0,
    cpc: Number(row.cpc) || 0,
    frequency: Number(row.frequency) || 0,
    leads: actionValue(row.actions, 'lead'),
    purchases: actionValue(row.actions, 'purchase'),
    purchase_value: actionValue(row.action_values, 'purchase'),
    synced_at: new Date().toISOString(),
  };
}
export function toMetricRow(row) {
  return {
    ...row,
    'actions:lead': Number(row.leads) || 0,
    'actions:purchase': Number(row.purchases) || 0,
  };
}
