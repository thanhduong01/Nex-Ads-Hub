import {
  api,
  fail,
  isAdminEmail,
  randomToken,
  digest,
  setCookie,
  publicSession,
} from '../../../lib/server.js';
import {
  supabaseAnon,
  supabaseAdmin,
  missingDatabaseConfiguration,
  checked,
} from '../../../lib/supabase.js';
import { SEVEN_DAYS } from '../../../lib/metrics.js';
export default api(
  async (req, res) => {
    const missing = missingDatabaseConfiguration();
    if (missing.length)
      throw Object.assign(
        fail(
          `Thiếu cấu hình đăng nhập: ${missing.join(', ')}. Kiểm tra biến môi trường của bản deploy đang mở rồi Redeploy; nếu chạy local, kiểm tra .env.local và khởi động lại server.`,
          503,
        ),
        { code: 'SUPABASE_ENV_REQUIRED' },
      );
    const { email, password } = req.body || {};
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      email.length > 254 ||
      password.length > 1024
    )
      throw fail('Email hoặc mật khẩu không hợp lệ.');
    const db = supabaseAdmin();
    const { data, error } = await supabaseAnon().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.user) throw fail('Email hoặc mật khẩu không đúng.', 401);
    const role = isAdminEmail(data.user.email) ? 'admin' : 'client';
    if (role === 'client') {
      const allowed = checked(
        await db
          .from('clients')
          .select('id')
          .eq('owner_email', data.user.email.toLowerCase())
          .limit(1),
      );
      if (!allowed.length) throw fail('Email này chưa được cấp quyền xem báo cáo.', 403);
    }
    const token = randomToken();
    const now = new Date().toISOString();
    const row = checked(
      await db
        .from('user_sessions')
        .insert({
          user_id: data.user.id,
          email: data.user.email.toLowerCase(),
          role,
          token_hash: digest(token),
          created_at: now,
          last_active: now,
          expires_at: new Date(Date.now() + SEVEN_DAYS).toISOString(),
        })
        .select()
        .single(),
    );
    setCookie(res, 'ads_hub_sid', token);
    res.json({ session: publicSession(row) });
  },
  ['POST'],
);
