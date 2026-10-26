import { auth, fail, randomToken, setCookie } from '../../../lib/server.js';
import { facebookOAuthUrl, facebookErrorLocation } from '../../../lib/facebookOAuth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      throw fail('Phương thức không được hỗ trợ.', 405);
    }
    await auth(req, res, { admin: true });
    const state = randomToken();
    const url = facebookOAuthUrl(state);
    setCookie(res, 'ads_hub_oauth', state, 600);
    res.redirect(302, url);
  } catch (error) {
    setCookie(res, 'ads_hub_oauth', '', 0);
    // Return through the popup's existing postMessage flow instead of stranding it on JSON.
    res.redirect(302, facebookErrorLocation(error));
  }
}
