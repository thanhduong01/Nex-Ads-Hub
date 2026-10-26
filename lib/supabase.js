import { createClient } from '@supabase/supabase-js';
const databaseEnvironmentNames = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_EMAIL',
];
export function missingDatabaseConfiguration() {
  // Return names only. Values include private server credentials.
  return databaseEnvironmentNames.filter((name) => !process.env[name]?.trim());
}
export function configured() {
  return missingDatabaseConfiguration().length === 0;
}
function factory(key) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !key)
    throw Object.assign(new Error('Chưa cấu hình Supabase. Xem .env.example và README.'), {
      status: 503,
    });
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
// Lazy clients let the project build before deployment secrets are supplied.
export function assertServerKey(key) {
  if (!key) return; // factory reports missing configuration.
  let role;
  if (key.split('.').length === 3) {
    try {
      role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
    } catch {}
  }
  // This catches a configuration mistake; Supabase still validates the key itself.
  if (key.startsWith('sb_publishable_') || role === 'anon') {
    throw Object.assign(
      new Error(
        'SUPABASE_SERVICE_ROLE_KEY đang dùng khóa anon/publishable. Hãy thay bằng Secret key (sb_secret_...) hoặc service_role trong .env.local rồi khởi động lại server.',
      ),
      { status: 503, code: 'SUPABASE_SERVER_KEY_REQUIRED' },
    );
  }
}
export const supabaseAdmin = () => {
  assertServerKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return factory(process.env.SUPABASE_SERVICE_ROLE_KEY);
};
export const supabaseAnon = () => factory(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export function checked(result) {
  if (result.error) {
    if (['PGRST205', 'PGRST204', 'PGRST202', '42P01', '42703'].includes(result.error.code)) {
      throw Object.assign(
        new Error(
          'Cấu trúc Supabase chưa khớp Ads Hub: thiếu bảng, cột hoặc hàm cần thiết. Kiểm tra supabase/schema.sql và hướng dẫn thiết lập database trong README; chỉ thêm email trong Authentication chưa đủ.',
        ),
        { status: 503, code: 'SUPABASE_SCHEMA_REQUIRED' },
      );
    }
    throw Object.assign(new Error(`Database: ${result.error.message}`), {
      status: 500,
      code: result.error.code,
    });
  }
  return result.data;
}
export async function allRows(factory) {
  let result = [];
  for (let from = 0; ; from += 1000) {
    const page = checked(await factory().range(from, from + 999));
    result.push(...page);
    if (page.length < 1000) break;
  }
  return result;
}
