import test from 'node:test';
import assert from 'node:assert/strict';
import {
  META_INSIGHT_FIELDS,
  META_BASE_COLUMNS,
  metaCatalog,
  metaColumn,
  metaMetricValue,
  requiredMetaFields,
} from '../lib/metaMetricCatalog.js';
import {
  readMetaPeriod,
  validateMetaInsightRequest,
  loadWorkspaceMetaInsights,
} from '../lib/metaInsights.js';
import {
  DEFAULT_CAMPAIGN_COLUMNS,
  validateCampaignColumns,
  validateCampaignMetric,
  buildCampaignRows,
} from '../lib/campaignColumns.js';
import route from '../pages/api/meta/insights.js';
import { loadMetaAccounts } from '../components/useMetaCampaignMetrics.js';

const request = {
  account_id: 'act_123',
  since: '2026-10-01',
  until: '2026-10-07',
  fields: ['reach', 'frequency'],
};
const response = (data) => ({ ok: true, status: 200, json: async () => data });
const errorResponse = (code, message) => ({
  ok: false,
  status: 400,
  json: async () => ({ error: { code, message } }),
});

test('the full official SDK field catalog and per-event columns are available without allowing arbitrary Graph fields', () => {
  assert.equal(Object.keys(META_INSIGHT_FIELDS).length, 229);
  assert.equal(META_BASE_COLUMNS.length, 229);
  assert(metaCatalog().length > 350);
  for (const key of [
    'meta:reach',
    'meta:marketing_messages_read',
    'meta:video_p95_watched_actions',
    'meta:creative_fatigue_summary',
    'meta:actions:offsite_conversion.custom.12345',
  ])
    assert(metaColumn(key));
  for (const key of [
    'meta:access_token',
    'meta:__proto__',
    'meta:spend:purchase',
    'meta:actions:foo{access_token}',
    'meta:actions:purchase:secret',
  ])
    assert.equal(metaColumn(key), null);
  assert.equal(metaColumn('meta:action_values:purchase').type, 'money');
  assert.equal(
    metaColumn('meta:website_purchase_roas:offsite_conversion.fb_pixel_purchase').type,
    'ratio',
  );
  assert.equal(metaColumn('meta:unique_ctr').type, 'percent');
  assert.equal(metaColumn('meta:actions').type, 'json');
  assert.equal(metaColumn('meta:account_id').type, 'text');
});

test('existing preferences remain compatible and Meta columns, aliases and formulas persist safely', () => {
  const custom = {
    id: 'custom_live_roas',
    name: 'Giá trị mua / chi tiêu Meta',
    left: 'meta:action_values:purchase',
    operator: '/',
    rightType: 'metric',
    right: 'meta:spend',
    type: 'ratio',
  };
  const config = validateCampaignColumns({
    ...structuredClone(DEFAULT_CAMPAIGN_COLUMNS),
    selected_columns: [
      'name',
      'meta:reach',
      'custom_live_roas',
      'meta:actions:offsite_conversion.custom.555',
    ],
    custom_names: { 'meta:reach': 'Reach toàn kỳ' },
    custom_metrics: [custom],
  });
  assert.deepEqual(requiredMetaFields(config), ['action_values', 'actions', 'reach', 'spend']);
  assert.equal(config.custom_names['meta:reach'], 'Reach toàn kỳ');
  assert.doesNotThrow(() => validateCampaignColumns(DEFAULT_CAMPAIGN_COLUMNS));
  assert.throws(() => validateCampaignMetric({ ...custom, left: 'meta:actions' }));
  assert.throws(() => validateCampaignMetric({ ...custom, left: 'meta:account_id' }));
  assert.throws(() =>
    validateCampaignColumns({ ...config, custom_names: { 'meta:access_token': 'X' } }),
  );
  assert.throws(() =>
    validateCampaignColumns({ ...config, selected_columns: ['meta:actions:foo{secret}'] }),
  );
});

