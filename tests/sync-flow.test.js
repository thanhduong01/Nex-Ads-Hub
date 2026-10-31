import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../lib/api.js';
import {
  buildAccountJob,
  signSyncJob,
  readSyncJob,
  createSyncPlan,
  performSyncStep,
} from '../lib/syncEngine.js';
import { runSync, mergeSyncPatch } from '../lib/syncClient.js';
import { dataRequest, loadWorkspaceData, INSIGHT_DATA_FIELDS } from '../lib/workspaceData.js';
import { allRows } from '../lib/supabase.js';
import { todayISO, datesBetween } from '../lib/metrics.js';
import syncRoute from '../pages/api/sync.js';

const now = new Date('2026-10-31T08:00:00Z');
const account = {
  workspace_id: 'w1',
  id: 'act_1',
  name: 'Account',
  currency: 'VND',
  timezone_name: 'Asia/Ho_Chi_Minh',
  is_tracked: true,
  last_synced_at: '2026-10-26T08:00:00Z',
  sync_lock_until: null,
};
const ok = (data) => ({ ok: true, status: 200, json: async () => data });

function database(initial = {}) {
  const tables = {
    ad_accounts: [],
    campaigns: [],
    daily_insights: [],
    clients: [],
    client_accounts: [],
    report_configs: [],
    ...structuredClone(initial),
  };
  const writes = [],
    queries = [],
    rpcCalls = [];
  let afterRpc;
  return {
    tables,
    writes,
    queries,
    rpcCalls,
    set afterRpc(fn) {
      afterRpc = fn;
    },
    from(table) {
      let filters = [],
        operation = 'read',
        input,
        returning = false,
        single = false,
        bounds = null;
      const record = { table, fields: '*', filters };
      queries.push(record);
      const builder = {
        select(fields) {
          record.fields = fields;
          returning = operation !== 'read';
          return this;
        },
        eq(field, value) {
          filters.push([field, value]);
          return this;
        },
        in(field, values) {
          filters.push([field, values]);
          return this;
        },
        gte() {
          return this;
        },
        lte() {
          return this;
        },
        order() {
          return this;
        },
        or() {
          record.claim = true;
          return this;
        },
        update(value) {
          operation = 'update';
          input = value;
          return this;
        },
        upsert(value) {
          operation = 'upsert';
          input = value;
          return this;
        },
        range(from, to) {
          bounds = [from, to];
          return this;
        },
        maybeSingle() {
          single = true;
          return this;
        },
        abortSignal() {
          return this;
        },
        then(resolve, reject) {
          return Promise.resolve()
            .then(() => {
              const values = (tables[table] || []).filter((row) =>
                filters.every(([field, value]) =>
                  Array.isArray(value) ? value.includes(row[field]) : row[field] === value,
                ),
              );
              if (operation === 'read')
                return {
                  data: single
                    ? values[0] || null
                    : bounds
                      ? values.slice(bounds[0], bounds[1] + 1)
                      : values,
                  error: null,
                };
              if (operation === 'update') {
                const chosen = record.claim
                  ? values.filter(
                      (row) => !row.sync_lock_until || Date.parse(row.sync_lock_until) < Date.now(),
                    )
                  : values;
                chosen.forEach((row) => Object.assign(row, input));
                writes.push({ table, operation, input, matched: chosen.length, filters });
                return {
                  data: returning ? chosen.map((row) => ({ id: row.id })) : null,
                  error: null,
                };
              }
              for (const row of input) {
                const existing = tables[table].find(
                  (c) => c.id === row.id && c.workspace_id === row.workspace_id,
                );
                if (existing) Object.assign(existing, row);
                else tables[table].push({ ...row });
              }
              writes.push({ table, operation, input });
              return { data: null, error: null };
            })
            .then(resolve, reject);
        },
      };
      return builder;
    },
    async rpc(name, input) {
      rpcCalls.push({ name, input });
      afterRpc?.(input);
      return { data: null, error: null };
    },
  };
}

