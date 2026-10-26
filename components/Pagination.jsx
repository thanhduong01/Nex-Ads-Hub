import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZES, pageNumbers, paginateRows } from '../lib/pagination.js';

export function usePagination(rows, resetKey) {
  const [state, setState] = useState({ page: 1, pageSize: 20, resetKey });
  const pagination = paginateRows(
    rows,
    state.resetKey === resetKey ? state.page : 1,
    state.pageSize,
  );
  useEffect(() => {
    setState((current) =>
      current.resetKey === resetKey && current.page === pagination.page
        ? current
        : { ...current, resetKey, page: pagination.page },
    );
  }, [resetKey, pagination.page]);
  return {
    ...pagination,
    onPageChange: (page) => setState({ page, pageSize: pagination.pageSize, resetKey }),
    onPageSizeChange: (pageSize) => setState({ page: 1, pageSize, resetKey }),
  };
}

export default function Pagination({ pagination, tableId, label }) {
  const { page, pageSize, pageCount, total, from, to, onPageChange, onPageSizeChange } = pagination;
  const number = (value) => value.toLocaleString('vi-VN');
  return (
    <div className="table-pagination">
      <div className="pagination-details">
        <label className="pagination-size">
          Dòng / trang
          <select
            aria-label={`Số dòng mỗi trang — ${label}`}
            aria-controls={tableId}
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <span role="status" aria-live="polite" aria-atomic="true">
          {number(from)}–{number(to)} / {number(total)} dòng
        </span>
      </div>
      <nav className="pagination-pages" aria-label={`Phân trang ${label}`}>
        <button
          type="button"
          aria-label="Trang trước"
          aria-controls={tableId}
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        {pageNumbers(page, pageCount).map((value, index) =>
          value === null ? (
            <span className="pagination-gap" aria-hidden="true" key={`gap-${index}`}>
              …
            </span>
          ) : (
            <button
              type="button"
              key={value}
              aria-label={`Trang ${number(value)}`}
              aria-current={page === value ? 'page' : undefined}
              aria-controls={tableId}
              disabled={!total}
              onClick={() => onPageChange(value)}
            >
              {number(value)}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Trang sau"
          aria-controls={tableId}
          disabled={page === pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </nav>
    </div>
  );
}
