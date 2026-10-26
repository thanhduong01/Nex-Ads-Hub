import { api, auth } from '../../../lib/server.js';
import { getFacebookConnections } from '../../../lib/facebookConnections.js';

export default api(async (req, res) => {
  const session = await auth(req, res, { admin: true });
  res.json(await getFacebookConnections(session.db, session.user_id));
});
