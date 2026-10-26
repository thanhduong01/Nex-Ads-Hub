import test from 'node:test';
import assert from 'node:assert/strict';
import { connectAccounts } from '../lib/sync.js';
import {
  getBmsAndAccounts,
  getDailyInsights,
  getDailyInsightsInChunks,
  graphList,
  normalizeInsight,
  actionValue,
  fromMinor,
  graph,
  withMetaDeadline,
} from '../lib/metaClient.js';
function response(data) {
  return { ok: true, status: 200, json: async () => data };
}
test('BM pagination, owned/shared dedupe and personal account fallback', async () => {
  const seen = [];
  const fetcher = async (url, init) => {
    seen.push(url.toString());
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    assert(!url.searchParams.has('access_token'));
    const path = url.pathname;
    if (path.endsWith('me/businesses'))
      return response(
        url.searchParams.get('after')
          ? { data: [{ id: 'b2', name: 'BM 2' }] }
          : {
              data: [{ id: 'b1', name: 'BM 1' }],
              paging: { next: 'https://untrusted.example/', cursors: { after: 'next1' } },
            },
      );
    if (path.endsWith('owned_ad_accounts'))
      return response({ data: [{ id: path.includes('b1') ? 'act_1' : 'act_2' }] });
    if (path.endsWith('client_ad_accounts')) return response({ data: [{ id: 'act_1' }] });
    if (path.endsWith('me/adaccounts'))
      return response({ data: [{ id: 'act_1' }, { id: 'act_3' }] });
    throw new Error(path);
  };
  const result = await getBmsAndAccounts('test-token', fetcher);
  assert.equal(result.bms.length, 2);
  assert.deepEqual(result.accounts.map((a) => a.id).sort(), ['act_1', 'act_2', 'act_3']);
  assert(seen.every((u) => u.startsWith('https://graph.facebook.com/')));
  const fallback = await getBmsAndAccounts('test-token', async (url) =>
    response({ data: url.pathname.endsWith('businesses') ? [] : [{ id: 'act_personal' }] }),
  );
  assert.equal(fallback.accounts[0].bm_id, null);
});
test('daily insight request contains dates, campaign level and pagination', async () => {
  let count = 0;
  const rows = await getDailyInsights('act_1', '2026-10-01', '2026-10-25', 'test', async (url) => {
    count++;
    assert.equal(url.searchParams.get('time_increment'), '1');
    assert.equal(url.searchParams.get('level'), 'campaign');
    assert.equal(JSON.parse(url.searchParams.get('time_range')).since, '2026-10-01');
    return response(
      count === 1
        ? {
            data: [{ date_start: '2026-10-01' }],
            paging: { next: 'ignored', cursors: { after: '2' } },
          }
        : { data: [{ date_start: '2026-10-02' }] },
    );
  });
  assert.equal(rows.length, 2);
});
test('repeated cursors fail instead of looping indefinitely', async () => {
  await assert.rejects(
    graphList('me/adaccounts', {}, 'token', async () =>
      response({ data: [], paging: { next: 'x', cursors: { after: 'same' } } }),
    ),
    /repeated/,
  );
});
test('purchase action aliases are not double-counted', () => {
  const actions = [
    { action_type: 'purchase', value: '3' },
    { action_type: 'omni_purchase', value: '3' },
    { action_type: 'offsite_conversion.fb_pixel_purchase', value: '3' },
  ];
  assert.equal(actionValue(actions, 'purchase'), 3);
  const row = normalizeInsight(
    {
      campaign_id: 'c',
      date_start: '2026-10-25',
      actions,
      action_values: [{ action_type: 'purchase', value: '100' }],
    },
    'w',
    'act_1',
  );
  assert.equal(row.purchases, 3);
  assert.equal(row.purchase_value, 100);
});
test('Meta minor units honor zero-decimal VND and two-decimal USD', () => {
  assert.equal(fromMinor('12345', 'VND'), 12345);
  assert.equal(fromMinor('12345', 'USD'), 123.45);
});
test('System User without businesses edge can still list directly assigned accounts', async () => {
  const result = await getBmsAndAccounts('test', async (url) => {
    if (url.pathname.endsWith('businesses'))
      return {
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 100,
            message: 'Tried accessing nonexisting field (businesses) on node type (SystemUser)',
          },
        }),
      };
    return response({ data: [{ id: 'act_system_user' }] });
  });
  assert.equal(result.bms.length, 0);
  assert.equal(result.accounts[0].id, 'act_system_user');
});

