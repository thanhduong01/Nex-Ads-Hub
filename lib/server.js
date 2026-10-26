import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from 'node:crypto';
import { supabaseAdmin, checked } from './supabase.js';
import { SEVEN_DAYS } from './metrics.js';
export const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');
export const isAdminEmail = (email) =>
  Boolean(
    email &&
      process.env.ADMIN_EMAIL &&
      email.toLowerCase() === process.env.ADMIN_EMAIL.trim().toLowerCase(),
  );
export function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf('=');
        return [p.slice(0, i).trim(), decodeURIComponent(p.slice(i + 1))];
      }),
  );
}
export function setCookie(res, name, value, maxAge = 7 * 86400) {
  const old = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [
    ...(Array.isArray(old) ? old : [old]),
    `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
  ]);
}
export function csrf(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.origin;
  const allowed = process.env.NEXT_PUBLIC_SITE_URL;
  if (!allowed) throw fail('Chưa cấu hình NEXT_PUBLIC_SITE_URL trên máy chủ.', 503);
  let matches = false;
  try {
    matches = Boolean(origin && new URL(origin).origin === new URL(allowed).origin);
  } catch {}
  if (!matches) throw fail('Yêu cầu không cùng nguồn.', 403);
}
export function api(handler, methods = ['GET']) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        throw fail('Phương thức không được hỗ trợ.', 405);
      }
      csrf(req);
      await handler(req, res);
    } catch (error) {
      const status = error.status || 500;
      res
        .status(status)
        .json({
          error:
            status >= 500 && status !== 503
              ? 'Không thể hoàn thành yêu cầu. Kiểm tra cấu hình hoặc nhật ký máy chủ.'
              : error.message,
          code: error.code || undefined,
        });
      if (status >= 500)
        console.error(
          '[Ads Hub]',
          error.code || error.name,
          error.message?.replace(/(access_token|client_secret|token)=[^&\s]+/gi, '$1=[redacted]'),
        );
    }
  };
}
export async function auth(req, res, { admin = false, touch = false, db: providedDb } = {}) {
  const token = cookies(req).ads_hub_sid;
  if (!token) throw fail('Vui lòng đăng nhập.', 401);
  const db = providedDb || supabaseAdmin();
  const row = checked(
    await db.from('user_sessions').select('*').eq('token_hash', digest(token)).maybeSingle(),
  );
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
    setCookie(res, 'ads_hub_sid', '', 0);
    throw fail('Phiên đăng nhập đã hết hạn sau 7 ngày không hoạt động', 401);
  }
  // Re-evaluate the server-owned role; browser metadata never grants permissions.
  const { data, error } = await db.auth.admin.getUserById(row.user_id);
  if (
    error ||
    !data.user ||
    (data.user.banned_until && new Date(data.user.banned_until) > new Date())
  )
    throw fail('Tài khoản không còn hoạt động.', 401);
  const role = isAdminEmail(data.user.email) ? 'admin' : 'client';
  if (admin && role !== 'admin') throw fail('Bạn chỉ có quyền xem báo cáo của mình.', 403);
  if (touch) {
    row.last_active = new Date().toISOString();
    row.expires_at = new Date(Date.now() + SEVEN_DAYS).toISOString();
    checked(
      await db
        .from('user_sessions')
        .update({ last_active: row.last_active, expires_at: row.expires_at })
        .eq('id', row.id),
    );
    setCookie(res, 'ads_hub_sid', token);
  }
  return { ...row, email: data.user.email, role, db };
}
export function publicSession(s) {
  return {
    email: s.email,
    fb_user_id: s.fb_user_id || '',
    loginAt: new Date(s.created_at).getTime(),
    lastActive: new Date(s.last_active).getTime(),
    expiresAt: new Date(s.expires_at).getTime(),
    role: s.role,
  };
}
export async function accessibleClients(s) {
  let query = s.db.from('clients').select('*').order('name');
  query =
    s.role === 'admin'
      ? query.eq('workspace_id', s.user_id)
      : query.eq('owner_email', s.email.toLowerCase());
  return checked(await query);
}
export async function clientFor(s, id) {
  const clients = await accessibleClients(s);
  const client = clients.find((c) => c.id === id);
  if (!client) throw fail('Không tìm thấy khách hàng hoặc không có quyền truy cập.', 404);
  return client;
}
export function constantEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function encrypt(value) {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32)
    throw fail('Cần TOKEN_ENCRYPTION_KEY gồm 32 byte để lưu kết nối Facebook.', 503);
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64')).join('.');
}
export function decrypt(value) {
  const [iv, tag, body] = value.split('.').map((v) => Buffer.from(v, 'base64'));
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || '', 'base64');
  const cipher = createDecipheriv('aes-256-gcm', key, iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(body), cipher.final()]).toString('utf8');
}
