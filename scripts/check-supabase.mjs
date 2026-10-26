// Read-only setup diagnostics. Never print key values, tokens or database rows.
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { assertServerKey, databaseConfiguration } from '../lib/supabase.js';

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const configuration = databaseConfiguration();
let failures = 0;
const report = (ok, name, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
};
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_EMAIL',
];
for (const name of required)
  report(
    Boolean(configuration[name]),
    name,
    configuration[name] ? 'đã có giá trị' : 'chưa cấu hình',
  );
if (required.some((name) => !configuration[name])) process.exit(1);

let serverKeyValid = true;
try {
  assertServerKey(configuration.SUPABASE_SERVICE_ROLE_KEY);
  report(true, 'Loại khóa server');
} catch (error) {
  serverKeyValid = false;
  report(false, 'Loại khóa server', error.message);
}
if (!serverKeyValid) {
  console.log(
    'Dừng kiểm tra database vì khóa server chưa có quyền quản trị. Thay khóa trong .env.local rồi chạy lại lệnh này.',
  );
  process.exit(1);
}
const db = createClient(
  configuration.NEXT_PUBLIC_SUPABASE_URL,
  configuration.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }) },
  },
);
const schema = {
  bms: 'workspace_id,id,name',
  ad_accounts:
    'workspace_id,id,bm_id,currency,is_tracked,meta_token_encrypted,sync_lock_until,last_synced_at',
  campaigns: 'workspace_id,id,account_id',
  daily_insights: 'workspace_id,campaign_id,account_id,date,spend,purchases,purchase_value',
  clients: 'workspace_id,id,owner_email',
  client_accounts: 'workspace_id,client_id,account_id',
  report_configs: 'workspace_id,client_id,month,selected_metrics,custom_names,custom_metrics',
  user_sessions: 'id,user_id,token_hash,email,role,created_at,last_active,expires_at',
};
for (const [table, columns] of Object.entries(schema)) {
  // GET with limit 0 validates names but returns no rows. HEAD can hide PostgREST errors.
  const { error } = await db.from(table).select(columns).limit(0);
  const detail = !error
    ? 'các cột cần thiết đã có'
    : ['PGRST205', '42P01'].includes(error.code)
      ? 'thiếu bảng trong schema cache'
      : ['PGRST204', '42703'].includes(error.code)
        ? 'các cột chưa khớp schema Ads Hub'
        : `không kiểm tra được (${error.code || 'network/access error'})`;
  report(!error, table, detail);
}
if (serverKeyValid) {
  const { error } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
  report(
    !error,
    'Quyền Supabase Auth Admin',
    error ? `không hợp lệ (${error.code || error.status})` : 'hợp lệ',
  );
}
console.log(
  failures
    ? `Còn ${failures} mục cần xử lý. Xem README → Lỗi đăng nhập do cấu hình.`
    : 'Kiểm tra cấu hình cơ bản đạt. Hãy thử đăng nhập và kiểm tra quyền/RPC theo docs/verification.md.',
);
process.exitCode = failures ? 1 : 0;
