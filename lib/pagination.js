export const PAGE_SIZES = [20, 50, 100];

export function paginateRows(rows, requestedPage = 1, requestedSize = 20) {
  const pageSize = PAGE_SIZES.includes(Number(requestedSize)) ? Number(requestedSize) : 20;
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.trunc(Number(requestedPage)) || 1));
  const offset = (page - 1) * pageSize;
  return {
    items: rows.slice(offset, offset + pageSize),
    page,
    pageSize,
    pageCount,
    total,
    from: total ? offset + 1 : 0,
    to: Math.min(offset + pageSize, total),
  };
}

export function pageNumbers(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, null, pageCount];
  if (page >= pageCount - 3)
    return [1, null, pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  return [1, null, page - 1, page, page + 1, null, pageCount];
}
