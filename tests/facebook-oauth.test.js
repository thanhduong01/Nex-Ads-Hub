import test from 'node:test';
import assert from 'node:assert/strict';
import {
  facebookConfigurationError,
  facebookOAuthUrl,
  facebookCallbackUrl,
  facebookErrorLocation,
} from '../lib/facebookOAuth.js';
import start from '../pages/api/facebook/start.js';

const configured = {
  META_APP_ID: '123456789',
  META_APP_SECRET: 'test-app-secret',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  NEXT_PUBLIC_SITE_URL: 'https://ads-hub.example.com/',
};

test('OAuth rejects a missing or unusable encryption key before leaving the app', () => {
  for (const key of ['', Buffer.alloc(16).toString('base64')]) {
    const env = { ...configured, TOKEN_ENCRYPTION_KEY: key };
    assert.match(facebookConfigurationError(env), /TOKEN_ENCRYPTION_KEY/);
    assert.throws(
      () => facebookOAuthUrl('random-state', env),
      (error) => {
        assert.equal(error.status, 503);
        const location = new URL(facebookErrorLocation(error), configured.NEXT_PUBLIC_SITE_URL);
        assert.equal(location.searchParams.get('facebook'), 'error');
        assert.match(location.searchParams.get('message'), /TOKEN_ENCRYPTION_KEY/);
        assert(!location.toString().includes(configured.META_APP_SECRET));
        return true;
      },
    );
  }
});

test('OAuth uses a consistent callback and state without exposing server secrets', () => {
  assert.equal(facebookConfigurationError(configured), null);
  const result = new URL(facebookOAuthUrl('random-state', configured));
  assert.equal(result.origin, 'https://www.facebook.com');
  assert.equal(result.searchParams.get('client_id'), configured.META_APP_ID);
  assert.equal(result.searchParams.get('state'), 'random-state');
  assert.equal(result.searchParams.get('scope'), 'ads_read,business_management');
  assert.equal(result.searchParams.get('response_type'), 'code');
  assert.equal(
    result.searchParams.get('redirect_uri'),
    'https://ads-hub.example.com/api/facebook/callback',
  );
  assert.equal(result.searchParams.get('redirect_uri'), facebookCallbackUrl(configured));
  assert(!result.toString().includes(configured.META_APP_SECRET));
  assert(!result.toString().includes(configured.TOKEN_ENCRYPTION_KEY));
});

test('OAuth rejects HTTP callbacks with an actionable local connection alternative', () => {
  for (const site of [
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://ads-hub.example.com',
  ]) {
    const env = { ...configured, NEXT_PUBLIC_SITE_URL: site };
    assert.throws(
      () => facebookOAuthUrl('random-state', env),
      (error) => {
        assert.equal(error.code, 'FACEBOOK_CONFIG_REQUIRED');
        assert.match(error.message, /HTTPS/);
        assert.match(error.message, /System User Token/);
        const result = new URL(facebookErrorLocation(error), site);
        assert.equal(result.origin, site);
        assert.equal(result.searchParams.get('facebook'), 'error');
        return true;
      },
    );
  }
});

test('OAuth rejects invalid site URLs and does not disclose unexpected server errors', () => {
  for (const site of ['', 'not a url', 'javascript:alert(1)', 'https://user:pass@example.com']) {
    assert.match(
      facebookConfigurationError({ ...configured, NEXT_PUBLIC_SITE_URL: site }),
      /NEXT_PUBLIC_SITE_URL/,
    );
  }
  const result = facebookErrorLocation(new Error('private server information'));
  assert(!result.includes('private'));
  assert.equal(
    new URL(result, configured.NEXT_PUBLIC_SITE_URL).searchParams.get('facebook'),
    'error',
  );
});

test('unauthenticated OAuth start returns to the app, clears state, and never redirects to Meta', async () => {
  const headers = {};
  const res = {
    getHeader: (name) => headers[name],
    setHeader: (name, value) => {
      headers[name] = value;
    },
    redirect(status, location) {
      this.status = status;
      this.location = location;
    },
  };
  await start({ method: 'GET', headers: {} }, res);
  assert.equal(res.status, 302);
  assert(res.location.startsWith('/?facebook=error&'));
  assert.equal(
    new URL(res.location, configured.NEXT_PUBLIC_SITE_URL).searchParams.get('message'),
    'Vui lòng đăng nhập.',
  );
  assert.equal(headers['Cache-Control'], 'no-store');
  assert(
    headers['Set-Cookie'].some(
      (value) => value.startsWith('ads_hub_oauth=;') && value.includes('Max-Age=0'),
    ),
  );
});
