import { api, auth } from '../../../lib/server.js';
import { loadAISettings, publicAISettings } from '../../../lib/aiStore.js';
export default api(async (req, res) => {
  const session = await auth(req, res, { admin: true });
  res.json(publicAISettings(await loadAISettings(session.db, session.user_id)));
});
