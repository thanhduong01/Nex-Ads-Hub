import { api, auth } from '../../../lib/server.js';
import { loadCampaignColumns, saveCampaignColumns } from '../../../lib/campaignPreferences.js';
export default api(
  async (req, res) => {
    const session = await auth(req, res, { admin: true });
    const config =
      req.method === 'PUT'
        ? await saveCampaignColumns(session.db, session.user_id, req.body)
        : await loadCampaignColumns(session.db, session.user_id);
    res.json({ config });
  },
  ['GET', 'PUT'],
);
