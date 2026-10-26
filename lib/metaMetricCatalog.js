import { META_INSIGHT_FIELDS } from './metaInsightFields.js';

export { META_INSIGHT_FIELDS };
export const META_CATALOG_SOURCE =
  'https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adsinsights.py';
const names = {
  spend: 'Chi tiêu',
  impressions: 'Lượt hiển thị',
  reach: 'Tiếp cận toàn kỳ',
  frequency: 'Tần suất toàn kỳ',
  clicks: 'Lượt nhấp (tất cả)',
  cpc: 'CPC (tất cả)',
  cpm: 'CPM',
  cpp: 'Chi phí / 1.000 người tiếp cận',
  ctr: 'CTR (tất cả)',
  inline_link_clicks: 'Lượt nhấp liên kết',
  inline_link_click_ctr: 'CTR liên kết',
  inline_post_engagement: 'Tương tác bài viết',
  cost_per_inline_link_click: 'CPC liên kết',
  cost_per_inline_post_engagement: 'Chi phí / tương tác bài viết',
  unique_clicks: 'Người nhấp (tất cả)',
  unique_ctr: 'CTR duy nhất (tất cả)',
  unique_inline_link_clicks: 'Người nhấp liên kết',
  unique_inline_link_click_ctr: 'CTR liên kết duy nhất',
  cost_per_unique_click: 'Chi phí / người nhấp',
  cost_per_unique_inline_link_click: 'Chi phí / người nhấp liên kết',
  actions: 'Hành động',
  action_values: 'Giá trị hành động',
  cost_per_action_type: 'Chi phí / hành động',
  unique_actions: 'Hành động duy nhất',
  cost_per_unique_action_type: 'Chi phí / hành động duy nhất',
  conversions: 'Chuyển đổi',
  conversion_values: 'Giá trị chuyển đổi',
  cost_per_conversion: 'Chi phí / chuyển đổi',
  unique_conversions: 'Chuyển đổi duy nhất',
  cost_per_unique_conversion: 'Chi phí / chuyển đổi duy nhất',
  outbound_clicks: 'Lượt nhấp ra ngoài',
  outbound_clicks_ctr: 'CTR ra ngoài',
  unique_outbound_clicks: 'Người nhấp ra ngoài',
  unique_outbound_clicks_ctr: 'CTR ra ngoài duy nhất',
  cost_per_outbound_click: 'Chi phí / nhấp ra ngoài',
  cost_per_unique_outbound_click: 'Chi phí / người nhấp ra ngoài',
  video_play_actions: 'Lượt phát video',
  video_p25_watched_actions: 'Video xem 25%',
  video_p50_watched_actions: 'Video xem 50%',
  video_p75_watched_actions: 'Video xem 75%',
  video_p95_watched_actions: 'Video xem 95%',
  video_p100_watched_actions: 'Video xem 100%',
  video_thruplay_watched_actions: 'ThruPlay',
  video_continuous_2_sec_watched_actions: 'Video xem liên tục 2 giây',
  video_6_sec_watched_actions: 'Video xem 6 giây',
  video_15_sec_watched_actions: 'Video xem 15 giây',
  video_30_sec_watched_actions: 'Video xem 30 giây',
  video_avg_time_watched_actions: 'Thời gian xem video trung bình',
  video_time_watched_actions: 'Tổng thời gian xem video',
  cost_per_thruplay: 'Chi phí / ThruPlay',
  cost_per_2_sec_continuous_video_view: 'Chi phí / xem video 2 giây',
  cost_per_15_sec_video_view: 'Chi phí / xem video 15 giây',
  video_play_curve_actions: 'Đường cong phát video',
  video_play_retention_graph_actions: 'Biểu đồ giữ chân video',
  purchase_roas: 'ROAS mua hàng',
  website_purchase_roas: 'ROAS mua hàng website',
  mobile_app_purchase_roas: 'ROAS mua hàng ứng dụng',
  estimated_ad_recallers: 'Người ước tính nhớ quảng cáo',
  estimated_ad_recall_rate: 'Tỷ lệ ước tính nhớ quảng cáo',
  cost_per_estimated_ad_recallers: 'Chi phí / người ước tính nhớ quảng cáo',
  social_spend: 'Chi tiêu tương tác xã hội',
  quality_ranking: 'Xếp hạng chất lượng',
  engagement_rate_ranking: 'Xếp hạng tương tác',
  conversion_rate_ranking: 'Xếp hạng chuyển đổi',
  instagram_profile_follow: 'Lượt theo dõi Instagram',
  instagram_profile_visits: 'Lượt truy cập trang Instagram',
  account_currency: 'Đơn vị tiền',
  account_id: 'ID tài khoản',
  account_name: 'Tên tài khoản',
  campaign_id: 'ID chiến dịch',
  campaign_name: 'Tên chiến dịch',
  adset_id: 'ID nhóm quảng cáo',
  adset_name: 'Tên nhóm quảng cáo',
  ad_id: 'ID quảng cáo',
  ad_name: 'Tên quảng cáo',
  objective: 'Mục tiêu',
  optimization_goal: 'Mục tiêu tối ưu',
  buying_type: 'Loại mua',
  attribution_setting: 'Cửa sổ phân bổ',
  date_start: 'Ngày bắt đầu báo cáo',
  date_stop: 'Ngày kết thúc báo cáo',
  results: 'Kết quả',
  cost_per_result: 'Chi phí / kết quả',
};
const textFields = new Set([
  'account_currency',
  'account_id',
  'account_name',
  'ad_id',
  'ad_name',
  'adset_id',
  'adset_name',
  'adset_start',
  'adset_end',
  'age_targeting',
  'anchor_event_attribution_setting',
  'anchor_events_performance_indicator',
  'attribution_setting',
  'buying_type',
  'campaign_id',
  'campaign_name',
  'conversion_rate_ranking',
  'created_time',
  'creative_diversity_label',
  'creative_media_type',
  'date_start',
  'date_stop',
  'engagement_rate_ranking',
  'gender_targeting',
  'labels',
  'location',
  'marketing_messages_spend_currency',
  'multi_event_conversion_attribution_setting',
  'objective',
  'optimization_goal',
  'place_page_name',
  'product_group_retailer_id',
  'product_retailer_id',
  'quality_ranking',
  'result_values_performance_indicator',
  'updated_time',
]);
const title = (field) => field.replaceAll('_', ' ').replace(/^./, (s) => s.toUpperCase());
function scalarType(field) {
  if (textFields.has(field)) return 'text';
  if (/cost|spend|^cp[cpm]$|budget|bid$|_values?$/.test(field)) return 'money';
  if (/roas/.test(field)) return 'ratio';
  if (/ctr|rate|percent/.test(field)) return 'percent';
  return 'number';
}
function group(field) {
  if (textFields.has(field)) return 'Meta · Thông tin';
  if (/video|thruplay|canvas|playable/.test(field)) return 'Meta · Video';
  if (/messag|instagram/.test(field)) return 'Meta · Tin nhắn & Instagram';
  if (/catalog|product|shop/.test(field)) return 'Meta · Danh mục & cửa hàng';
  if (/action|conversion|purchase|roas|result|lead/.test(field))
    return 'Meta · Hành động & chuyển đổi';
  if (/click|ctr|engagement/.test(field)) return 'Meta · Nhấp & tương tác';
  if (/reach|impression|spend|frequency|recall|^cp/.test(field))
    return 'Meta · Phân phối & chi phí';
  return 'Meta · Chỉ số chuyên biệt';
}
export function metaColumn(key) {
  if (typeof key !== 'string' || key.length > 260) return null;
  const [prefix, field, action, ...rest] = key.split(':');
  if (prefix !== 'meta' || !Object.hasOwn(META_INSIGHT_FIELDS, field) || rest.length) return null;
  if (
    action !== undefined &&
    (!META_INSIGHT_FIELDS[field].includes('AdsActionStats') ||
      !/^[a-zA-Z0-9_.-]{1,180}$/.test(action))
  )
    return null;
  const baseName = names[field] || title(field);
  const type = action
    ? scalarType(field)
    : META_INSIGHT_FIELDS[field].startsWith('list<')
      ? 'json'
      : scalarType(field);
  return {
    key,
    field,
    action,
    type,
    source: 'meta',
    name: action
      ? `${baseName} · ${ACTION_NAMES[action] || action}`
      : `${baseName}${type === 'json' ? ' (chi tiết)' : ''}`,
    group: action && commonFamilies.includes(field) ? 'Meta · Sự kiện riêng' : group(field),
  };
}
export const ACTION_NAMES = {
  purchase: 'Mua hàng (tổng)',
  omni_purchase: 'Mua hàng đa kênh',
  lead: 'Khách hàng tiềm năng',
  link_click: 'Nhấp liên kết',
  landing_page_view: 'Xem trang đích',
  post_engagement: 'Tương tác bài viết',
  page_engagement: 'Tương tác trang',
  post_reaction: 'Cảm xúc bài viết',
  comment: 'Bình luận',
  post: 'Chia sẻ bài viết',
  like: 'Thích trang',
  video_view: 'Lượt xem video',
  'offsite_conversion.fb_pixel_view_content': 'Website · Xem nội dung',
  'offsite_conversion.fb_pixel_add_to_cart': 'Website · Thêm vào giỏ',
  'offsite_conversion.fb_pixel_initiate_checkout': 'Website · Bắt đầu thanh toán',
  'offsite_conversion.fb_pixel_add_payment_info': 'Website · Thêm thông tin thanh toán',
  'offsite_conversion.fb_pixel_purchase': 'Website · Mua hàng',
  'offsite_conversion.fb_pixel_lead': 'Website · Lead',
  'offsite_conversion.fb_pixel_complete_registration': 'Website · Hoàn tất đăng ký',
  'offsite_conversion.fb_pixel_search': 'Website · Tìm kiếm',
  'offsite_conversion.fb_pixel_add_to_wishlist': 'Website · Thêm yêu thích',
  'onsite_conversion.lead_grouped': 'Lead trên Meta',
  'onsite_conversion.messaging_conversation_started_7d': 'Bắt đầu cuộc trò chuyện',
  'onsite_conversion.messaging_first_reply': 'Phản hồi tin nhắn đầu tiên',
  'onsite_conversion.total_messaging_connection': 'Kết nối nhắn tin',
  mobile_app_install: 'Cài đặt ứng dụng',
  'app_custom_event.fb_mobile_purchase': 'Mua hàng trong ứng dụng',
};
const commonFamilies = [
  'actions',
  'action_values',
  'cost_per_action_type',
  'unique_actions',
  'cost_per_unique_action_type',
];
const singleAction = {
  outbound_clicks: 'outbound_click',
  outbound_clicks_ctr: 'outbound_click',
  cost_per_outbound_click: 'outbound_click',
  unique_outbound_clicks: 'outbound_click',
  unique_outbound_clicks_ctr: 'outbound_click',
  cost_per_unique_outbound_click: 'outbound_click',
  purchase_roas: 'omni_purchase',
  website_purchase_roas: 'offsite_conversion.fb_pixel_purchase',
  mobile_app_purchase_roas: 'app_custom_event.fb_mobile_purchase',
};
for (const field of Object.keys(META_INSIGHT_FIELDS))
  if (
    /^video_.*_actions$|^cost_per_.*video_view$|^cost_per_thruplay$/.test(field) &&
    META_INSIGHT_FIELDS[field].includes('AdsActionStats')
  )
    singleAction[field] = 'video_view';
