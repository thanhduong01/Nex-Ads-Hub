import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../lib/api.js';

test('stalled requests abort and release the UI with an actionable timeout', async () => {
  let aborted = false;
  const stalledFetch = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          aborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  await assert.rejects(api('/api/connect', { timeoutMs: 20 }, stalledFetch), (error) => {
    assert.equal(error.code, 'REQUEST_TIMEOUT');
    assert.match(error.message, /Tải lại dữ liệu/);
    return true;
  });
  assert.equal(aborted, true);
});

test('successful API requests retain headers and never forward timeout options to fetch', async () => {
  let signal;
  const result = await api(
    '/api/connect',
    {
      method: 'POST',
      body: '{}',
      timeoutMs: 20,
      headers: { 'X-Test': 'yes' },
    },
    async (_url, options) => {
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.equal(options.headers['X-Test'], 'yes');
      assert(!('timeoutMs' in options));
      signal = options.signal;
      return { ok: true, json: async () => ({ accounts: 20 }) };
    },
  );
  assert.equal(result.accounts, 20);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(signal.aborted, false);
});

test('API timeout handling preserves authentication and application errors', async () => {
  await assert.rejects(
    api('/api/auth/session', {}, async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Vui lòng đăng nhập.' }),
    })),
    (error) => error.status === 401 && error.message === 'Vui lòng đăng nhập.',
  );
});
