import test from 'node:test';
import assert from 'node:assert/strict';
import {
  csrf,
  constantEqual,
  encrypt,
  decrypt,
  digest,
  isAdminEmail,
  auth,
} from '../lib/server.js';
test('CSRF rejects missing and cross-origin mutation requests', () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://adshub.example.com';
  assert.throws(() => csrf({ method: 'POST', headers: {} }), /cùng nguồn/);
  assert.throws(
    () => csrf({ method: 'POST', headers: { origin: 'https://evil.test' } }),
    /cùng nguồn/,
  );
  assert.doesNotThrow(() =>
    csrf({ method: 'POST', headers: { origin: 'https://adshub.example.com' } }),
  );
});
test('AES-GCM tokens round trip and reject tampering', () => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 19).toString('base64');
  const ciphertext = encrypt('secret-token');
  assert(!ciphertext.includes('secret-token'));
  assert.equal(decrypt(ciphertext), 'secret-token');
  const parts = ciphertext.split('.');
  parts[2] = Buffer.from('tampered').toString('base64');
  assert.throws(() => decrypt(parts.join('.')));
});
test('cron comparisons are constant-time for same length and deny missing secret', () => {
  assert(constantEqual('Bearer secret', 'Bearer secret'));
  assert(!constantEqual('Bearer secret', 'Bearer forged'));
  assert(!constantEqual(undefined, undefined));
});
test('admin email is defined by server environment', () => {
  process.env.ADMIN_EMAIL = 'owner@example.com';
  assert(isAdminEmail('OWNER@example.com'));
  assert(!isAdminEmail('client@example.com'));
});
test('forged local session and role cannot authenticate without server cookie', async () => {
  await assert.rejects(
    auth({ headers: {}, body: { role: 'admin', email: 'owner@example.com' } }, { setHeader() {} }),
    (e) => e.status === 401,
  );
});
test('session token hashes do not reveal cookie token', () => {
  assert.equal(digest('test').length, 64);
  assert.notEqual(digest('test'), digest('different'));
});
function sessionDb(row, email = 'client@example.com') {
  const updates = [];
  return {
    updates,
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { id: row.user_id, email } }, error: null }),
      },
    },
    from() {
      return {
        select() {
          return this;
        },
        update(value) {
          updates.push(value);
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: row, error: null }),
        then(resolve) {
          resolve({ data: row, error: null });
        },
      };
    },
  };
}
test('server expires an inactive session before any activity renewal', async () => {
  const row = {
    id: 'session',
    user_id: 'u',
    role: 'admin',
    expires_at: new Date(Date.now() - 1).toISOString(),
  };
  const db = sessionDb(row);
  await assert.rejects(
    auth(
      { headers: { cookie: 'ads_hub_sid=test' } },
      {
        getHeader() {
          return [];
        },
        setHeader() {},
      },
      { touch: true, db },
    ),
    (e) => e.status === 401,
  );
  assert.equal(db.updates.length, 0);
});
test('client cannot promote itself using stored role or posted metadata', async () => {
  const row = {
    id: 'session',
    user_id: 'u',
    role: 'admin',
    expires_at: new Date(Date.now() + 10000).toISOString(),
  };
  const db = sessionDb(row);
  await assert.rejects(
    auth(
      { headers: { cookie: 'ads_hub_sid=test' }, body: { role: 'admin' } },
      {},
      { admin: true, db },
    ),
    (e) => e.status === 403,
  );
});
test('authenticated activity slides server expiration by seven days', async () => {
  const row = {
    id: 'session',
    user_id: 'u',
    expires_at: new Date(Date.now() + 10000).toISOString(),
  };
  const db = sessionDb(row);
  const s = await auth(
    { headers: { cookie: 'ads_hub_sid=test' } },
    {
      getHeader() {
        return [];
      },
      setHeader() {},
    },
    { touch: true, db },
  );
  assert.equal(s.role, 'client');
  assert(Math.abs(new Date(db.updates[0].expires_at) - Date.now() - 7 * 86400000) < 500);
});
