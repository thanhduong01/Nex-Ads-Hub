import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveAIConnection,
  loadAISettings,
  publicAISettings,
  saveAIPrompt,
  deleteAIPrompt,
  activateAIPrompt,
  disconnectAI,
  AI_BUCKET,
} from '../lib/aiStore.js';
import { validatePrompt, compilePrompt } from '../lib/aiPrompts.js';
import { generateMetaAnalysis } from '../lib/metaAI.js';
import { validateAnalysisInput, buildAIContext } from '../lib/aiContext.js';
import { runAIAnalysis } from '../lib/aiAnalysis.js';
import settingsRoute from '../pages/api/ai/settings.js';
import connectionRoute from '../pages/api/ai/connection.js';
import promptsRoute from '../pages/api/ai/prompts.js';
import analyzeRoute from '../pages/api/ai/analyze.js';

const response = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });
function memoryDb(records = {}) {
  const objects = new Map();
  let bucketExists = false;
  const notFound = { statusCode: '404', message: 'Object not found' };
  const db = {
    objects,
    storage: {
      getBucket: async (name) => {
        assert.equal(name, AI_BUCKET);
        return bucketExists ? { data: { public: false } } : { error: notFound };
      },
      createBucket: async (name, options) => {
        assert.equal(name, AI_BUCKET);
        assert.equal(options.public, false);
        bucketExists = true;
        return { data: {} };
      },
      from(name) {
        assert.equal(name, AI_BUCKET);
        return {
          download: async (path, _options, fetchOptions) => {
            assert.equal(fetchOptions.cache, 'no-store');
            return objects.has(path)
              ? { data: new Blob([objects.get(path)]) }
              : { error: notFound };
          },
          upload: async (path, data, options) => {
            assert.equal(options.cacheControl, '0');
            objects.set(path, data);
            return { data: {} };
          },
          remove: async (paths) => {
            paths.forEach((path) => objects.delete(path));
            return { data: [] };
          },
          list: async (path) => ({
            data: [...objects.keys()]
              .filter((key) => key.startsWith(path + '/'))
              .map((key) => ({ name: key.slice(path.length + 1) })),
          }),
        };
      },
    },
    from(table) {
      assert(Object.hasOwn(records, table));
      let scoped = false;
      return {
        select() {
          return this;
        },
        eq(column, value) {
          assert.equal(column, 'workspace_id');
          assert.equal(value, 'workspace');
          scoped = true;
          return this;
        },
        order() {
          return this;
        },
        gte() {
          return this;
        },
        lte() {
          return this;
        },
        range: async () => {
          assert(scoped, 'Every analytics query must be scoped to the authenticated workspace');
          return { data: records[table], error: null };
        },
      };
    },
  };
  return db;
}
function environment(t) {
  const old = {
    MODEL_API_KEY: process.env.MODEL_API_KEY,
    TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
  };
  delete process.env.MODEL_API_KEY;
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64');
  t.after(() => {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}
const key = 'private-model-api-key-not-for-client';
const models = async (url, options) => {
  assert.equal(url, 'https://api.meta.ai/v1/models');
  assert.equal(options.headers.Authorization, `Bearer ${key}`);
  return response({ data: [{ id: 'muse-spark-1.3' }, { id: 'another-model' }] });
};

test('Meta AI connection encrypts keys, isolates workspaces, survives reload and disconnects env fallback', async (t) => {
  environment(t);
  const db = memoryDb();
  const result = await saveAIConnection(
    db,
    'workspace',
    { label: 'My connection', apiKey: key, model: 'auto' },
    models,
  );
  assert(result.connection.configured && result.connection.verifiedAt);
  assert(!JSON.stringify(result).includes(key));
  assert(![...db.objects.values()].join().includes(key));
  const loaded = await loadAISettings(db, 'workspace');
  assert.equal(loaded.key, key);
  assert(!JSON.stringify(publicAISettings(loaded)).includes(loaded.connection.apiKeyEncrypted));
  assert.equal((await loadAISettings(db, 'other-workspace')).key, '');
  await assert.rejects(
    saveAIConnection(
      db,
      'workspace',
      { label: 'Bad key', apiKey: 'invalid-private-key-value', model: 'auto' },
      async () => response({ error: { message: key } }, 401),
    ),
    (error) => !error.message.includes(key),
  );
  assert.equal(
    (await loadAISettings(db, 'workspace')).key,
    key,
    'Failed connection never replaces the working key',
  );
  process.env.MODEL_API_KEY = 'environment-key';
  await disconnectAI(db, 'workspace');
  assert.equal((await loadAISettings(db, 'workspace')).key, '');
});

test('prompt create/edit/default/delete persists independently and never accepts a path outside its workspace', async (t) => {
  environment(t);
  const db = memoryDb();
  const prompt = await saveAIPrompt(db, 'workspace', {
    name: 'My exact instructions',
    content: 'Ưu tiên CPA dưới {{target_cpa}} và trả lời dưới dạng danh sách.',
  });
  await activateAIPrompt(db, 'workspace', prompt.id);
  assert.equal((await loadAISettings(db, 'workspace')).activePromptId, prompt.id);
  await saveAIPrompt(db, 'workspace', {
    ...prompt,
    content: 'Nội dung mới: chỉ phân tích ROAS và số đơn, không đề xuất tăng ngân sách.',
  });
  assert.match(
    (await loadAISettings(db, 'workspace')).prompts.find((p) => p.id === prompt.id).content,
    /Nội dung mới/,
  );
  assert(!(await loadAISettings(db, 'other-workspace')).prompts.some((p) => p.id === prompt.id));
  await assert.rejects(deleteAIPrompt(db, 'other-workspace', prompt.id), /Không tìm thấy/);
  await assert.rejects(
    saveAIPrompt(db, 'workspace', { ...prompt, id: '../other-workspace' }),
    /ID prompt/,
  );
  await deleteAIPrompt(db, 'workspace', prompt.id);
  assert(!(await loadAISettings(db, 'workspace')).prompts.some((p) => p.id === prompt.id));
  await deleteAIPrompt(db, 'workspace', 'default-optimization');
  assert(
    !(await loadAISettings(db, 'workspace')).prompts.some((p) => p.id === 'default-optimization'),
  );
});

test('prompt variables compile user requirements literally and unknown variables fail before saving', () => {
  assert.throws(
    () => validatePrompt({ name: 'Prompt', content: 'Phân tích theo biến {{password}} của tôi.' }),
    /Biến prompt/,
  );
  const value = validatePrompt({
    name: 'My prompt',
    content: 'Phân tích {{since}} tới {{until}}, CPA {{target_cpa}}; yêu cầu cụ thể $&.',
  });
  assert.equal(
    compilePrompt(value.content, { since: '2026-10-01', until: '2026-10-07', target_cpa: 150000 }),
    'Phân tích 2026-10-01 tới 2026-10-07, CPA 150000; yêu cầu cụ thể $&.',
  );
});

const data = {
  accounts: [
    {
      id: 'a1',
      name: 'Account 1',
      bm_id: 'b1',
      currency: 'VND',
      is_tracked: true,
      meta_token_encrypted: 'private-ad-token',
    },
    { id: 'a2', name: 'Account 2', bm_id: 'b2', currency: 'VND', is_tracked: true },
  ],
  bms: [
    { id: 'b1', name: 'BM One' },
    { id: 'b2', name: 'BM Two' },
  ],
  campaigns: [
    { id: 'c1', name: 'Keep data', account_id: 'a1', status: 'ACTIVE' },
    { id: 'c2', name: 'Filtered campaign', account_id: 'a2', status: 'PAUSED' },
    { id: 'c3', name: 'No insights', account_id: 'a1', status: 'ACTIVE' },
  ],
  rows: [
    {
      campaign_id: 'c1',
      account_id: 'a1',
      date: '2026-10-07',
      spend: 100,
      purchases: 2,
      'actions:purchase': 2,
      purchase_value: 500,
    },
    {
      campaign_id: 'c1',
      account_id: 'a1',
      date: '2026-10-06',
      spend: 50,
      purchases: 1,
      'actions:purchase': 1,
      purchase_value: 100,
    },
    { campaign_id: 'c2', account_id: 'a2', date: '2026-10-07', spend: 900, purchase_value: 9000 },
  ],
};
const input = () =>
  validateAnalysisInput({
    range: { since: '2026-10-07', until: '2026-10-07' },
    filters: { bm: 'b1', status: 'ACTIVE' },
    targetCPA: 150000,
    promptId: 'default-optimization',
  });

test('AI context uses matching account/status/date rows, weighted totals, previous period and explicit insight coverage', () => {
  const context = buildAIContext(data, input());
  assert.equal(context.current.spend, 100);
  assert.equal(context.current.ROAS, 5);
  assert.equal(context.previous.spend, 50);
  assert.equal(context.campaignCount, 2);
  assert.equal(context.campaignsWithInsights, 1);
  assert.equal(context.campaignsWithoutInsights, 1);
  assert(!JSON.stringify(context).includes('private-ad-token'));
  assert(!JSON.stringify(context).includes('Filtered campaign'));
  assert.throws(
    () => buildAIContext(data, { ...input(), filters: { bm: 'b1', status: 'PAUSED' } }),
    /chưa có dữ liệu/,
  );
  assert.throws(
    () => validateAnalysisInput({ range: { since: '2026-02-30', until: '2026-03-01' } }),
    /không hợp lệ/,
  );
  assert.throws(
    () => validateAnalysisInput({ range: { since: '2026-01-01', until: '2026-03-01' } }),
    /31 ngày/,
  );
});

test('each analysis reads the latest saved prompt and server-scoped data before calling Meta', async (t) => {
  environment(t);
  const db = memoryDb({
    ad_accounts: data.accounts,
    bms: data.bms,
    campaigns: data.campaigns,
    daily_insights: data.rows,
  });
  await saveAIConnection(db, 'workspace', { label: 'Test', apiKey: key, model: 'auto' }, models);
  await saveAIPrompt(db, 'workspace', {
    id: 'default-optimization',
    name: 'Updated business rules',
    content: 'Chỉ đánh giá CPA {{target_cpa}}; không đề xuất thay đổi quảng cáo.',
  });
  let calls = 0;
  const result = await runAIAnalysis(db, 'workspace', input(), async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.meta.ai/v1/chat/completions');
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    const body = JSON.parse(options.body);
    assert.equal(
      body.messages[1].content,
      'Chỉ đánh giá CPA 150000; không đề xuất thay đổi quảng cáo.',
    );
    assert(body.messages[2].content.includes('Keep data'));
    assert(!body.messages[2].content.includes('Filtered campaign'));
    assert(!options.body.includes('private-ad-token'));
    assert.equal(body.store, false);
    assert(!body.tools);
    return response({
      choices: [
        {
          message: { content: 'Kết quả phân tích thực từ response của provider.' },
          finish_reason: 'stop',
        },
      ],
      usage: { total_tokens: 250, input_token: key },
    });
  });
  assert.equal(calls, 1);
  assert.equal(result.prompt.name, 'Updated business rules');
  assert.equal(result.scope.campaignCount, 2);
  assert.equal(result.usage.total_tokens, 250);
  assert(!JSON.stringify(result).includes(key));
});

test('provider errors, timeouts and empty answers never become fake recommendations', async () => {
  for (const status of [401, 403, 429, 500])
    await assert.rejects(
      generateMetaAnalysis(
        { key, model: 'muse-spark-1.3', prompt: 'Analyze', context: {} },
        async () => response({ error: { message: key } }, status),
      ),
      (error) => error.status === 503 && !error.message.includes(key),
    );
  await assert.rejects(
    generateMetaAnalysis(
      { key, model: 'muse-spark-1.3', prompt: 'Analyze', context: {} },
      async () => {
        throw new DOMException('timeout', 'TimeoutError');
      },
    ),
    /phản hồi quá lâu/,
  );
  await assert.rejects(
    generateMetaAnalysis(
      { key, model: 'muse-spark-1.3', prompt: 'Analyze', context: {} },
      async () => response({ choices: [{ message: { content: '' } }] }),
    ),
    /chưa trả về/,
  );
  const partial = await generateMetaAnalysis(
    { key, model: 'muse-spark-1.3', prompt: 'Analyze', context: {} },
    async () =>
      response({ choices: [{ message: { content: 'Partial' }, finish_reason: 'length' }] }),
  );
  assert.equal(partial.incomplete, true);
});

test('AI endpoints require authentication and mutation endpoints reject cross-origin calls first', async (t) => {
  const originalSite = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3000';
  t.after(() => {
    if (originalSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSite;
  });
  const res = () => ({
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  });
  const result = res();
  await settingsRoute({ method: 'GET', headers: {} }, result);
  assert.equal(result.statusCode, 401);
  for (const route of [connectionRoute, promptsRoute, analyzeRoute]) {
    const denied = res();
    await route(
      { method: 'POST', headers: { origin: 'https://foreign.example' }, body: {} },
      denied,
    );
    assert.equal(denied.statusCode, 403);
    const unauthenticated = res();
    await route(
      { method: 'POST', headers: { origin: 'http://127.0.0.1:3000' }, body: {} },
      unauthenticated,
    );
    assert.equal(unauthenticated.statusCode, 401);
  }
});
