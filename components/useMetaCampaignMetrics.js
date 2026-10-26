import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { requiredMetaFields } from '../lib/metaMetricCatalog.js';

export async function loadMetaAccounts(
  accounts,
  range,
  fields,
  campaign,
  onProgress,
  active = () => true,
  requester = api,
) {
  let index = 0,
    completed = 0;
  const byCampaign = new Map(),
    discovered = new Set(),
    issues = [];
  let fetchedAt;
  const tasks = accounts.flatMap((account) =>
    Array.from({ length: Math.ceil(fields.length / 32) }, (_, batch) => ({
      account,
      fields: fields.slice(batch * 32, batch * 32 + 32),
    })),
  );
  function merged() {
    return {
      rows: [...byCampaign.values()],
      discovered: [...discovered],
      issues: [...issues],
      fetchedAt,
    };
  }
  async function worker() {
    while (index < tasks.length && active()) {
      const { account, fields: taskFields } = tasks[index++];
      try {
        const result = await requester('/api/meta/insights', {
          method: 'POST',
          timeoutMs: 65000,
          body: JSON.stringify({
            account_id: account.id,
            ...range,
            fields: taskFields,
            ...(campaign !== 'all' ? { campaign_id: campaign } : {}),
          }),
        });
        for (const row of result.rows) {
          const key = `${row.account_id}/${row.campaign_id}`;
          const prior = byCampaign.get(key);
          byCampaign.set(key, { ...row, metrics: { ...prior?.metrics, ...row.metrics } });
        }
        result.discovered_columns.forEach((key) => discovered.add(key));
        if (!fetchedAt || result.fetched_at > fetchedAt) fetchedAt = result.fetched_at;
        issues.push(
          ...result.unavailable_fields.map((item) => ({ account: account.name, ...item })),
        );
      } catch (error) {
        issues.push({
          account: account.name,
          field: taskFields.join(', '),
          message: error.message,
        });
      }
      completed++;
      if (active()) onProgress?.(completed, merged());
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, worker));
  return merged();
}

export default function useMetaCampaignMetrics({
  config,
  accounts,
  range,
  campaign,
  demo,
  revision,
}) {
  const [state, setState] = useState({
      key: '',
      rows: [],
      discovered: [],
      issues: [],
      loading: false,
      done: 0,
    }),
    [reload, setReload] = useState(0);
  const fields = requiredMetaFields(config);
  const key = JSON.stringify([
    demo,
    accounts.map((a) => a.id).sort(),
    range.since,
    range.until,
    campaign,
    fields,
    revision,
    reload,
  ]);
  useEffect(() => {
    let active = true;
    if (demo || !fields.length || !accounts.length) {
      setState({ key, rows: [], discovered: [], issues: [], loading: false, done: 0 });
      return () => {
        active = false;
      };
    }
    setState({ key, rows: [], discovered: [], issues: [], loading: true, done: 0 });
    loadMetaAccounts(
      accounts,
      range,
      fields,
      campaign,
      (done, result) => setState((value) => ({ ...value, ...result, done })),
      () => active,
    ).then((result) => {
      if (active)
        setState({
          key,
          ...result,
          loading: false,
          done: accounts.length * Math.ceil(fields.length / 32),
        });
    });
    return () => {
      active = false;
    };
    // The key contains every input that changes the reporting scope or metric request.
  }, [key]);
  const current =
    state.key === key
      ? state
      : { rows: [], discovered: [], issues: [], loading: !demo && fields.length > 0, done: 0 };
  return {
    ...current,
    fields,
    total: accounts.length * Math.ceil(fields.length / 32),
    refresh: () => setReload((value) => value + 1),
    discover: async () =>
      demo
        ? {
            discovered: [],
            issues: [
              { message: 'Dữ liệu mẫu không gọi Meta. Đăng nhập workspace thật để quét sự kiện.' },
            ],
          }
        : loadMetaAccounts(
            accounts,
            range,
            [
              'actions',
              'action_values',
              'cost_per_action_type',
              'conversions',
              'conversion_values',
              'cost_per_conversion',
            ],
            campaign,
          ),
  };
}
