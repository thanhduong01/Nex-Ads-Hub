import test from 'node:test';
import assert from 'node:assert/strict';
import { assertServerKey, checked } from '../lib/supabase.js';
import { api } from '../lib/server.js';

const tokenWithRole = (role) =>
  `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;

test('server configuration rejects public keys without disclosing the key', () => {
  for (const key of [tokenWithRole('anon'), 'sb_publishable_test_value']) {
    assert.throws(
      () => assertServerKey(key),
      (error) =>
        error.status === 503 &&
        error.code === 'SUPABASE_SERVER_KEY_REQUIRED' &&
        !error.message.includes(key),
    );
  }
});

test('configuration allows secret and legacy service keys for Supabase to validate', () => {
  assert.doesNotThrow(() => assertServerKey('sb_secret_test_value'));
  assert.doesNotThrow(() => assertServerKey(tokenWithRole('service_role')));
});

test('missing schema returns actionable 503 instead of generic login failure', async () => {
  let status;
  let body;
  const res = {
    setHeader() {},
    status(value) {
      status = value;
      return this;
    },
    json(value) {
      body = value;
    },
  };
  const handler = api(async () =>
    checked({ error: { code: 'PGRST205', message: 'private database details' } }),
  );
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(status, 503);
  assert.equal(body.code, 'SUPABASE_SCHEMA_REQUIRED');
  assert(body.error.includes('schema.sql'));
  assert(!body.error.includes('private database details'));
});

test('missing columns and RPCs are schema errors; unrelated database errors remain private server failures', () => {
  for (const code of ['PGRST204', 'PGRST202', '42P01', '42703']) {
    assert.throws(
      () => checked({ error: { code, message: 'details' } }),
      (error) => error.status === 503,
    );
  }
  assert.throws(
    () => checked({ error: { code: '23505', message: 'duplicate' } }),
    (error) => error.status === 500,
  );
  assert.deepEqual(checked({ data: [], error: null }), []);
});
