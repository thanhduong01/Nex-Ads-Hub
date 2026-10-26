import { DEFAULT_CAMPAIGN_COLUMNS, validateCampaignColumns } from './campaignColumns.js';
import { fail } from './server.js';
export const PREFERENCES_BUCKET = 'ads-hub-preferences';
const missing = (error) =>
  String(error?.statusCode || error?.status) === '404' ||
  /not found|does not exist/i.test(error?.message || '');
function pathFor(workspace) {
  if (typeof workspace !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(workspace))
    throw fail('Workspace không hợp lệ.');
  return `${workspace}/campaign-columns.json`;
}
const storageError = () =>
  fail('Không đọc/ghi được cấu hình cột. Kiểm tra kết nối Supabase Storage rồi thử lại.', 503);
export async function loadCampaignColumns(db, workspace) {
  const { data, error } = await db.storage
    .from(PREFERENCES_BUCKET)
    .download(pathFor(workspace), {}, { cache: 'no-store' });
  if (error) {
    if (missing(error)) return structuredClone(DEFAULT_CAMPAIGN_COLUMNS);
    throw storageError();
  }
  try {
    return validateCampaignColumns(JSON.parse(await data.text()));
  } catch {
    throw fail(
      'Cấu hình cột đã lưu không hợp lệ. Mở Tùy chỉnh cột và khôi phục mặc định để lưu lại.',
      503,
    );
  }
}
export async function saveCampaignColumns(db, workspace, input) {
  const config = validateCampaignColumns(input),
    path = pathFor(workspace);
  const bucket = await db.storage.getBucket(PREFERENCES_BUCKET);
  if (bucket.error && missing(bucket.error)) {
    const created = await db.storage.createBucket(PREFERENCES_BUCKET, {
      public: false,
      fileSizeLimit: 131072,
      allowedMimeTypes: ['application/json'],
    });
    if (created.error && !/already exists|duplicate/i.test(created.error.message))
      throw storageError();
  } else if (bucket.error || bucket.data?.public) throw storageError();
  const { error } = await db.storage.from(PREFERENCES_BUCKET).upload(path, JSON.stringify(config), {
    contentType: 'application/json',
    cacheControl: '0',
    upsert: true,
  });
  if (error) throw storageError();
  return config;
}
