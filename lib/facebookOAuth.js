import { apiVersion } from './metaClient.js';
import { fail } from './server.js';

export function facebookConfigurationError(env = process.env) {
  const missing = [
    'META_APP_ID',
    'META_APP_SECRET',
    'TOKEN_ENCRYPTION_KEY',
    'NEXT_PUBLIC_SITE_URL',
  ].filter((name) => !env[name]?.trim());
  if (missing.length) return `Chưa thể kết nối Facebook: thiếu ${missing.join(', ')} trên máy chủ.`;
  if (Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'base64').length !== 32)
    return 'TOKEN_ENCRYPTION_KEY cần chứa 32 byte mã hóa base64 để lưu kết nối Facebook.';
  try {
    const site = new URL(env.NEXT_PUBLIC_SITE_URL);
    if (!['http:', 'https:'].includes(site.protocol) || site.username || site.password)
      throw new Error('Invalid site URL');
    if (site.protocol !== 'https:')
      return 'Đăng nhập qua Facebook cần địa chỉ HTTPS. Khi chạy local bằng HTTP, hãy chọn Kết nối bằng System User Token. Để dùng OAuth, mở ứng dụng qua HTTPS và đăng ký URL callback trong Meta App.';
  } catch {
    return 'NEXT_PUBLIC_SITE_URL cần là địa chỉ http hoặc https của ứng dụng.';
  }
  return null;
}

export function facebookCallbackUrl(env = process.env) {
  return new URL('/api/facebook/callback', env.NEXT_PUBLIC_SITE_URL).toString();
}

export function facebookOAuthUrl(state, env = process.env) {
  const problem = facebookConfigurationError(env);
  if (problem) throw Object.assign(fail(problem, 503), { code: 'FACEBOOK_CONFIG_REQUIRED' });
  const url = new URL(`https://www.facebook.com/${apiVersion()}/dialog/oauth`);
  url.search = new URLSearchParams({
    client_id: env.META_APP_ID,
    redirect_uri: facebookCallbackUrl(env),
    state,
    scope: 'ads_read,business_management',
    response_type: 'code',
  }).toString();
  return url.toString();
}

export function facebookErrorLocation(error) {
  const expected =
    (error.status >= 400 && error.status < 500) || error.code === 'FACEBOOK_CONFIG_REQUIRED';
  const message = expected
    ? error.message
    : 'Kết nối Facebook thất bại. Kiểm tra cấu hình máy chủ.';
  return `/?${new URLSearchParams({ facebook: 'error', message })}`;
}
