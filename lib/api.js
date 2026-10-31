export async function api(
  url,
  { timeoutMs = 30000, signal: externalSignal, ...options } = {},
  fetcher = fetch,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const cancel = () => controller.abort(externalSignal.reason);
  externalSignal?.addEventListener('abort', cancel, { once: true });
  if (externalSignal?.aborted) cancel();
  let abortListener;
  const aborted = new Promise((_, reject) => {
    abortListener = () =>
      reject(
        Object.assign(
          new Error(
            externalSignal?.aborted
              ? 'Đã dừng yêu cầu.'
              : 'Yêu cầu mất quá lâu. Tải lại dữ liệu để kiểm tra kết quả trước khi thử lại.',
          ),
          { code: externalSignal?.aborted ? 'REQUEST_CANCELLED' : 'REQUEST_TIMEOUT' },
        ),
      );
    if (controller.signal.aborted) abortListener();
    else controller.signal.addEventListener('abort', abortListener, { once: true });
  });
  try {
    return await Promise.race([
      aborted,
      (async () => {
        const response = await fetcher(url, {
          ...options,
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', ...options.headers },
        });
        let data;
        try {
          data = await response.json();
        } catch {
          throw Object.assign(
            new Error(
              `Máy chủ trả phản hồi không hợp lệ (${response.status || 'lỗi kết nối'}). Vui lòng thử lại.`,
            ),
            { status: response.status },
          );
        }
        if (!response.ok) {
          const error = new Error(data.error || 'Yêu cầu thất bại.');
          error.status = response.status;
          throw error;
        }
        return data;
      })(),
    ]);
  } catch (error) {
    if (externalSignal?.aborted)
      throw Object.assign(new Error('Đã dừng yêu cầu.'), { code: 'REQUEST_CANCELLED' });
    if (controller.signal.aborted)
      throw Object.assign(
        new Error('Yêu cầu mất quá lâu. Tải lại dữ liệu để kiểm tra kết quả trước khi thử lại.'),
        { code: 'REQUEST_TIMEOUT' },
      );
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', abortListener);
  }
}
