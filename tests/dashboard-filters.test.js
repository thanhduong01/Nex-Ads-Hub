import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dashboardScope,
  UNASSIGNED_BM,
  campaignStatusOptions,
  campaignStatusLabel,
} from '../lib/dashboardFilters.js';
import { aggregate } from '../lib/metrics.js';

const data = {
  accounts: [
    { id: 'a1', bm_id: 'b1', currency: 'VND', is_tracked: true },
    { id: 'a2', bm_id: 'b2', currency: 'VND', is_tracked: true },
    { id: 'a3', bm_id: null, currency: 'VND', is_tracked: true },
    { id: 'a4', bm_id: 'b1', currency: 'VND', is_tracked: false },
    { id: 'a5', bm_id: 'b1', currency: 'USD', is_tracked: true },
  ],
  campaigns: [1, 2, 3, 4, 5].map((i) => ({ id: `c${i}`, account_id: `a${i}` })),
  rows: [1, 2, 3, 4, 5].map((i) => ({
    campaign_id: `c${i}`,
    account_id: `a${i}`,
    date: '2026-10-26',
    spend: i * 100,
  })),
};

test('BM filter scopes account and campaign choices plus KPI and chart rows', () => {
  const all = dashboardScope(data);
  assert.equal(all.accounts.length, 3);
  assert.equal(aggregate(all.rows).spend, 600);
  const one = dashboardScope(data, 'b1');
  assert.deepEqual(
    one.choices.map((a) => a.id),
    ['a1'],
  );
  assert.deepEqual(
    one.campChoices.map((c) => c.id),
    ['c1'],
  );
  assert.equal(aggregate(one.rows).spend, 100);
  assert.equal(dashboardScope(data, 'b1', 'a2').rows.length, 0);
  assert.equal(dashboardScope(data, 'b1', 'all', 'c2').rows.length, 0);
});

test('unassigned BM is a separate group and never labelled a confirmed personal account', () => {
  const group = dashboardScope(data, UNASSIGNED_BM);
  assert.deepEqual(
    group.accounts.map((a) => a.id),
    ['a3'],
  );
  assert.equal(aggregate(group.rows).spend, 300);
});

test('campaign status combines with BM and account permissions for choices and all metric rows', () => {
  const mixed = {
    ...data,
    campaigns: [
      ...data.campaigns.map((campaign, index) => ({
        ...campaign,
        status: index === 1 ? 'PAUSED' : 'ACTIVE',
      })),
      { id: 'c6', account_id: 'a1', status: 'PAUSED' },
      { id: 'c7', account_id: 'a1', status: 'DELETED' },
    ],
    rows: [
      ...data.rows,
      { campaign_id: 'c6', account_id: 'a1', date: '2026-10-26', spend: 600 },
      { campaign_id: 'c7', account_id: 'a1', date: '2026-10-26', spend: 700 },
    ],
  };
  const paused = dashboardScope(mixed, 'b1', 'a1', 'all', 'PAUSED');
  assert.deepEqual(
    paused.campChoices.map((campaign) => campaign.id),
    ['c6'],
  );
  assert.equal(aggregate(paused.rows).spend, 600);
  assert.equal(dashboardScope(mixed, 'b1', 'a1', 'c1', 'PAUSED').rows.length, 0);
  assert.equal(dashboardScope(mixed, 'b1', 'a1', 'all', 'ARCHIVED').campaigns.length, 0);
  assert.equal(aggregate(dashboardScope(mixed, 'all', 'all', 'all', 'ACTIVE').rows).spend, 400);
  assert.equal(aggregate(dashboardScope(mixed, 'b1', 'all', 'all', 'DELETED').rows).spend, 700);
  assert.equal(aggregate(dashboardScope(mixed).rows).spend, 1900);
});

test('unrecognized and missing campaign statuses stay distinct from paused campaigns', () => {
  const mixed = {
    ...data,
    campaigns: data.campaigns.map((campaign, index) => ({
      ...campaign,
      status: index === 0 ? null : index === 1 ? 'META_CUSTOM_STATUS' : 'ARCHIVED',
    })),
  };
  const options = campaignStatusOptions(mixed.campaigns);
  assert(options.some((option) => option.value === 'UNKNOWN'));
  assert(
    options.some(
      (option) => option.value === 'META_CUSTOM_STATUS' && option.label === 'META_CUSTOM_STATUS',
    ),
  );
  assert.equal(new Set(options.map((option) => option.value)).size, options.length);
  assert.equal(aggregate(dashboardScope(mixed, 'all', 'all', 'all', 'UNKNOWN').rows).spend, 100);
  assert.equal(
    aggregate(dashboardScope(mixed, 'all', 'all', 'all', 'META_CUSTOM_STATUS').rows).spend,
    200,
  );
  assert.equal(dashboardScope(mixed, 'all', 'all', 'all', 'PAUSED').rows.length, 0);
  assert.equal(campaignStatusLabel('ARCHIVED'), 'Đã lưu trữ');
  assert.equal(campaignStatusLabel('DELETED'), 'Đã xóa');
});
