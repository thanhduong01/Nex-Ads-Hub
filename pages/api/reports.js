import { api, auth, clientFor } from '../../lib/server.js';
import { checked } from '../../lib/supabase.js';
import { monthRange, validateConfig } from '../../lib/metrics.js';
export default api(
  async (req, res) => {
    const s = await auth(req, res, { admin: true });
    const { client_id, month, config } = req.body || {};
    const c = await clientFor(s, client_id);
    monthRange(month);
    const clean = validateConfig(config);
    const report = checked(
      await s.db
        .from('report_configs')
        .upsert(
          {
            workspace_id: c.workspace_id,
            client_id,
            month,
            ...clean,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'client_id,month' },
        )
        .select()
        .single(),
    );
    res.json({ report });
  },
  ['POST'],
);
