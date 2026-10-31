import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { allRows, checked, databaseConfiguration } from './supabase.js';
import { decrypt, fail } from './server.js';
import { withDatabaseDeadline } from './requestBudget.js';
import {
  getDailyInsights,
  getCampaigns,
  getActiveCampaigns,
  getCampaignsByIds,
  normalizeInsight,
  toMetricRow,
  fromMinor,
  withMetaDeadline,
} from './metaClient.js';
import { todayISO, monthRange, shiftDate } from './metrics.js';

export const SYNC_FRESH_MS = 15 * 60000;
export const STEP_BUDGET_MS = 38000;
const key = () => {
  const secret =
    process.env.TOKEN_ENCRYPTION_KEY || databaseConfiguration().SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw fail('Chưa có khóa máy chủ để xác thực lượt đồng bộ.', 503);
  return secret;
};
export function signSyncJob(job, secret = key()) {
  const payload = Buffer.from(JSON.stringify(job)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function readSyncJob(token, workspace, secret = key(), now = Date.now()) {
  if (typeof token !== 'string' || token.length > 12000) throw fail('Lượt đồng bộ không hợp lệ.');
  const [payload, signature, ...rest] = token.split('.');
  const expected = createHmac('sha256', secret)
    .update(payload || '')
    .digest('base64url');
  if (
    rest.length ||
    !signature ||
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    throw fail('Lượt đồng bộ không hợp lệ.', 403);
  let job;
  try {
    job = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    throw fail('Lượt đồng bộ không hợp lệ.');
  }
  if (job.workspace !== workspace) throw fail('Không có quyền thực hiện lượt đồng bộ này.', 403);
  if (job.v !== 1 || job.expires < now || !Array.isArray(job.steps) || !job.steps[job.index])
    throw fail('Lượt đồng bộ đã hết hạn. Nhấn đồng bộ để bắt đầu lại.', 409);
  return job;
}
export function buildAccountJob(account, { month, now = new Date() } = {}) {
  const today = todayISO(
    now,
    account.timezone_name || process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh',
  );
  const period = month
    ? monthRange(month)
    : { since: [`${today.slice(0, 7)}-01`, shiftDate(today, -27)].sort()[0], until: today };
  const until = period.until > today ? today : period.until;
  if (period.since > until) return null;
  const last = Date.parse(account.last_synced_at);
  const lastDay = Number.isFinite(last)
    ? todayISO(new Date(last), account.timezone_name || 'Asia/Ho_Chi_Minh')
    : null;
  const reconcile = !lastDay || lastDay !== today;
  const since =
    month || reconcile ? period.since : [period.since, shiftDate(lastDay, -7)].sort().at(-1);
  const recentSince = until;
  const steps = [{ kind: 'recent', since: recentSince, until }];
  for (let end = shiftDate(recentSince, -1); end >= since; ) {
    const start = [since, shiftDate(end, -6)].sort().at(-1);
    steps.push({ kind: 'history', since: start, until: end });
    end = shiftDate(start, -1);
  }
  steps.push({ kind: reconcile ? 'catalogue' : 'status' });
  return {
    v: 1,
    workspace: account.workspace_id,
    account_id: account.id,
    run: randomUUID(),
    since,
    until,
    steps,
    index: 0,
    expires: now.getTime() + 3600000,
  };
}
const publicAccountFields =
  'workspace_id,id,name,is_tracked,currency,timezone_name,last_synced_at,last_sync_error,sync_lock_until';
export async function createSyncPlan(
  db,
  workspace,
  { month, accountIds, priorityIds = [], force = false, now = new Date() } = {},
) {
  if (month) monthRange(month);
  if (accountIds && (!Array.isArray(accountIds) || accountIds.some((id) => typeof id !== 'string')))
    throw fail('Danh sách tài khoản không hợp lệ.');
  if (accountIds?.length === 0) return { jobs: [], fresh: 0, locked: 0, totalSteps: 0 };
  const accounts = await allRows(() => {
    let query = db
      .from('ad_accounts')
      .select(publicAccountFields)
      .eq('workspace_id', workspace)
      .eq('is_tracked', true)
      .order('last_synced_at', { ascending: true, nullsFirst: true })
      .order('id');
    if (accountIds) query = query.in('id', accountIds);
    return query;
  });
  const priority = new Set(priorityIds);
  accounts.sort((a, b) => Number(priority.has(b.id)) - Number(priority.has(a.id)));
  const jobs = [];
  let fresh = 0,
    locked = 0;
  for (const account of accounts) {
    if (Date.parse(account.sync_lock_until) > now.getTime()) {
      locked++;
      continue;
    }
    if (!force && !month && now.getTime() - Date.parse(account.last_synced_at) < SYNC_FRESH_MS) {
      fresh++;
      continue;
    }
    const job = buildAccountJob(account, { month, now });
    if (job)
      jobs.push({
        id: account.id,
        name: account.name,
        token: signSyncJob(job),
        totalSteps: job.steps.length,
      });
  }
  return { jobs, fresh, locked, totalSteps: jobs.reduce((sum, j) => sum + j.totalSteps, 0) };
}
const safeError = (error) =>
  String(error?.message || 'Đồng bộ chưa hoàn tất. Vui lòng thử lại.')
    .replace(/(access_token|client_secret|appsecret_proof|token)=[^&\s]+/gi, '$1=[redacted]')
    .slice(0, 600);
function campaignRow(campaign, account) {
  return {
    workspace_id: account.workspace_id,
    id: campaign.id,
    account_id: account.id,
    name: campaign.name || `Chiến dịch ${campaign.id}`,
    status: campaign.effective_status || campaign.status || 'UNKNOWN',
    daily_budget: campaign.daily_budget ? fromMinor(campaign.daily_budget, account.currency) : null,
    objective: campaign.objective || null,
  };
}
export async function performSyncStep(
  db,
  workspace,
  token,
  { budgetMs = STEP_BUDGET_MS, fetcher = fetch } = {},
) {
  const job = readSyncJob(token, workspace),
    step = job.steps[job.index];
  const deadline = Date.now() + budgetMs;
  const account = checked(
    await db
      .from('ad_accounts')
      .select(`${publicAccountFields},meta_token_encrypted`)
      .eq('workspace_id', workspace)
      .eq('id', job.account_id)
      .eq('is_tracked', true)
      .maybeSingle(),
  );
  if (!account) throw fail('Tài khoản đã ngừng theo dõi hoặc không thuộc workspace này.', 403);
  const lease = new Date(Date.now() + 90000).toISOString();
  const claim = checked(
    await db
      .from('ad_accounts')
      .update({ sync_lock_until: lease })
      .eq('workspace_id', workspace)
      .eq('id', account.id)
      .or(`sync_lock_until.is.null,sync_lock_until.lt.${new Date().toISOString()}`)
      .select('id'),
  );
  if (!claim.length)
    return {
      id: account.id,
      deferred: true,
      message: 'Tài khoản đang đồng bộ ở phiên khác. Dữ liệu sẽ được tải lại khi hoàn tất.',
    };
  try {
    return await withDatabaseDeadline(deadline, () =>
      withMetaDeadline(deadline, async () => {
        const metaToken = account.meta_token_encrypted
          ? decrypt(account.meta_token_encrypted)
          : process.env.META_ACCESS_TOKEN;
        let campaigns = [],
          rows = [],
          warnings = [];
        if (step.kind === 'catalogue')
          campaigns = await getCampaigns(account.id, metaToken, fetcher);
        else if (step.kind === 'status') {
          const [active, previousActive] = await Promise.all([
            getActiveCampaigns(account.id, metaToken, fetcher),
            allRows(() =>
              db
                .from('campaigns')
                .select('id')
                .eq('workspace_id', workspace)
                .eq('account_id', account.id)
                .eq('status', 'ACTIVE')
                .order('id'),
            ),
          ]);
          const activeIds = new Set(active.map((c) => c.id));
          const detail = await getCampaignsByIds(
            previousActive.map((c) => c.id).filter((id) => !activeIds.has(id)),
            metaToken,
            fetcher,
          );
          campaigns = [...active, ...detail.campaigns];
          warnings = detail.warnings;
        } else {
          rows = await getDailyInsights(account.id, step.since, step.until, metaToken, fetcher);
          const requested = [...new Set(rows.map((r) => r.campaign_id))];
          const detail = await getCampaignsByIds(requested, metaToken, fetcher);
          campaigns = detail.campaigns;
          warnings = detail.warnings;
          // Keep existing metadata when an individual object is no longer readable.
          const known = new Set(campaigns.map((c) => c.id));
          const missing = [...new Set(rows.map((r) => r.campaign_id))].filter(
            (id) => !known.has(id),
          );
          if (missing.length) {
            const existing = new Set();
            for (let i = 0; i < missing.length; i += 200)
              checked(
                await db
                  .from('campaigns')
                  .select('id')
                  .eq('workspace_id', workspace)
                  .eq('account_id', account.id)
                  .in('id', missing.slice(i, i + 200)),
              ).forEach((c) => existing.add(c.id));
            for (const row of rows)
              if (!known.has(row.campaign_id) && !existing.has(row.campaign_id)) {
                campaigns.push({ id: row.campaign_id, name: row.campaign_name, status: 'UNKNOWN' });
                known.add(row.campaign_id);
              }
          }
        }
        const normalized = rows.map((row) => normalizeInsight(row, workspace, account.id));
        const mapped = campaigns.map((campaign) => campaignRow(campaign, account));
        for (let i = 0; i < mapped.length; i += 400)
          checked(
            await db
              .from('campaigns')
              .upsert(mapped.slice(i, i + 400), { onConflict: 'workspace_id,id' }),
          );
        if (step.kind !== 'catalogue' && step.kind !== 'status')
          checked(
            await db.rpc('replace_insights_range', {
              p_workspace: workspace,
              p_account: account.id,
              p_since: step.since,
              p_until: step.until,
              p_rows: normalized,
            }),
          );
        const done = job.index + 1 === job.steps.length;
        const completedAt = done ? new Date().toISOString() : null;
        if (done) {
          const completed = checked(
            await db
              .from('ad_accounts')
              .update({ last_synced_at: completedAt, last_sync_error: null })
              .eq('workspace_id', workspace)
              .eq('id', account.id)
              .eq('sync_lock_until', lease)
              .select('id'),
          );
          if (!completed.length)
            throw fail(
              'Lượt đồng bộ đã được chuyển sang tiến trình khác. Hãy tải lại để kiểm tra.',
              409,
            );
        }
        return {
          id: account.id,
          workspace_id: workspace,
          phase: step.kind,
          since: step.since,
          until: step.until,
          done,
          completedSteps: job.index + 1,
          totalSteps: job.steps.length,
          next_token: done ? null : signSyncJob({ ...job, index: job.index + 1 }),
          rows: normalized.map(toMetricRow),
          campaigns: step.kind === 'catalogue' ? [] : mapped,
          metadataChanged: step.kind === 'catalogue',
          warnings,
          last_synced_at: completedAt,
        };
      }),
    );
  } catch (error) {
    const message = safeError(error);
    try {
      checked(
        await db
          .from('ad_accounts')
          .update({ last_sync_error: message })
          .eq('workspace_id', workspace)
          .eq('id', account.id)
          .eq('sync_lock_until', lease)
          .abortSignal(AbortSignal.timeout(4000)),
      );
    } catch {}
    throw fail(message, error.status === 401 ? 401 : 503);
  } finally {
    // A delayed worker must never release a newer worker's lease.
    try {
      await db
        .from('ad_accounts')
        .update({ sync_lock_until: null })
        .eq('workspace_id', workspace)
        .eq('id', account.id)
        .eq('sync_lock_until', lease)
        .abortSignal(AbortSignal.timeout(5000));
    } catch {}
  }
}
export async function runWorkspaceSync(
  db,
  { workspaceId, month, accountIds, budgetMs = 240000 } = {},
) {
  const deadline = Date.now() + budgetMs;
  const workspaces = workspaceId
    ? [{ workspace_id: workspaceId }]
    : await allRows(() =>
        db
          .from('ad_accounts')
          .select('workspace_id,id')
          .eq('is_tracked', true)
          .order('workspace_id')
          .order('id'),
      );
  const jobs = [];
  for (const workspace of new Set(workspaces.map((a) => a.workspace_id)))
    jobs.push(
      ...(await createSyncPlan(db, workspace, { month, accountIds, force: true })).jobs.map(
        (job) => ({ ...job, workspace }),
      ),
    );
  const results = [];
  let index = 0;
  async function worker() {
    while (index < jobs.length) {
      const job = jobs[index++];
      let token = job.token;
      try {
        while (token) {
          if (Date.now() >= deadline)
            throw new Error('Chưa hoàn tất trong lượt này; dữ liệu đã đồng bộ được giữ lại.');
          const result = await performSyncStep(db, job.workspace, token, {
            budgetMs: Math.min(STEP_BUDGET_MS, deadline - Date.now()),
          });
          if (result.deferred) throw new Error(result.message);
          token = result.next_token;
        }
        results.push({ id: job.id, ok: true });
      } catch (error) {
        results.push({ id: job.id, ok: false, error: safeError(error) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker));
  return {
    results,
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };
}