test('catch-up covers the gap plus attribution overlap, puts latest days first and never overlaps date chunks', () => {
  const job = buildAccountJob(account, { now });
  assert.equal(job.since, '2026-10-01');
  assert.deepEqual(job.steps[0], { kind: 'recent', since: '2026-10-31', until: '2026-10-31' });
  assert.equal(job.steps[1].until, '2026-10-30');
  const dates = job.steps
    .filter((step) => step.since)
    .flatMap((step) => datesBetween(step.since, step.until));
  assert.equal(dates.length, new Set(dates).size);
  assert.deepEqual([...dates].sort(), datesBetween('2026-10-01', '2026-10-31'));
  assert.equal(job.steps.at(-1).kind, 'catalogue');
  const first = buildAccountJob({ ...account, last_synced_at: null }, { now });
  assert.equal(first.since, '2026-10-01');
  const current = buildAccountJob({ ...account, last_synced_at: now.toISOString() }, { now });
  assert.equal(current.since, '2026-10-24');
  assert(!current.steps.some((step) => step.kind === 'catalogue'));
  assert.equal(buildAccountJob(account, { now, month: '2026-12' }), null);
  assert.equal(buildAccountJob(account, { now, month: '2026-09' }).until, '2026-09-30');
});

test('continuations cannot be forged, cross workspaces or outlive expiry', () => {
  const job = buildAccountJob(account, { now });
  const token = signSyncJob(job, 'secret');
  assert.equal(readSyncJob(token, 'w1', 'secret', now.getTime()).account_id, 'act_1');
  assert.throws(() => readSyncJob(token, 'foreign', 'secret', now.getTime()), { status: 403 });
  assert.throws(() => readSyncJob(token, 'w1', 'wrong', now.getTime()), { status: 403 });
  assert.throws(() => readSyncJob(token, 'w1', 'secret', job.expires + 1), { status: 409 });
  const [payload, signature] = token.split('.');
  const altered = JSON.parse(Buffer.from(payload, 'base64url'));
  altered.index = altered.steps.length - 1;
  assert.throws(
    () =>
      readSyncJob(
        `${Buffer.from(JSON.stringify(altered)).toString('base64url')}.${signature}`,
        'w1',
        'secret',
        now.getTime(),
      ),
    { status: 403 },
  );
});

test('auto plans skip recent successful data and locks, while explicit filtered sync stays in its own workspace', async () => {
  const db = database({
    ad_accounts: [
      { ...account, last_synced_at: now.toISOString() },
      { ...account, id: 'act_2', sync_lock_until: new Date(now.getTime() + 90000).toISOString() },
      { ...account, id: 'act_3' },
      { ...account, id: 'act_foreign', workspace_id: 'w2' },
    ],
  });
  const old = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY = 'test-signing';
  try {
    const plan = await createSyncPlan(db, 'w1', { now, priorityIds: ['act_3'] });
    assert.equal(plan.fresh, 1);
    assert.equal(plan.locked, 1);
    assert.deepEqual(
      plan.jobs.map((j) => j.id),
      ['act_3'],
    );
    const forced = await createSyncPlan(db, 'w1', {
      now,
      force: true,
      accountIds: ['act_1', 'act_foreign'],
    });
    assert.deepEqual(
      forced.jobs.map((j) => j.id),
      ['act_1'],
    );
    assert(!JSON.stringify(plan).includes('test-signing'));
  } finally {
    if (old === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = old;
  }
});

test('recent sync updates active and recently-spending metadata, writes one atomic range and advances freshness only after the final step', async () => {
  const oldKey = process.env.TOKEN_ENCRYPTION_KEY,
    oldToken = process.env.META_ACCESS_TOKEN;
  process.env.TOKEN_ENCRYPTION_KEY = 'test-signing';
  process.env.META_ACCESS_TOKEN = 'private-meta-token';
  const actualNow = new Date(),
    today = todayISO(actualNow),
    stamp = actualNow.toISOString();
  const db = database({
    ad_accounts: [{ ...account, last_synced_at: stamp }],
    campaigns: [
      { workspace_id: 'w1', account_id: 'act_1', id: '3', status: 'ACTIVE', name: 'Old active' },
    ],
  });
  const job = buildAccountJob(db.tables.ad_accounts[0], { now: actualNow });
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ path: url.pathname, params: new URLSearchParams(url.searchParams) });
    assert.equal(init.headers.Authorization, 'Bearer private-meta-token');
    if (url.pathname.endsWith('/insights')) {
      const range = JSON.parse(url.searchParams.get('time_range'));
      return ok({
        data: [
          {
            campaign_id: '1',
            campaign_name: 'Active',
            date_start: range.since,
            spend: '10',
            impressions: '20',
          },
        ],
      });
    }
    if (url.pathname.endsWith('/campaigns')) {
      assert.deepEqual(JSON.parse(url.searchParams.get('effective_status')), ['ACTIVE']);
      return ok({ data: [{ id: '1', name: 'Active', effective_status: 'ACTIVE' }] });
    }
    assert.equal(init.method, 'POST');
    assert(!url.searchParams.has('ids'));
    const batch = JSON.parse(new URLSearchParams(init.body).get('batch'));
    return ok(
      batch.map((call) => {
        assert.equal(call.method, 'GET');
        const id = call.relative_url.split('?')[0];
        return {
          code: 200,
          body: JSON.stringify({
            id,
            name: 'Known',
            effective_status: id === '3' ? 'ARCHIVED' : 'ACTIVE',
          }),
        };
      }),
    );
  };
  try {
    const first = await performSyncStep(db, 'w1', signSyncJob(job), { fetcher });
    assert.equal(first.done, false);
    assert.equal(first.phase, 'recent');
    assert.equal(db.tables.ad_accounts[0].last_synced_at, stamp);
    assert.equal(db.tables.campaigns.find((c) => c.id === '3').status, 'ACTIVE');
    assert.equal(db.tables.ad_accounts[0].sync_lock_until, null);
    assert.equal(db.rpcCalls[0].name, 'replace_insights_range');
    assert.deepEqual(
      [db.rpcCalls[0].input.p_since, db.rpcCalls[0].input.p_until],
      [job.steps[0].since, today],
    );
    assert(!JSON.stringify(first).includes('private-meta-token'));
    const history = await performSyncStep(db, 'w1', first.next_token, { fetcher });
    assert.equal(history.done, false);
    const last = await performSyncStep(db, 'w1', history.next_token, { fetcher });
    assert.equal(last.done, true);
    assert.equal(last.next_token, null);
    assert(last.last_synced_at);
    assert.equal(db.rpcCalls.length, 2);
    assert.equal(db.tables.campaigns.find((c) => c.id === '3').status, 'ARCHIVED');
    assert.equal(calls.filter((call) => call.path.endsWith('/campaigns')).length, 1);
  } finally {
    if (oldKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = oldKey;
    if (oldToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = oldToken;
  }
});

