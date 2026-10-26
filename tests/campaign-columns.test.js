import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CAMPAIGN_COLUMNS,
  validateCampaignColumns,
  validateCampaignMetric,
  campaignColumnDefinitions,
  buildCampaignRows,
  sortCampaignRows,
} from '../lib/campaignColumns.js';
import {
  loadCampaignColumns,
  saveCampaignColumns,
  PREFERENCES_BUCKET,
} from '../lib/campaignPreferences.js';
import preferencesRoute from '../pages/api/preferences/campaign-columns.js';
import { paginateRows } from '../lib/pagination.js';

const fresh = () => structuredClone(DEFAULT_CAMPAIGN_COLUMNS);
const formula = {
  id: 'custom_profit',
  name: 'Chênh lệch thu / chi',
  left: 'purchase_value',
  operator: '-',
  rightType: 'metric',
  right: 'spend',
  type: 'money',
};

test('column choices preserve requested order and custom labels without changing metric sources', () => {
  const config = validateCampaignColumns({
    ...fresh(),
    selected_columns: ['ROAS', 'custom_profit', 'id'],
    custom_names: { ROAS: 'Hiệu quả doanh thu' },
    custom_metrics: [formula],
  });
  const columns = campaignColumnDefinitions(config);
  assert.deepEqual(
    columns.map((column) => column.key),
    ['ROAS', 'custom_profit', 'id'],
  );
  assert.deepEqual(
    columns.map((column) => column.name),
    ['Hiệu quả doanh thu', 'Chênh lệch thu / chi', 'ID chiến dịch'],
  );
  assert.equal(columns[0].type, 'ratio');
  assert.equal(columns[1].type, 'money');
});

test('configuration rejects unknown fields, duplicate columns, arbitrary expressions and invalid operands', () => {
  for (const input of [
    { ...fresh(), selected_columns: [] },
    { ...fresh(), selected_columns: ['spend', 'spend'] },
    { ...fresh(), selected_columns: ['access_token'] },
    { ...fresh(), custom_names: { __invalid: 'Secret' } },
    { ...fresh(), custom_metrics: [formula, formula] },
  ])
    assert.throws(() => validateCampaignColumns(input));
  assert.throws(() => validateCampaignMetric({ ...formula, left: 'spend);globalThis.bad=1' }));
  assert.throws(() =>
    validateCampaignMetric({ ...formula, rightType: 'constant', right: 'Infinity' }),
  );
  assert.throws(() => validateCampaignMetric({ ...formula, left: 'custom_other' }));
  assert.throws(() => validateCampaignMetric({ ...formula, operator: 'eval' }));
});

test('campaign metrics and formulas use weighted period totals and ignore mismatched account rows', () => {
  const config = {
    ...fresh(),
    custom_metrics: [
      formula,
      { ...formula, id: 'custom_zero', operator: '/', rightType: 'constant', right: 0 },
    ],
  };
  const campaigns = [{ id: 'c1', account_id: 'a1', name: 'Campaign', daily_budget: 500 }];
  const rows = [
    {
      campaign_id: 'c1',
      account_id: 'a1',
      spend: 100,
      impressions: 100,
      clicks: 10,
      reach: 80,
      'actions:purchase': 1,
      'actions:lead': 2,
      purchase_value: 300,
    },
    {
      campaign_id: 'c1',
      account_id: 'a1',
      spend: 900,
      impressions: 900,
      clicks: 9,
      reach: 600,
      'actions:purchase': 3,
      'actions:lead': 4,
      purchase_value: 1800,
    },
    { campaign_id: 'c1', account_id: 'foreign-account', spend: 999999, purchase_value: 999999 },
  ];
  const original = structuredClone(rows);
  const [row] = buildCampaignRows(
    campaigns,
    rows,
    [{ id: 'a1', name: 'My account', bm_id: 'b1' }],
    [{ id: 'b1', name: 'My BM' }],
    config,
  );
  assert.equal(row.spend, 1000);
  assert.equal(row.ROAS, 2.1);
  assert.equal(row.ctr, 1.9);
  assert.equal(row.cpc, 1000 / 19);
  assert.equal(row.cpm, 1000);
  assert.equal(row.cpa, 250);
  assert.equal(row.cpl, 1000 / 6);
  assert.equal(row.frequency, 1000 / 680);
  assert.equal(row.custom_profit, 1100);
  assert.equal(row.custom_zero, null);
  assert.equal(row.account_name, 'My account');
  assert.equal(row.bm_name, 'My BM');
  assert.deepEqual(rows, original);
  const [empty] = buildCampaignRows(campaigns, [], [], [], config);
  for (const key of ['cpc', 'cpm', 'cpa', 'cpl', 'ROAS', 'frequency'])
    assert.equal(empty[key], null);
});