test('period Insights request preserves exact non-additive values, handles pagination and does not expose tokens', async () => {
  let calls = 0;
  const result = await readMetaPeriod(
    {
      ...request,
      fields: ['account_id', 'reach', 'frequency', 'actions', 'action_values', 'spend'],
      campaign_id: '77',
    },
    'private-token',
    {
      fetcher: async (url, init) => {
        calls++;
        assert.equal(init.headers.Authorization, 'Bearer private-token');
        assert(!url.searchParams.has('access_token'));
        assert.equal(url.searchParams.get('level'), 'campaign');
        assert.equal(url.searchParams.get('time_increment'), null);
        assert.equal(url.searchParams.get('action_report_time'), 'conversion');
        assert.equal(url.searchParams.get('use_account_attribution_setting'), 'true');
        assert.deepEqual(JSON.parse(url.searchParams.get('time_range')), {
          since: request.since,
          until: request.until,
        });
        assert.deepEqual(JSON.parse(url.searchParams.get('filtering')), [
          { field: 'campaign.id', operator: 'IN', value: ['77'] },
        ]);
        return response(
          calls === 1
            ? {
                data: [
                  {
                    campaign_id: '77',
                    account_id: '123',
                    reach: '150',
                    frequency: '2.75',
                    spend: '100',
                    actions: [
                      { action_type: 'purchase', value: '2' },
                      { action_type: 'omni_purchase', value: '2' },
                      { action_type: 'offsite_conversion.custom.555', value: '0' },
                    ],
                    action_values: [{ action_type: 'purchase', value: '450' }],
                  },
                ],
                paging: { next: 'ignored', cursors: { after: 'next' } },
              }
            : { data: [] },
        );
      },
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.rows[0].account_id, 'act_123');
  assert.equal(result.rows[0].metrics.account_id, '123');
  assert(result.discovered_columns.includes('meta:actions:offsite_conversion.custom.555'));
  const config = {
    ...structuredClone(DEFAULT_CAMPAIGN_COLUMNS),
    selected_columns: [
      'meta:reach',
      'meta:frequency',
      'meta:actions:purchase',
      'meta:actions:omni_purchase',
      'meta:actions',
      'custom_live_roas',
    ],
    custom_metrics: [
      {
        id: 'custom_live_roas',
        name: 'ROAS',
        left: 'meta:action_values:purchase',
        operator: '/',
        rightType: 'metric',
        right: 'meta:spend',
        type: 'ratio',
      },
    ],
  };
  const [row] = buildCampaignRows(
    [{ id: '77', account_id: 'act_123' }],
    [],
    [],
    [],
    config,
    result.rows,
  );
  assert.equal(row['meta:reach'], 150);
  assert.equal(row['meta:frequency'], 2.75);
  assert.equal(row['meta:actions:purchase'], 2);
  assert.equal(row['meta:actions:omni_purchase'], 2);
  assert.equal(row['meta:actions'].length, 3);
  assert.equal(row.custom_live_roas, 4.5);
  assert(!JSON.stringify(result).includes('private-token'));
});

test('unsupported fields are isolated and successful fields and later pages remain available', async () => {
  const seen = [];
  const result = await readMetaPeriod(
    { ...request, fields: ['reach', 'quality_ranking', 'actions'] },
    'test',
    {
      fetcher: async (url) => {
        const fields = url.searchParams.get('fields').split(',');
        seen.push(fields);
        if (fields.includes('quality_ranking'))
          return errorResponse(100, 'quality_ranking is not supported at campaign level');
        return response({
          data: [
            { campaign_id: '77', reach: '80', actions: [{ action_type: 'lead', value: '3' }] },
          ],
        });
      },
    },
  );
  assert.equal(result.unavailable_fields.length, 1);
  assert.equal(result.unavailable_fields[0].field, 'quality_ranking');
  assert(result.available_fields.includes('reach'));
  assert(result.available_fields.includes('actions'));
  assert.equal(result.rows[0].metrics.reach, '80');
  assert.equal(result.rows[0].metrics.actions[0].value, '3');
  assert(seen.length >= 3);
});

test('expired tokens and permission errors are surfaced without probing each field or returning incomplete data', async () => {
  for (const code of [190, 10, 200]) {
    let calls = 0;
    await assert.rejects(
      readMetaPeriod(request, 'test', {
        fetcher: async () => {
          calls++;
          return errorResponse(code, 'Token or permission rejected');
        },
      }),
      /Token or permission rejected/,
    );
    assert.equal(calls, 1);
  }
});

test('a failed transient batch and an exhausted deadline do not discard successfully read fields or fabricate zeros', async () => {
  const fields = Object.keys(META_INSIGHT_FIELDS)
    .filter((f) => !['campaign_id', 'date_start', 'date_stop'].includes(f))
    .slice(0, 17);
  const result = await readMetaPeriod({ ...request, fields }, 'test', {
    fetcher: async (url) => {
      const requested = url.searchParams.get('fields').split(',');
      if (requested.includes(fields[16]))
        return errorResponse(2, 'Service temporarily unavailable');
      return response({
        data: [
          { campaign_id: '77', ...Object.fromEntries(fields.slice(0, 16).map((f) => [f, '5'])) },
        ],
      });
    },
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.available_fields.length, 16);
  assert.deepEqual(
    result.unavailable_fields.map((f) => f.field),
    [fields[16]],
  );
  assert.equal(result.unavailable_fields[0].code, 2);
  assert.equal(result.rows[0].metrics[fields[16]], undefined);
  let called = false;
  const timeout = await readMetaPeriod(request, 'test', {
    budgetMs: -1,
    fetcher: async () => {
      called = true;
    },
  });
  assert.equal(called, false);
  assert.equal(timeout.unavailable_fields.length, 2);
  assert(timeout.unavailable_fields.every((f) => f.code === 'TIMEOUT'));
});

test('multiple field batches merge into one campaign and nested metadata cannot change account scope', async () => {
  const fields = Object.keys(META_INSIGHT_FIELDS)
    .filter((field) => !['campaign_id', 'date_start', 'date_stop'].includes(field))
    .slice(0, 33);
  let calls = 0;
  const result = await readMetaPeriod({ ...request, fields }, 'test', {
    fetcher: async (url) => {
      calls++;
      const metrics = Object.fromEntries(
        url.searchParams
          .get('fields')
          .split(',')
          .map((field) => [field, field === 'campaign_id' ? '77' : field]),
      );
      return response({ data: [metrics] });
    },
  });
  assert.equal(calls, 3);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].account_id, 'act_123');
  for (const field of fields) assert.equal(result.rows[0].metrics[field], field);
});

