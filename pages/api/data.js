import { api, auth } from '../../lib/server.js';
import { loadWorkspaceData } from '../../lib/workspaceData.js';
import { withDatabaseDeadline } from '../../lib/requestBudget.js';
export const config = { maxDuration: 30 };
export default api(async (req, res) =>
  withDatabaseDeadline(Date.now() + 24000, async () => {
    const session = await auth(req, res);
    res.json(await loadWorkspaceData(session, req.query));
  }),
);
