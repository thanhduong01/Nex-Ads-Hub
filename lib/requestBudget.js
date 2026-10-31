import { AsyncLocalStorage } from 'node:async_hooks';
const context = new AsyncLocalStorage();
export const withDatabaseDeadline = (deadline, task) => context.run(deadline, task);
export function databaseFetch(url, options = {}) {
  const remaining = (context.getStore() ?? Infinity) - Date.now();
  if (remaining <= 0)
    return Promise.reject(
      Object.assign(new Error('Hết thời gian xử lý dữ liệu. Các phần đã hoàn tất được giữ lại.'), {
        name: 'TimeoutError',
      }),
    );
  const signal = AbortSignal.timeout(Math.max(1, Math.min(12000, remaining)));
  return fetch(url, {
    ...options,
    signal: options.signal ? AbortSignal.any([options.signal, signal]) : signal,
  });
}
