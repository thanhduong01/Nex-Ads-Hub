import { api, auth } from '../../../lib/server.js';
import { activateAIPrompt, deleteAIPrompt, saveAIPrompt } from '../../../lib/aiStore.js';
export default api(
  async (req, res) => {
    const session = await auth(req, res, { admin: true });
    if (req.method === 'DELETE') {
      await deleteAIPrompt(session.db, session.user_id, req.body?.id);
      res.json({ ok: true });
    } else if (req.method === 'PATCH') {
      await activateAIPrompt(session.db, session.user_id, req.body?.id);
      res.json({ ok: true });
    } else res.json(await saveAIPrompt(session.db, session.user_id, req.body));
  },
  ['POST', 'DELETE', 'PATCH'],
);
