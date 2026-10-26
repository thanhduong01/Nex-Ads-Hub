import { api } from '../../lib/server.js';
import { configured } from '../../lib/supabase.js';
import { apiVersion } from '../../lib/metaClient.js';
import { facebookConfigurationError } from '../../lib/facebookOAuth.js';
export default api(async (req, res) => {
  const oauthIssue = facebookConfigurationError();
  res.json({
    database: configured(),
    metaToken: Boolean(process.env.META_ACCESS_TOKEN),
    oauth: !oauthIssue,
    oauthIssue,
    cron: Boolean(process.env.CRON_SECRET),
    version: apiVersion(),
  });
});
