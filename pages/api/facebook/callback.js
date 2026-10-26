import { auth, cookies, setCookie, constantEqual, fail } from '../../../lib/server.js';
import { apiVersion } from '../../../lib/metaClient.js';
import { connectAccounts } from '../../../lib/sync.js';
import { checked } from '../../../lib/supabase.js';
import { facebookCallbackUrl, facebookErrorLocation } from '../../../lib/facebookOAuth.js';
async function exchange(params) {
  const url = new URL(`https://graph.facebook.com/${apiVersion()}/oauth/access_token`);
  url.search = new URLSearchParams(params).toString();
  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  const d = await r.json();
  if (!r.ok || !d.access_token)
    throw fail('Facebook không cấp token. Kiểm tra quyền ứng dụng.', 400);
  return d.access_token;
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'GET') throw fail('Phương thức không hợp lệ.', 405);
    const s = await auth(req, res, { admin: true });
    const state = cookies(req).ads_hub_oauth;
    setCookie(res, 'ads_hub_oauth', '', 0);
    if (!state || !constantEqual(state, req.query.state))
      throw fail('Phiên kết nối Facebook không hợp lệ.', 403);
    if (req.query.error || typeof req.query.code !== 'string')
      throw fail('Bạn chưa cấp quyền kết nối Facebook.');
    const common = {
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
    };
    const short = await exchange({
      ...common,
      code: req.query.code,
      redirect_uri: facebookCallbackUrl(),
    });
    const token = await exchange({
      ...common,
      grant_type: 'fb_exchange_token',
      fb_exchange_token: short,
    });
    const result = await connectAccounts(s.db, s.user_id, token, { persist: true });
    checked(
      await s.db.from('user_sessions').update({ fb_user_id: result.fb_user_id }).eq('id', s.id),
    );
    res.redirect(302, '/?facebook=connected');
  } catch (error) {
    res.redirect(302, facebookErrorLocation(error));
  }
}
