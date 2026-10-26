import { api, auth } from '../../../lib/server.js';
import { validateAnalysisInput } from '../../../lib/aiContext.js';
import { runAIAnalysis } from '../../../lib/aiAnalysis.js';
export default api(
  async (req, res) => {
    const session = await auth(req, res, { admin: true });
    res.json(await runAIAnalysis(session.db, session.user_id, validateAnalysisInput(req.body)));
  },
  ['POST'],
);
export const config = { api: { bodyParser: { sizeLimit: '32kb' }, responseLimit: '1mb' } };
