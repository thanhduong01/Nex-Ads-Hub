import { api, auth, publicSession } from '../../../lib/server.js';
export default api(
  async (req, res) => {
    const s = await auth(req, res, { touch: req.method === 'POST' });
    res.json({ session: publicSession(s) });
  },
  ['GET', 'POST'],
);
