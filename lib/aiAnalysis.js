import { fail } from './server.js';
import { allRows } from './supabase.js';
import { toMetricRow } from './metaClient.js';
import { loadAISettings } from './aiStore.js';
import { compilePrompt } from './aiPrompts.js';
import { buildAIContext } from './aiContext.js';
import { generateMetaAnalysis } from './metaAI.js';

export async function runAIAnalysis(db, workspace, input, fetcher = fetch) {
  const settings = await loadAISettings(db, workspace);
  if (!settings.key || !settings.connection.verifiedAt || !settings.connection.model)
    throw fail('Hãy kiểm tra và lưu kết nối trong mục Meta AI & prompt trước khi phân tích.', 503);
  const prompt = settings.prompts.find((item) => item.id === input.promptId);
  if (!prompt)
    throw fail('Prompt đã bị xóa hoặc không thuộc workspace của bạn. Hãy chọn lại.', 404);
  const query = (table, columns) => db.from(table).select(columns).eq('workspace_id', workspace);
  const [accounts, bms, campaigns, rows] = await Promise.all([
    allRows(() =>
      query('ad_accounts', 'id,name,bm_id,is_tracked,currency,last_synced_at').order('id'),
    ),
    allRows(() => query('bms', 'id,name').order('id')),
    allRows(() => query('campaigns', 'id,account_id,name,status,daily_budget').order('id')),
    allRows(() =>
      query('daily_insights', '*')
        .gte('date', input.previousRange.since)
        .lte('date', input.range.until)
        .order('campaign_id')
        .order('date'),
    ),
  ]);
  const context = buildAIContext({ accounts, bms, campaigns, rows: rows.map(toMetricRow) }, input);
  const compiled = compilePrompt(prompt.content, {
    since: input.range.since,
    until: input.range.until,
    target_cpa: input.targetCPA,
    currency: context.currency,
    campaign_count: context.campaignCount,
    account_count: context.accountCount,
  });
  const result = await generateMetaAnalysis(
    {
      key: settings.key,
      model: settings.connection.model,
      prompt: compiled,
      context,
    },
    fetcher,
  );
  return {
    ...result,
    prompt: { id: prompt.id, name: prompt.name, content: compiled, updatedAt: prompt.updatedAt },
    scope: {
      range: input.range,
      filters: input.filters,
      targetCPA: input.targetCPA,
      accountCount: context.accountCount,
      campaignCount: context.campaignCount,
      campaignsWithInsights: context.campaignsWithInsights,
      campaignsWithoutInsights: context.campaignsWithoutInsights,
    },
  };
}
