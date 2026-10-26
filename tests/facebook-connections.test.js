import test from 'node:test';
import assert from 'node:assert/strict';
import { getFacebookConnections, inspectMetaIdentity } from '../lib/facebookConnections.js';
import { encrypt } from '../lib/server.js';
import connection from '../pages/api/facebook/connection.js';

function accountDb(rows) {
  return {
    from(table) {
      assert.equal(table, 'ad_accounts');
      return {
        select() {
          return this;
        },
        eq(column, value) {
          assert.equal(column, 'workspace_id');
          assert.equal(value, 'workspace');
          return this;
        },
        order() {
          return this;
        },
        range: async () => ({ data: rows, error: null }),
      };
    },
  };
}

test('connection summary verifies actual token identity and never returns credential material', async (t) => {
  const previous = { ...process.env };
  t.after(() => {
    for (const name of ['META_ACCESS_TOKEN', 'TOKEN_ENCRYPTION_KEY']) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
  process.env.META_ACCESS_TOKEN = 'private-server-token';
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 6).toString('base64');
  const ciphertext = encrypt('private-saved-token');
  const rows = [
    { id: 'a1', fb_user_id: 'sys1', meta_token_encrypted: null },
    { id: 'a2', fb_user_id: 'sys1', meta_token_encrypted: null },
    { id: 'a3', fb_user_id: 'person1', meta_token_encrypted: ciphertext },
  ];
  let calls = 0;
  const result = await getFacebookConnections(accountDb(rows), 'workspace', async (token) => {
    calls++;
    return {
      id: token === 'private-server-token' ? 'sys1' : 'person1',
      name: 'Test',
      type: token === 'private-server-token' ? 'SYSTEM_USER' : 'USER',
    };
  });
  assert.equal(calls, 2);
  assert.equal(result.connections[0].accountCount, 2);
  assert.equal(result.connections[0].source, 'server_token');
  assert.equal(result.connections[1].source, 'saved_token');
  assert(result.connections.every((c) => c.matchesStoredIdentity));
  const json = JSON.stringify(result);
  for (const secret of [
    'private-server-token',
    'private-saved-token',
    ciphertext,
    process.env.TOKEN_ENCRYPTION_KEY,
  ])
    assert(!json.includes(secret));
});

test('changed server identity is reported instead of claiming ownership of old data', async (t) => {
  const previous = process.env.META_ACCESS_TOKEN;
  t.after(() => {
    if (previous === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = previous;
  });
  process.env.META_ACCESS_TOKEN = 'new-token';
  const result = await getFacebookConnections(
    accountDb([{ id: 'a1', fb_user_id: 'old-user' }]),
    'workspace',
    async () => ({ id: 'new-user' }),
  );
  assert.equal(result.connections[0].matchesStoredIdentity, false);
  assert.match(result.connections[0].warning, /khác nguồn/);
});

test('identity debugger returns only verified allowlisted metadata', async (t) => {
  const previousId = process.env.META_APP_ID,
    previousSecret = process.env.META_APP_SECRET;
  process.env.META_APP_ID = '123';
  process.env.META_APP_SECRET = 'private-app-secret';
  t.after(() => {
    for (const [key, value] of [
      ['META_APP_ID', previousId],
      ['META_APP_SECRET', previousSecret],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const identity = await inspectMetaIdentity('private-token', async (url, init) => {
    if (url.pathname.endsWith('/me'))
      return { ok: true, json: async () => ({ id: 'sys1', name: 'Duong', unneeded: 'private' }) };
    assert.equal(url.searchParams.get('input_token'), 'private-token');
    assert.equal(init.headers.Authorization, 'Bearer 123|private-app-secret');
    return {
      ok: true,
      json: async () => ({
        data: {
          is_valid: true,
          user_id: 'sys1',
          type: 'SYSTEM_USER',
          app_id: '123',
          application: 'Nex Ads',
          input_token: 'private-token',
          scopes: ['extra'],
        },
      }),
    };
  });
  assert.deepEqual(identity, {
    id: 'sys1',
    name: 'Duong',
    type: 'SYSTEM_USER',
    appId: '123',
    appName: 'Nex Ads',
  });
});

test('identity inspection respects the shared deadline before calling Meta', async () => {
  await assert.rejects(
    inspectMetaIdentity(
      'private-token',
      async () => assert.fail('Deadline already elapsed'),
      Date.now() - 1,
    ),
    /Hết thời gian/,
  );
});

test('connection inspection is not accessible without an authenticated administrator', async () => {
  const res = {
    setHeader() {},
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
    },
  };
  await connection({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 401);
  assert(!JSON.stringify(res.body).includes('token'));
});
