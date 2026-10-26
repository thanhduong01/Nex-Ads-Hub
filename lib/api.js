export async function api(url, { timeoutMs = 30000, ...options } = {}, fetcher = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'Yêu cầu thất bại.');
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (controller.signal.aborted)
      throw Object.assign(
        new Error('Yêu cầu mất quá lâu. Tải lại dữ liệu để kiểm tra kết quả trước khi thử lại.'),
        { code: 'REQUEST_TIMEOUT' },
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
