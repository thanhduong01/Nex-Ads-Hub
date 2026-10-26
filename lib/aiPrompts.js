export const META_AI_PORTAL = 'https://dev.meta.ai/';
export const PROMPT_VARIABLES = {
  since: 'Ngày bắt đầu',
  until: 'Ngày kết thúc',
  target_cpa: 'CPA mục tiêu',
  campaign_count: 'Số chiến dịch trong bộ lọc',
  account_count: 'Số tài khoản',
  currency: 'Tiền tệ',
};
export const DEFAULT_AI_PROMPTS = [
  {
    id: 'default-optimization',
    name: 'Tối ưu hiệu quả quảng cáo',
    content: `Phân tích các chiến dịch Facebook Ads từ {{since}} đến {{until}}, CPA mục tiêu {{target_cpa}} {{currency}}.
Trả lời bằng tiếng Việt. Ưu tiên khả năng sinh lời, không chỉ doanh thu.
1. Tóm tắt hiệu suất và so sánh kỳ trước.
2. Chỉ rõ chiến dịch cần giữ, tăng, giảm ngân sách hoặc kiểm tra thêm. Nêu ID, tên và các số liệu làm căn cứ.
3. Đề xuất thứ tự hành động trong 3 ngày tới, điều kiện áp dụng và cách đo kết quả.
4. Nêu dữ liệu còn thiếu và những kết luận chưa đủ căn cứ.
Không đề xuất tăng ngân sách chỉ vì ROAS cao khi số đơn hoặc chi tiêu quá ít.`,
  },
  {
    id: 'default-creative',
    name: 'Phát hiện giảm hiệu quả và ý tưởng thử nghiệm',
    content: `Phân tích xu hướng theo ngày từ {{since}} đến {{until}} trên {{campaign_count}} chiến dịch.
Tìm dấu hiệu CTR giảm, CPA tăng, ROAS suy giảm và phân biệt biến động ngắn hạn với xu hướng có đủ dữ liệu.
Với mỗi vấn đề, nêu chiến dịch, số liệu, giả thuyết nguyên nhân và một thử nghiệm cụ thể về nội dung hoặc phân bổ ngân sách. Đặt tiêu chí thành công và điều kiện dừng. Trả lời bằng tiếng Việt, không khẳng định nguyên nhân khi chưa có dữ liệu.`,
  },
];
export function validatePrompt(input) {
  const invalid = (message) => {
    throw Object.assign(new Error(message), { status: 400 });
  };
  if (typeof input?.name !== 'string' || !input.name.trim() || input.name.length > 100)
    invalid('Tên prompt cần có 1–100 ký tự.');
  if (
    typeof input?.content !== 'string' ||
    input.content.trim().length < 20 ||
    input.content.length > 20000
  )
    invalid('Nội dung prompt cần có 20–20.000 ký tự.');
  for (const match of input.content.matchAll(/\{\{([^{}]+)\}\}/g))
    if (!Object.hasOwn(PROMPT_VARIABLES, match[1].trim()))
      invalid(`Biến prompt chưa hỗ trợ: ${match[0]}`);
  return { name: input.name.trim(), content: input.content.trim() };
}
export function compilePrompt(content, variables) {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) =>
    Object.hasOwn(variables, key) ? String(variables[key]) : match,
  );
}