test('custom and text column sorts work across all pages with missing values last', () => {
  const rows = Array.from({ length: 45 }, (_, index) => ({
    id: String(index),
    name: `Chiến dịch ${index}`,
    custom_profit: index,
  }));
  rows.push({ id: 'missing', name: 'Chưa có số liệu', custom_profit: null });
  const sorted = sortCampaignRows(rows, { key: 'custom_profit', dir: -1 });
  assert.equal(paginateRows(sorted, 1).items[0].id, '44');
  assert.equal(paginateRows(sorted, 2).items[0].id, '24');
  assert.equal(sorted.at(-1).id, 'missing');
  assert.equal(
    sortCampaignRows(rows, { key: 'name', dir: 1 }).filter((row) => row.id !== 'missing')[2].id,
    '2',
  );
  assert.equal(rows[0].id, '0');
});

function storage() {
  const files = new Map();
  let exists = false;
  return {
    files,
    storage: {
      getBucket: async () =>
        exists ? { data: { public: false } } : { error: { statusCode: '404' } },
      createBucket: async (bucket, options) => {
        assert.equal(bucket, PREFERENCES_BUCKET);
        assert.equal(options.public, false);
        exists = true;
        return { data: {} };
      },
      from(bucket) {
        assert.equal(bucket, PREFERENCES_BUCKET);
        return {
          download: async (path, _options, fetchOptions) => {
            assert.equal(fetchOptions.cache, 'no-store');
            return files.has(path)
              ? { data: new Blob([files.get(path)]) }
              : { error: { statusCode: '404' } };
          },
          upload: async (path, value, options) => {
            assert.equal(options.cacheControl, '0');
            files.set(path, value);
            return { data: {} };
          },
        };
      },
    },
  };
}
test('column preferences roundtrip per workspace, defaults are independent and invalid writes do not replace settings', async () => {
  const db = storage();
  const first = await loadCampaignColumns(db, 'workspace');
  first.selected_columns.pop();
  assert.deepEqual(await loadCampaignColumns(db, 'workspace'), fresh());
  const config = {
    ...fresh(),
    selected_columns: ['name', 'cpm', 'custom_profit'],
    custom_metrics: [formula],
  };
  await saveCampaignColumns(db, 'workspace', config);
  assert.deepEqual(await loadCampaignColumns(db, 'workspace'), config);
  assert.deepEqual(await loadCampaignColumns(db, 'other-workspace'), fresh());
  await assert.rejects(
    saveCampaignColumns(db, 'workspace', { ...config, selected_columns: ['secret'] }),
  );
  assert.deepEqual(await loadCampaignColumns(db, 'workspace'), config);
  await assert.rejects(saveCampaignColumns(db, '../foreign-workspace', config));
});

test('preference routes deny unauthenticated reads and writes and reject cross-origin updates', async (t) => {
  const old = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://app.example.com';
  t.after(() => {
    if (old === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = old;
  });
  const response = () => ({
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
    },
  });
  for (const method of ['GET', 'PUT']) {
    const res = response();
    await preferencesRoute(
      { method, headers: { origin: 'https://app.example.com' }, body: fresh() },
      res,
    );
    assert.equal(res.statusCode, 401);
  }
  const blocked = response();
  await preferencesRoute(
    { method: 'PUT', headers: { origin: 'https://foreign.example' }, body: fresh() },
    blocked,
  );
  assert.equal(blocked.statusCode, 403);
});
