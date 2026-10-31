import { api, auth, clientFor, fail } from '../../lib/server.js';
import { checked } from '../../lib/supabase.js';
import { monthRange } from '../../lib/metrics.js';
import { syncAccounts } from '../../lib/sync.js';
import { createSyncPlan, performSyncStep } from '../../lib/syncEngine.js';
import { withDatabaseDeadline } from '../../lib/requestBudget.js';
export const config = { maxDuration: 60 };
export default api(
  async (req, res) =>
    withDatabaseDeadline(Date.now() + 50000, async () => {
      const s = await auth(req, res, { admin: true });
      const { month, client_id, action, token, priority_account_ids, account_ids, force } =
        req.body || {};
      if (action === 'step') {
        res.json(await performSyncStep(s.db, s.user_id, token));
        return;
      }
      if (action && action !== 'plan') throw fail('Thao tác đồng bộ không hợp lệ.');
      if (
        priority_account_ids &&
        (!Array.isArray(priority_account_ids) ||
          priority_account_ids.length > 200 ||
          priority_account_ids.some((id) => typeof id !== 'string' || !/^act_\d+$/.test(id)))
      )
        throw fail('Danh sách ưu tiên không hợp lệ.');
      if (
        account_ids &&
        (!Array.isArray(account_ids) ||
          account_ids.length > 200 ||
          account_ids.some((id) => typeof id !== 'string' || !/^act_\d+$/.test(id)))
      )
        throw fail('Danh sách tài khoản không hợp lệ.');
      if (month) monthRange(month);
      let accountIds = account_ids;
      if (client_id) {
        await clientFor(s, client_id);
        accountIds = checked(
          await s.db.from('client_accounts').select('account_id').eq('client_id', client_id),
        ).map((l) => l.account_id);
        if (account_ids) accountIds = accountIds.filter((id) => account_ids.includes(id));
        if (!accountIds.length) {
          res.json(
            action === 'plan'
              ? { jobs: [], fresh: 0, locked: 0, totalSteps: 0 }
              : { results: [], synced: 0, failed: 0 },
          );
          return;
        }
      }
      res.json(
        action === 'plan'
          ? await createSyncPlan(s.db, s.user_id, {
              month,
              accountIds,
              priorityIds: priority_account_ids,
              force: force === true,
            })
          : await syncAccounts(s.db, {
              workspaceId: s.user_id,
              month,
              accountIds,
              budgetMs: 40000,
            }),
      );
    }),
  ['POST'],
);
