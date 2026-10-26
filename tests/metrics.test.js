import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregate,
  evaluateMetric,
  validateCustom,
  validateConfig,
  monthRange,
  makeReport,
  DEFAULT_CONFIG,
  rangeFor,
  shiftDate,
  todayISO,
  campaignInsights,
} from '../lib/metrics.js';
test('ratios are weighted from totals, not averaged daily ratios', () => {
  const a = aggregate([
    { spend: 100, impressions: 100, clicks: 10, 'actions:purchase': 1, purchase_value: 300 },
    { spend: 900, impressions: 900, clicks: 9, 'actions:purchase': 3, purchase_value: 1800 },
  ]);
  assert.equal(a.ROAS, 2.1);
  assert.equal(a.ctr, 1.9);
  assert.equal(a.cpa, 250);
  assert.equal(a.cpc, 1000 / 19);
});
test('zero denominators are missing values, not infinity', () => {
  assert.equal(aggregate([]).ROAS, null);
  const metric = {
    id: 'custom_a',
    name: 'ROAS thực',
    left: 'purchase_value',
    operator: '/',
    rightType: 'metric',
    right: 'spend',
    type: 'ratio',
  };
  assert.equal(evaluateMetric(metric, { purchase_value: 50, spend: 0 }), null);
});
test('custom metric total recomputes the formula', () => {
  const config = {
    ...DEFAULT_CONFIG,
    custom_metrics: [
      {
        id: 'custom_test',
        name: 'ROAS thực',
        left: 'purchase_value',
        operator: '/',
        rightType: 'metric',
        right: 'spend',
        type: 'ratio',
      },
    ],
  };
  const report = makeReport(
    [
      { date: '2024-02-01', spend: 100, purchase_value: 300 },
      { date: '2024-02-02', spend: 900, purchase_value: 1800 },
    ],
    '2024-02',
    config,
    '2024-03-01',
  );
  assert.equal(report.rows.length, 29);
  assert.equal(report.total.custom_test, 2.1);
  assert.equal(report.rows[0].custom_test, 3);
});
test('untrusted formula operands cannot execute code', () => {
  assert.throws(() =>
    validateCustom({
      name: 'Evil',
      left: 'constructor.constructor',
      operator: '/',
      rightType: 'constant',
      right: '1;process.exit()',
      type: 'number',
    }),
  );
  assert.throws(() =>
    validateCustom({
      name: 'Evil',
      left: 'spend',
      operator: '/',
      rightType: 'constant',
      right: 'NaN',
      type: 'number',
    }),
  );
});
test('invalid and duplicate report columns are rejected', () => {
  assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, selected_metrics: ['spend', 'spend'] }));
  assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, selected_metrics: ['__proto__'] }));
  assert.throws(() =>
    validateConfig({ ...DEFAULT_CONFIG, custom_names: { spend: 'x'.repeat(61) } }),
  );
});
test('calendar periods cross month/year and leap years correctly', () => {
  assert.deepEqual(rangeFor('3', '2026-01-01'), { since: '2025-12-30', until: '2026-01-01' });
  assert.deepEqual(rangeFor('yesterday', '2026-03-01'), {
    since: '2026-02-28',
    until: '2026-02-28',
  });
  assert.equal(monthRange('2024-02').until, '2024-02-29');
  assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
  assert.throws(() => monthRange('2026-13'));
});
test('Vietnam timezone avoids host timezone date errors', () =>
  assert.equal(todayISO(new Date('2026-10-24T20:00:00Z')), '2026-10-25'));
test('AI respects campaign and date filters and does not add purchase aliases', () => {
  const campaigns = [
    { id: 'c1', name: 'Campaign A' },
    { id: 'c2', name: 'Campaign B' },
  ];
  const rows = [
    { campaign_id: 'c1', date: '2026-10-01', spend: 100, purchase_value: 1 },
    { campaign_id: 'c2', date: '2026-10-02', spend: 100, purchase_value: 20 },
  ];
  assert.equal(
    campaignInsights([campaigns[0]], rows, { since: '2026-10-02', until: '2026-10-02' }).length,
    0,
  );
  const insights = campaignInsights(campaigns, rows, { since: '2026-10-02', until: '2026-10-02' });
  assert.equal(insights.length, 1);
  assert.equal(insights[0].campaign_id, 'c2');
});
test('CTR decline needs two three-day periods inside the filter', () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({
    campaign_id: 'a',
    date: `2026-10-0${i + 1}`,
    impressions: 1000,
    clicks: i < 3 ? 100 : 30,
    spend: 100,
    purchase_value: 500,
  }));
  assert(
    campaignInsights([{ id: 'a' }], rows, { since: '2026-10-01', until: '2026-10-06' }).some(
      (r) => r.id === 'a_ctr',
    ),
  );
  assert(
    !campaignInsights([{ id: 'a' }], rows, { since: '2026-10-04', until: '2026-10-06' }).some(
      (r) => r.id === 'a_ctr',
    ),
  );
});
