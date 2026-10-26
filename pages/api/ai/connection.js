import { api, auth } from '../../../lib/server.js';
import { disconnectAI, saveAIConnection } from '../../../lib/aiStore.js';
export default api(
  async (req, res) => {
    const session = await auth(req, res, { admin: true });
    if (req.method === 'DELETE') {
      await disconnectAI(session.db, session.user_id);
      res.json({ ok: true });
    } else res.json(await saveAIConnection(session.db, session.user_id, req.body));
  },
  ['POST', 'DELETE'],
);
