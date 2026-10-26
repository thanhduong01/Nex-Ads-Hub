import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertServerKey,
  checked,
  configured,
  missingDatabaseConfiguration,
  databaseConfiguration,
  supabaseAdmin,
  supabaseAnon,
} from '../lib/supabase.js';
import { api } from '../lib/server.js';
import login from '../pages/api/auth/login.js';
import statusRoute from '../pages/api/status.js';

const tokenWithRole = (role) =>
  `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;

test('deployment diagnostics name each missing variable without exposing configured values', async (t) => {
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://private-project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'private-test-publishable-key',
    SUPABASE_SERVICE_ROLE_KEY: 'private-test-server-secret',
    ADMIN_EMAIL: 'private-admin@example.com',
    NEXT_PUBLIC_SITE_URL: 'https://app.example.com',
  };
  const aliases = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY'];
  const original = Object.fromEntries(
    [...Object.keys(values), ...aliases].map((name) => [name, process.env[name]]),
  );
  t.after(() => {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  Object.assign(process.env, values);
  for (const name of aliases) delete process.env[name];
  assert(configured());
  for (const name of Object.keys(values).filter((name) => name !== 'NEXT_PUBLIC_SITE_URL')) {
    delete process.env[name];
    assert.deepEqual(missingDatabaseConfiguration(), [name]);
    assert.equal(configured(), false);
    process.env[name] = values[name];
  }
  process.env.SUPABASE_SERVICE_ROLE_KEY = '   ';
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
  const diagnostic = res();
  await statusRoute({ method: 'GET', headers: {} }, diagnostic);
  assert.equal(diagnostic.body.database, false);
  assert.deepEqual(diagnostic.body.databaseMissing, ['SUPABASE_SERVICE_ROLE_KEY']);
  const rejected = res();
  await login(
    { method: 'POST', headers: { origin: values.NEXT_PUBLIC_SITE_URL }, body: {} },
    rejected,
  );
  assert.equal(rejected.statusCode, 503);
  assert.equal(rejected.body.code, 'SUPABASE_ENV_REQUIRED');
  assert(rejected.body.error.includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert(rejected.body.error.includes('Redeploy'));
  const output = JSON.stringify([diagnostic.body, rejected.body]);
  for (const value of Object.values(values)) assert(!output.includes(value));
});

test('production Supabase variable names configure the same server clients and retain canonical precedence', (t) => {
  const names = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_KEY',
    'ADMIN_EMAIL',
  ];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  for (const name of names) delete process.env[name];
  Object.assign(process.env, {
    SUPABASE_URL: ' https://alias-project.supabase.co ',
    SUPABASE_ANON_KEY: 'public-alias-key',
    SUPABASE_SERVICE_KEY: 'sb_secret_server_alias',
    ADMIN_EMAIL: 'owner@example.com',
  });
  assert(configured());
  assert.deepEqual(missingDatabaseConfiguration(), []);
  assert.equal(
    databaseConfiguration().NEXT_PUBLIC_SUPABASE_URL,
    'https://alias-project.supabase.co',
  );
  assert.equal(supabaseAdmin().supabaseKey, 'sb_secret_server_alias');
  assert.equal(supabaseAnon().supabaseKey, 'public-alias-key');
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://canonical-project.supabase.co';
  assert.equal(
    databaseConfiguration().NEXT_PUBLIC_SUPABASE_URL,
    'https://canonical-project.supabase.co',
  );
  process.env.SUPABASE_SERVICE_KEY = 'sb_publishable_wrong_server_key';
  assert.throws(
    () => supabaseAdmin(),
    (error) => error.code === 'SUPABASE_SERVER_KEY_REQUIRED',
  );
});

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
