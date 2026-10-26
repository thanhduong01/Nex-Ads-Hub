import { apiVersion, graph, withMetaDeadline } from './metaClient.js';
import { allRows } from './supabase.js';
import { decrypt, digest } from './server.js';

export async function inspectMetaIdentity(token, fetcher = fetch, deadline = Date.now() + 12000) {
  const me = await withMetaDeadline(deadline, () =>
    graph('me', { fields: 'id,name' }, token, fetcher),
  );
  const identity = { id: me.id, name: me.name || null, type: 'UNKNOWN' };
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) return identity;
  // Debug metadata never leaves the server except for this explicit allowlist.
  try {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return identity;
    const url = new URL(`https://graph.facebook.com/${apiVersion()}/debug_token`);
    url.searchParams.set('input_token', token);
    const response = await fetcher(url, {
      headers: {
        Authorization: `Bearer ${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`,
      },
      signal: AbortSignal.timeout(Math.min(10000, remaining)),
    });
    const { data } = await response.json();
    if (response.ok && data?.is_valid && String(data.user_id) === String(me.id)) {
      identity.type = data.type || 'UNKNOWN';
      identity.appId = data.app_id || null;
      identity.appName = data.application || null;
    }
  } catch {
    // /me already verified the identity. An unavailable debugger must not invent its token type.
  }
  return identity;
}

export async function getFacebookConnections(db, workspaceId, inspect = inspectMetaIdentity) {
  const accounts = await allRows(() =>
    db
      .from('ad_accounts')
      .select('id,fb_user_id,meta_token_encrypted')
      .eq('workspace_id', workspaceId)
      .order('id'),
  );
  const groups = new Map();
  for (const account of accounts) {
    const source = account.meta_token_encrypted ? 'saved_token' : 'server_token';
    let token;
    try {
      token = account.meta_token_encrypted
        ? decrypt(account.meta_token_encrypted)
        : process.env.META_ACCESS_TOKEN;
    } catch {
      /* Expose a generic configuration error below, never ciphertext. */
    }
    const key = `${source}:${token ? digest(token) : account.fb_user_id || 'unknown'}`;
    if (!groups.has(key)) groups.set(key, { source, token, accountCount: 0, ids: new Set() });
    const group = groups.get(key);
    group.accountCount++;
    if (account.fb_user_id) group.ids.add(account.fb_user_id);
  }
  const pending = [...groups.values()];
  const connections = new Array(pending.length);
  const deadline = Date.now() + 20000;
  async function inspectGroup(group) {
    const item = {
      source: group.source,
      accountCount: group.accountCount,
      storedIdentityIds: [...group.ids],
      identity: null,
    };
    try {
      if (!group.token || Date.now() >= deadline) throw new Error('Unavailable token or timeout');
      item.identity = await inspect(group.token, fetch, deadline);
      item.matchesStoredIdentity = group.ids.size === 1 && group.ids.has(item.identity.id);
      if (!item.matchesStoredIdentity)
        item.warning =
          'Danh tính token hiện tại khác nguồn đã lưu hoặc chưa xác định. Hãy kết nối lại để cập nhật danh sách tài khoản.';
    } catch {
      item.error = 'Chưa xác minh được danh tính Meta. Kiểm tra token hoặc thử lại.';
    }
    return item;
  }
  // Bound total latency and concurrent Meta requests when multiple Facebook sources are saved.
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, pending.length) }, async () => {
      while (next < pending.length) {
        const index = next++;
        connections[index] = await inspectGroup(pending[index]);
      }
    }),
  );
  return { connections, checkedAt: new Date().toISOString() };
}
