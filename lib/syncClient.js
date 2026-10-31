import { api } from './api.js';
export const DEFAULT_DASHBOARD_FILTERS = {
  bm: 'all',
  account: 'all',
  camp: 'all',
  status: 'all',
  period: '7',
};
export function mergeSyncPatch(data, patch) {
  if (!patch || patch.deferred) return data;
  const campaigns = new Map(data.campaigns.map((c) => [`${c.workspace_id}/${c.id}`, c]));
  for (const campaign of patch.campaigns || [])
    campaigns.set(`${campaign.workspace_id}/${campaign.id}`, campaign);
  let rows = data.rows;
  if (patch.since && patch.until) {
    rows = rows.filter(
      (row) =>
        !(
          row.workspace_id === patch.workspace_id &&
          row.account_id === patch.id &&
          row.date >= patch.since &&
          row.date <= patch.until
        ),
    );
    rows.push(
      ...(patch.rows || []).filter(
        (row) => !data.range || (row.date >= data.range.since && row.date <= data.range.until),
      ),
    );
  }
  return {
    ...data,
    campaigns: [...campaigns.values()],
    rows,
    accounts: data.accounts.map((account) =>
      account.workspace_id === patch.workspace_id && account.id === patch.id && patch.last_synced_at
        ? { ...account, last_synced_at: patch.last_synced_at, last_sync_error: null }
        : account,
    ),
  };
}
export async function runSync(
  options = {},
  { signal, requester = api, onProgress = () => {}, onCommit = () => {} } = {},
) {
  const plan = await requester('/api/sync', {
    method: 'POST',
    body: JSON.stringify({ ...options, action: 'plan' }),
    signal,
    timeoutMs: 20000,
  });
  const jobs = plan.jobs || [];
  let completedSteps = 0,
    synced = 0,
    metadataChanged = false;
  const failures = [],
    warnings = [],
    continuations = [];
  const emit = (phase) =>
    onProgress({
      phase,
      completedSteps,
      totalSteps: plan.totalSteps || 0,
      completedAccounts: synced + failures.length,
      totalAccounts: jobs.length,
      fresh: plan.fresh || 0,
      locked: plan.locked || 0,
    });
  emit('recent');
  async function stage(tasks, firstOnly) {
    let index = 0;
    async function worker() {
      while (index < tasks.length && !signal?.aborted) {
        const job = tasks[index++];
        let token = job.token;
        try {
          do {
            const result = await requester('/api/sync', {
              method: 'POST',
              body: JSON.stringify({ action: 'step', token }),
              signal,
              timeoutMs: 55000,
            });
            if (result.deferred) {
              failures.push({ id: job.id, name: job.name, error: result.message, deferred: true });
              break;
            }
            completedSteps++;
            metadataChanged ||= result.metadataChanged === true;
            warnings.push(...(result.warnings || []));
            onCommit(result);
            token = result.next_token;
            if (result.done) {
              synced++;
              token = null;
            }
            emit(firstOnly ? 'recent' : 'history');
            if (firstOnly && token) {
              continuations.push({ ...job, token });
              break;
            }
          } while (token && !signal?.aborted);
        } catch (error) {
          if (error.code === 'REQUEST_CANCELLED' || error.status === 401) throw error;
          failures.push({ id: job.id, name: job.name, error: error.message });
          emit(firstOnly ? 'recent' : 'history');
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, worker));
  }
  await stage(jobs, true);
  if (!signal?.aborted) {
    const order = new Map(jobs.map((job, index) => [job.id, index]));
    continuations.sort((a, b) => order.get(a.id) - order.get(b.id));
    emit('history');
    await stage(continuations, false);
  }
  if (signal?.aborted)
    throw Object.assign(new Error('Đã dừng đồng bộ. Các phần đã hoàn tất được giữ lại.'), {
      code: 'REQUEST_CANCELLED',
    });
  return {
    synced,
    failed: failures.length,
    failures,
    warnings,
    metadataChanged,
    fresh: plan.fresh || 0,
    locked: plan.locked || 0,
  };
}