test('missing, zero, custom events and structured fields preserve meaning instead of manufacturing numbers', () => {
  assert.equal(metaMetricValue({ spend: '0' }, metaColumn('meta:spend')), 0);
  assert.equal(metaMetricValue({}, metaColumn('meta:spend')), null);
  assert.equal(metaMetricValue({ spend: 'N/A' }, metaColumn('meta:spend')), 'N/A');
  assert.equal(
    metaMetricValue(
      { actions: [{ action_type: 'lead', value: '0' }] },
      metaColumn('meta:actions:lead'),
    ),
    0,
  );
  assert.equal(metaMetricValue({ actions: [] }, metaColumn('meta:actions:lead')), null);
  assert.deepEqual(
    metaMetricValue({ results: [{ indicator: 'x', value: '2' }] }, metaColumn('meta:results')),
    [{ indicator: 'x', value: '2' }],
  );
  const config = { ...DEFAULT_CAMPAIGN_COLUMNS, selected_columns: ['meta:reach'] };
  const [row] = buildCampaignRows([{ id: '77', account_id: 'act_123' }], [], [], [], config, [
    { account_id: 'act_foreign', campaign_id: '77', metrics: { reach: '999' } },
  ]);
  assert.equal(row['meta:reach'], null);
});

test('request validation rejects field injection, invalid dates and arbitrary account paths before calling Meta', () => {
  for (const input of [
    { ...request, account_id: 'me/accounts' },
    { ...request, since: '2026-02-30' },
    { ...request, until: '2026-12-31' },
    { ...request, fields: ['access_token'] },
    { ...request, fields: ['actions{access_token}'] },
    { ...request, campaign_id: '77/insights' },
    { ...request, fields: [] },
  ])
    assert.throws(() => validateMetaInsightRequest(input));
});

test('workspace ownership and tracking are enforced before decrypting or querying Meta', async () => {
  const seen = [];
  const session = {
    user_id: 'workspace-1',
    db: {
      from(table) {
        assert.equal(table, 'ad_accounts');
        return {
          select() {
            return this;
          },
          eq(field, value) {
            seen.push([field, value]);
            return this;
          },
          async maybeSingle() {
            return { data: null, error: null };
          },
        };
      },
    },
  };
  await assert.rejects(loadWorkspaceMetaInsights(session, request), { status: 403 });
  assert.deepEqual(seen, [
    ['workspace_id', 'workspace-1'],
    ['id', 'act_123'],
  ]);
});

test('the live Insights API rejects unauthenticated and cross-origin requests', async () => {
  const old = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://ads.example';
  try {
    for (const [origin, status] of [
      ['https://ads.example', 401],
      ['https://evil.example', 403],
    ]) {
      const res = {
        headers: {},
        setHeader(k, v) {
          this.headers[k] = v;
        },
        status(s) {
          this.statusCode = s;
          return this;
        },
        json(body) {
          this.body = body;
        },
      };
      await route({ method: 'POST', headers: { origin }, body: request }, res);
      assert.equal(res.statusCode, status);
    }
  } finally {
    if (old === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = old;
  }
});

test('client batches all requested fields with bounded concurrency and merges partial account results without overwriting other batches', async () => {
  const fields = Object.keys(META_INSIGHT_FIELDS).slice(0, 70);
  let concurrent = 0,
    maxConcurrent = 0,
    calls = 0;
  const progress = [];
  const result = await loadMetaAccounts(
    [
      { id: 'act_123', name: 'Account' },
      { id: 'act_456', name: 'Other' },
    ],
    { since: request.since, until: request.until },
    fields,
    'all',
    (done) => progress.push(done),
    () => true,
    async (url, options) => {
      calls++;
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      const input = JSON.parse(options.body);
      assert.equal(url, '/api/meta/insights');
      assert(input.fields.length <= 32);
      await new Promise((resolve) => setTimeout(resolve, 1));
      concurrent--;
      return {
        rows: [
          {
            account_id: input.account_id,
            campaign_id: '77',
            metrics: Object.fromEntries(input.fields.map((field) => [field, field])),
          },
        ],
        discovered_columns: ['meta:actions:purchase'],
        unavailable_fields: [],
        fetched_at: '2026-10-27T00:00:00Z',
      };
    },
  );
  assert.equal(calls, 6);
  assert(maxConcurrent <= 3);
  assert.equal(result.rows.length, 2);
  for (const row of result.rows)
    for (const field of fields) assert.equal(row.metrics[field], field);
  assert.deepEqual(progress, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(result.discovered, ['meta:actions:purchase']);
  let started = false;
  const inactive = await loadMetaAccounts(
    [{ id: 'act_123' }],
    request,
    fields,
    'all',
    null,
    () => false,
    async () => {
      started = true;
    },
  );
  assert.equal(started, false);
  assert.equal(inactive.rows.length, 0);
});