test('a failed range preserves the full-sync watermark and releases only its own lock', async () => {
  const oldKey = process.env.TOKEN_ENCRYPTION_KEY,
    oldToken = process.env.META_ACCESS_TOKEN;
  process.env.TOKEN_ENCRYPTION_KEY = 'test-signing';
  process.env.META_ACCESS_TOKEN = 'private';
  const stamp = new Date().toISOString(),
    db = database({ ad_accounts: [{ ...account, last_synced_at: stamp }] });
  const job = buildAccountJob(db.tables.ad_accounts[0]);
  try {
    await assert.rejects(
      performSyncStep(db, 'w1', signSyncJob(job), {
        fetcher: async () => ({
          ok: false,
          status: 400,
          json: async () => ({ error: { code: 190, message: 'Expired access_token=private' } }),
        }),
      }),
      (error) => error.status === 503 && !error.message.includes('=private'),
    );
    assert.equal(db.rpcCalls.length, 0);
    assert.equal(db.tables.ad_accounts[0].last_synced_at, stamp);
    assert.equal(db.tables.ad_accounts[0].sync_lock_until, null);
    const foreign = database({ ad_accounts: [{ ...account, workspace_id: 'w2' }] });
    await assert.rejects(performSyncStep(foreign, 'w1', signSyncJob(job)), { status: 403 });
    assert.equal(foreign.writes.length, 0);
    const locked = database({
      ad_accounts: [{ ...account, sync_lock_until: new Date(Date.now() + 90000).toISOString() }],
    });
    assert.equal((await performSyncStep(locked, 'w1', signSyncJob(job))).deferred, true);
    assert.equal(locked.tables.ad_accounts[0].sync_lock_until !== null, true);
  } finally {
    if (oldKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = oldKey;
    if (oldToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = oldToken;
  }
});

test('all accounts receive their quick pass before backfill, concurrency is bounded and one failed account does not block the rest', async () => {
  const jobs = Array.from({ length: 5 }, (_, i) => ({
    id: String(i),
    name: `A${i}`,
    token: `${i}:0`,
    totalSteps: 2,
  }));
  const order = [],
    commits = [];
  let active = 0,
    max = 0;
  const result = await runSync(
    {},
    {
      requester: async (_url, options) => {
        const body = JSON.parse(options.body);
        if (body.action === 'plan') return { jobs, totalSteps: 10 };
        const [id, step] = body.token.split(':');
        active++;
        max = Math.max(max, active);
        order.push(body.token);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active--;
        if (id === '2') throw Error('One account failed');
        return {
          id,
          done: step === '1',
          next_token: step === '0' ? `${id}:1` : null,
          rows: [],
          campaigns: [],
          warnings: [],
        };
      },
      onCommit: (patch) => commits.push(patch),
    },
  );
  assert(max <= 3);
  assert.equal(result.synced, 4);
  assert.equal(result.failed, 1);
  const firstBackfill = order.findIndex((token) => token.endsWith(':1'));
  assert.equal(firstBackfill, 5);
  assert.equal(commits.length, 8);
});

test('an obsolete worker cannot release a newer lease or mark that worker complete', async () => {
  const oldKey = process.env.TOKEN_ENCRYPTION_KEY,
    oldToken = process.env.META_ACCESS_TOKEN;
  process.env.TOKEN_ENCRYPTION_KEY = 'test-signing';
  process.env.META_ACCESS_TOKEN = 'test-meta';
  const previous = new Date().toISOString(),
    replacement = new Date(Date.now() + 180000).toISOString();
  const db = database({ ad_accounts: [{ ...account, last_synced_at: previous }] });
  const job = buildAccountJob(db.tables.ad_accounts[0]);
  job.steps = [{ kind: 'history', since: todayISO(), until: todayISO() }];
  db.afterRpc = () => {
    db.tables.ad_accounts[0].sync_lock_until = replacement;
  };
  try {
    await assert.rejects(
      performSyncStep(db, 'w1', signSyncJob(job), { fetcher: async () => ok({ data: [] }) }),
      /chuyển sang tiến trình khác/,
    );
    assert.equal(db.tables.ad_accounts[0].sync_lock_until, replacement);
    assert.equal(db.tables.ad_accounts[0].last_synced_at, previous);
  } finally {
    if (oldKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = oldKey;
    if (oldToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = oldToken;
  }
});

test('client reports keep account grants across workspaces even when arbitrary filter IDs are posted', async () => {
  const db = database({
    clients: [
      { id: 'c1', workspace_id: 'w1', owner_email: 'client@example.test' },
      { id: 'c2', workspace_id: 'w2', owner_email: 'other@example.test' },
    ],
    client_accounts: [
      { workspace_id: 'w1', client_id: 'c1', account_id: 'act_1' },
      { workspace_id: 'w2', client_id: 'c2', account_id: 'act_2' },
    ],
    ad_accounts: [
      account,
      { ...account, workspace_id: 'w1', id: 'act_hidden' },
      { ...account, workspace_id: 'w2', id: 'act_2' },
    ],
    daily_insights: [
      { workspace_id: 'w1', account_id: 'act_1', campaign_id: '1', date: '2026-10-31', spend: 1 },
      {
        workspace_id: 'w1',
        account_id: 'act_hidden',
        campaign_id: '2',
        date: '2026-10-31',
        spend: 999,
      },
      { workspace_id: 'w2', account_id: 'act_2', campaign_id: '3', date: '2026-10-31', spend: 999 },
    ],
  });
  const result = await loadWorkspaceData(
    { db, user_id: 'client-id', role: 'client', email: 'client@example.test' },
    { view: 'reports', month: '2026-10', account: 'act_2' },
    { now },
  );
  assert.deepEqual(
    result.accounts.map((a) => a.id),
    ['act_1'],
  );
  assert.deepEqual(
    result.rows.map((r) => r.account_id),
    ['act_1'],
  );
  assert.deepEqual(
    result.clients.map((c) => c.id),
    ['c1'],
  );
});

test('timeouts release even when fetch or response parsing ignores abort, and caller cancellation is immediate', async () => {
  await assert.rejects(
    api('/stalled', { timeoutMs: 15 }, () => new Promise(() => {})),
    { code: 'REQUEST_TIMEOUT' },
  );
  await assert.rejects(
    api('/stalled-json', { timeoutMs: 15 }, async () => ({
      ok: true,
      json: () => new Promise(() => {}),
    })),
    { code: 'REQUEST_TIMEOUT' },
  );
  const controller = new AbortController();
  const pending = api(
    '/cancel',
    { signal: controller.signal, timeoutMs: 10000 },
    () => new Promise(() => {}),
  );
  controller.abort();
  await assert.rejects(pending, { code: 'REQUEST_CANCELLED' });
});

test('progress patches replace just the committed workspace/account/date range without mutating other rows or revisions', () => {
  const original = {
    accounts: [{ workspace_id: 'w1', id: 'act_1', last_synced_at: 'old' }],
    campaigns: [{ workspace_id: 'w1', id: '1', name: 'Old' }],
    range: { since: '2026-10-20', until: '2026-10-31' },
    loadedAt: 'keep-revision',
    rows: [
      { workspace_id: 'w1', account_id: 'act_1', date: '2026-10-31', spend: 1 },
      { workspace_id: 'w2', account_id: 'act_1', date: '2026-10-31', spend: 5 },
      { workspace_id: 'w1', account_id: 'act_1', date: '2026-10-20', spend: 3 },
    ],
  };
  const before = structuredClone(original);
  const result = mergeSyncPatch(original, {
    workspace_id: 'w1',
    id: 'act_1',
    since: '2026-10-29',
    until: '2026-10-31',
    rows: [{ workspace_id: 'w1', account_id: 'act_1', date: '2026-10-31', spend: 10 }],
    campaigns: [{ workspace_id: 'w1', id: '1', name: 'New' }],
    last_synced_at: 'fresh',
  });
  assert.equal(result.rows.length, 3);
  assert.equal(
    result.rows.find((r) => r.workspace_id === 'w1' && r.date === '2026-10-31').spend,
    10,
  );
  assert.equal(result.accounts[0].last_synced_at, 'fresh');
  assert.equal(result.loadedAt, 'keep-revision');
  assert.deepEqual(original, before);
});

test('view query selects only the visible range plus comparison and refuses client access to admin datasets', async () => {
  assert.deepEqual(dataRequest({}, 'admin', now).range, {
    since: '2026-10-01',
    until: '2026-10-31',
  });
  assert.deepEqual(dataRequest({ period: '1' }, 'admin', now).range, {
    since: '2026-10-30',
    until: '2026-10-31',
  });
  assert.deepEqual(dataRequest({ period: '7' }, 'admin', now).range, {
    since: '2026-10-18',
    until: '2026-10-31',
  });
  assert.deepEqual(dataRequest({ view: 'reports', month: '2026-09' }, 'client', now).range, {
    since: '2026-09-01',
    until: '2026-09-30',
  });
  assert.throws(() => dataRequest({ view: 'dashboard' }, 'client', now), { status: 403 });
  assert.throws(() => dataRequest({ period: '999' }, 'admin', now));
  const db = database({
    ad_accounts: [account, { ...account, id: 'act_foreign', workspace_id: 'w2' }],
    daily_insights: [
      { workspace_id: 'w1', account_id: 'act_1', campaign_id: '1', date: '2026-10-31', spend: 5 },
    ],
    clients: [],
  });
  const data = await loadWorkspaceData(
    { db, user_id: 'w1', role: 'admin' },
    { period: '1', include_meta: '0' },
    { now },
  );
  assert.equal(data.accounts.length, 1);
  assert.equal(data.rows.length, 1);
  assert.equal(data.campaigns, undefined);
  assert(!db.queries.some((query) => query.table === 'campaigns' || query.table === 'clients'));
  assert.equal(
    db.queries.find((query) => query.table === 'daily_insights').fields,
    INSIGHT_DATA_FIELDS,
  );
  assert(!JSON.stringify(data).includes('meta_token_encrypted'));
});

test('parallel metadata pagination preserves order and completeness with a bounded number of in-flight pages', async () => {
  const source = Array.from({ length: 5680 }, (_, i) => i);
  let active = 0,
    max = 0;
  const result = await allRows(
    () => ({
      async range(from, to) {
        active++;
        max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 1));
        active--;
        return { data: source.slice(from, to + 1), error: null };
      },
    }),
    { concurrency: 3 },
  );
  assert.deepEqual(result, source);
  assert.equal(max, 3);
});

test('sync plans and steps both require an authenticated admin and same-origin requests', async () => {
  const old = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://ads.example';
  try {
    for (const action of ['plan', 'step'])
      for (const [origin, status] of [
        ['https://ads.example', 401],
        ['https://other.example', 403],
      ]) {
        const res = {
          setHeader() {},
          status(value) {
            this.statusCode = value;
            return this;
          },
          json(body) {
            this.body = body;
          },
        };
        await syncRoute({ method: 'POST', headers: { origin }, body: { action } }, res);
        assert.equal(res.statusCode, status);
      }
  } finally {
    if (old === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = old;
  }
});