test('System User with an empty business list recovers owning BMs from its assigned accounts', async () => {
  const result = await getBmsAndAccounts('test', async (url) => {
    if (url.pathname.endsWith('/me/businesses')) return response({ data: [] });
    assert.match(url.searchParams.get('fields'), /business\{id,name\}/);
    return response({
      data: [
        { id: 'act_1', business: { id: 'b1', name: 'BM One' } },
        { id: 'act_2', business: { id: 'b1', name: 'BM One' } },
        { id: 'act_3', business: { id: 'b2', name: 'BM Two' } },
        { id: 'act_4' },
      ],
    });
  });
  assert.equal(result.bms.length, 2);
  assert.deepEqual(
    result.accounts.map((a) => a.bm_id),
    ['b1', 'b1', 'b2', null],
  );
});

test('shared accounts retain the owning BM, not whichever partner BM is visited last', async () => {
  const result = await getBmsAndAccounts('test', async (url) => {
    if (url.pathname.endsWith('/me/businesses'))
      return response({ data: [{ id: 'partner', name: 'Agency' }] });
    if (url.pathname.endsWith('/owned_ad_accounts')) return response({ data: [] });
    if (url.pathname.endsWith('/client_ad_accounts'))
      return response({
        data: [{ id: 'act_shared', business: { id: 'owner', name: 'Client BM' } }],
      });
    return response({ data: [{ id: 'act_shared' }] });
  });
  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].bm_id, 'owner');
  assert(result.bms.some((b) => b.id === 'owner' && b.name === 'Client BM'));
});
test('expired Meta token is surfaced without a fallback hiding the error', async () => {
  let calls = 0;
  await assert.rejects(
    getBmsAndAccounts('expired', async () => {
      calls++;
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 190, message: 'Token expired' } }),
      };
    }),
    /Token expired/,
  );
  assert.equal(calls, 1);
});
test('sync deadline prevents another request and stays scoped to its async operation', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return response({ id: 'me' });
  };
  await assert.rejects(
    withMetaDeadline(Date.now() - 1, () => graph('me', {}, 'test', fetcher)),
    /Hết thời gian/,
  );
  assert.equal(calls, 0);
  const result = await graph('me', {}, 'test', fetcher);
  assert.equal(result.id, 'me');
  assert.equal(calls, 1);
});

test('Meta retries a temporary network timeout before reporting a failed account', async () => {
  let calls = 0;
  const result = await graph('me', {}, 'test', async () => {
    if (++calls === 1) throw new DOMException('Timed out', 'TimeoutError');
    return response({ id: 'recovered' });
  });
  assert.equal(result.id, 'recovered');
  assert.equal(calls, 2);
});

test('Meta does not retry a timeout when the operation deadline cannot cover the retry delay', async () => {
  let calls = 0;
  await assert.rejects(
    withMetaDeadline(Date.now() + 100, () =>
      graph('me', {}, 'test', async () => {
        calls++;
        throw new DOMException('Timed out', 'TimeoutError');
      }),
    ),
    /Meta phản hồi quá lâu/,
  );
  assert.equal(calls, 1);
});

test('account discovery stops at its deadline without writing partial accounts', async () => {
  const db = {
    from() {
      assert.fail('No database write before account discovery completes');
    },
  };
  await assert.rejects(connectAccounts(db, 'workspace', 'test', { budgetMs: 0 }), /Hết thời gian/);
});

test('large-account Insights queries cover the complete range in non-overlapping weeks', async () => {
  const ranges = [];
  const rows = await getDailyInsightsInChunks(
    'act_large',
    '2026-10-01',
    '2026-10-26',
    'test',
    async (url) => {
      const range = JSON.parse(url.searchParams.get('time_range'));
      assert.equal(url.searchParams.get('time_increment'), '1');
      ranges.push(range);
      return response({ data: [{ date_start: range.since }] });
    },
  );
  assert.deepEqual(ranges, [
    { since: '2026-10-01', until: '2026-10-07' },
    { since: '2026-10-08', until: '2026-10-14' },
    { since: '2026-10-15', until: '2026-10-21' },
    { since: '2026-10-22', until: '2026-10-26' },
  ]);
  assert.equal(rows.length, 4);
});

test('an unsuccessful Insights chunk rejects the entire read instead of returning partial data', async () => {
  let calls = 0;
  await assert.rejects(
    getDailyInsightsInChunks('act_large', '2026-10-01', '2026-10-26', 'test', async () => {
      if (++calls === 2)
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { code: 190, message: 'Token expired' } }),
        };
      return response({ data: [{ date_start: '2026-10-01' }] });
    }),
    /Token expired/,
  );
  assert.equal(calls, 2);
});
