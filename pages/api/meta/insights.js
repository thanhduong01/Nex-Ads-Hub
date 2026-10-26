import { api, auth } from '../../../lib/server.js';
import { loadWorkspaceMetaInsights } from '../../../lib/metaInsights.js';
export const config = { maxDuration: 60 };
export default api(
  async (req, res) => {
    const session = await auth(req, res, { admin: true });
    res.json(await loadWorkspaceMetaInsights(session, req.body));
  },
  ['POST'],
);
