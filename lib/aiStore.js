import { randomUUID } from 'node:crypto';
import { encrypt, decrypt, fail } from './server.js';
import { DEFAULT_AI_PROMPTS, validatePrompt } from './aiPrompts.js';
import { listAIModels } from './metaAI.js';
export const AI_BUCKET = 'ads-hub-ai';
const missing = (error) =>
  String(error?.statusCode || error?.status) === '404' ||
  /not found|does not exist/i.test(error?.message || '');
const storageError = () =>
  fail('Không đọc/ghi được cấu hình Meta AI. Kiểm tra kết nối Supabase Storage và thử lại.', 503);
function prefix(workspace) {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(workspace)) throw fail('Workspace không hợp lệ.');
  return workspace;
}
function promptId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id))
    throw fail('ID prompt không hợp lệ.');
  return id;
}
async function read(db, path, fallback) {
  const { data, error } = await db.storage
    .from(AI_BUCKET)
    .download(path, {}, { cache: 'no-store' });
  if (error) {
    if (missing(error)) return fallback;
    throw storageError();
  }
  try {
    return JSON.parse(await data.text());
  } catch {
    throw storageError();
  }
}
async function write(db, path, value) {
  const bucket = await db.storage.getBucket(AI_BUCKET);
  if (bucket.error && missing(bucket.error)) {
    const created = await db.storage.createBucket(AI_BUCKET, {
      public: false,
      fileSizeLimit: 262144,
      allowedMimeTypes: ['application/json'],
    });
    if (created.error && !/already exists|duplicate/i.test(created.error.message))
      throw storageError();
  } else if (bucket.error || bucket.data?.public) throw storageError();
  const { error } = await db.storage
    .from(AI_BUCKET)
    .upload(path, JSON.stringify(value), {
      contentType: 'application/json',
      cacheControl: '0',
      upsert: true,
    });
  if (error) throw storageError();
}
export async function loadAISettings(db, workspace) {
  const root = prefix(workspace);
  const [connection, preferences, listing] = await Promise.all([
    read(db, `${root}/connection.json`, {}),
    read(db, `${root}/preferences.json`, {}),
    db.storage
      .from(AI_BUCKET)
      .list(`${root}/prompts`, { limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
  ]);
  if (listing.error && !missing(listing.error)) throw storageError();
  const overrides = await Promise.all(
    (listing.data || [])
      .filter((file) => /^[a-zA-Z0-9-]{1,80}\.json$/.test(file.name))
      .map((file) => read(db, `${root}/prompts/${file.name}`, null)),
  );
  const prompts = new Map(
    DEFAULT_AI_PROMPTS.map((prompt) => [prompt.id, { ...prompt, updatedAt: null }]),
  );
  for (const prompt of overrides) {
    if (!prompt) continue;
    if (prompt.deleted) prompts.delete(prompt.id);
    else prompts.set(prompt.id, prompt);
  }
  let key = '';
  try {
    key = connection.disabled
      ? ''
      : connection.apiKeyEncrypted
        ? decrypt(connection.apiKeyEncrypted)
        : process.env.MODEL_API_KEY || '';
  } catch {
    connection.issue =
      'Không giải mã được khóa đã lưu. Kiểm tra TOKEN_ENCRYPTION_KEY hoặc nhập lại API key.';
  }
  const all = [...prompts.values()];
  return {
    connection,
    key,
    prompts: all,
    activePromptId: all.some((prompt) => prompt.id === preferences.activePromptId)
      ? preferences.activePromptId
      : all[0]?.id || '',
  };
}
export function publicAISettings(settings) {
  const { connection, key, prompts, activePromptId } = settings;
  return {
    connection: {
      configured: Boolean(key),
      verifiedAt: connection.verifiedAt || null,
      label: connection.label || 'Kết nối Meta AI',
      model: connection.model || 'auto',
      models: connection.models || [],
      issue: connection.issue || null,
      source: key ? (connection.apiKeyEncrypted ? 'saved_key' : 'server_key') : null,
    },
    prompts,
    activePromptId,
  };
}
export async function saveAIConnection(db, workspace, input, fetcher = fetch) {
  const settings = await loadAISettings(db, workspace);
  if (
    input?.apiKey !== undefined &&
    (typeof input.apiKey !== 'string' || input.apiKey.length > 8192)
  )
    throw fail('API key không hợp lệ.');
  const supplied = input?.apiKey?.trim();
  if (supplied && (supplied.length < 16 || /\s/.test(supplied)))
    throw fail('API key không hợp lệ.');
  if (typeof input?.label !== 'string' || !input.label.trim() || input.label.length > 100)
    throw fail('Tên kết nối cần có 1–100 ký tự.');
  const key = supplied || settings.key;
  const models = await listAIModels(key, fetcher);
  const model =
    input.model && input.model !== 'auto'
      ? input.model
      : models.includes('muse-spark-1.3')
        ? 'muse-spark-1.3'
        : models[0];
  if (!models.includes(model))
    throw fail('Model đã chọn không có trong tài khoản. Chọn “Tự động” rồi kiểm tra lại kết nối.');
  const connection = {
    label: input.label.trim(),
    model,
    models,
    verifiedAt: new Date().toISOString(),
    disabled: false,
    apiKeyEncrypted: supplied ? encrypt(supplied) : settings.connection.apiKeyEncrypted || null,
  };
  await write(db, `${prefix(workspace)}/connection.json`, connection);
  return publicAISettings({ ...settings, connection, key });
}
export async function disconnectAI(db, workspace) {
  await write(db, `${prefix(workspace)}/connection.json`, { disabled: true });
}
export async function saveAIPrompt(db, workspace, input) {
  const value = validatePrompt(input);
  const settings = await loadAISettings(db, workspace);
  const id = input.id ? promptId(input.id) : randomUUID();
  if (!input.id && settings.prompts.length >= 50)
    throw fail('Tối đa 50 prompt. Hãy xóa prompt không còn sử dụng.');
  if (input.id && !settings.prompts.some((prompt) => prompt.id === id))
    throw fail('Không tìm thấy prompt.', 404);
  const prompt = { id, ...value, updatedAt: new Date().toISOString() };
  await write(db, `${prefix(workspace)}/prompts/${id}.json`, prompt);
  return prompt;
}
export async function deleteAIPrompt(db, workspace, id) {
  const settings = await loadAISettings(db, workspace);
  if (!settings.prompts.some((prompt) => prompt.id === promptId(id)))
    throw fail('Không tìm thấy prompt.', 404);
  const path = `${prefix(workspace)}/prompts/${id}.json`;
  if (DEFAULT_AI_PROMPTS.some((prompt) => prompt.id === id))
    await write(db, path, { id, deleted: true });
  else {
    const { error } = await db.storage.from(AI_BUCKET).remove([path]);
    if (error) throw storageError();
  }
}
export async function activateAIPrompt(db, workspace, id) {
  const settings = await loadAISettings(db, workspace);
  if (!settings.prompts.some((prompt) => prompt.id === promptId(id)))
    throw fail('Không tìm thấy prompt.', 404);
  await write(db, `${prefix(workspace)}/preferences.json`, { activePromptId: id });
}