export const META_BASE_COLUMNS = Object.keys(META_INSIGHT_FIELDS).map((field) =>
  metaColumn(`meta:${field}`),
);
export const META_EVENT_COLUMNS = [
  ...commonFamilies.flatMap((field) =>
    Object.keys(ACTION_NAMES).map((action) => metaColumn(`meta:${field}:${action}`)),
  ),
  ...Object.entries(singleAction).map(([field, action]) => metaColumn(`meta:${field}:${action}`)),
];
export function metaCatalog(discovered = []) {
  return [
    ...new Map(
      [
        ...META_BASE_COLUMNS,
        ...META_EVENT_COLUMNS,
        ...discovered.map(metaColumn).filter(Boolean),
      ].map((c) => [c.key, c]),
    ).values(),
  ];
}
export function requiredMetaFields(config) {
  const needed = [...config.selected_columns];
  for (const metric of config.custom_metrics)
    if (needed.includes(metric.id)) {
      needed.push(metric.left);
      if (metric.rightType === 'metric') needed.push(metric.right);
    }
  return [
    ...new Set(
      needed
        .map(metaColumn)
        .filter(Boolean)
        .map((c) => c.field),
    ),
  ].sort();
}
export function metaMetricValue(raw, column) {
  const value = raw?.[column.field];
  if (column.action) {
    if (!Array.isArray(value)) return null;
    const item = value.find((entry) => entry.action_type === column.action);
    if (!item || item.value == null || String(item.value).trim() === '') return null;
    const number = Number(item.value);
    return Number.isFinite(number) ? number : null;
  }
  if (value == null || value === '') return null;
  if (column.type === 'json') return typeof value === 'object' ? value : null;
  if (column.type === 'text') return typeof value === 'string' ? value : String(value);
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}
