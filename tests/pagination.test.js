import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_SIZES, paginateRows, pageNumbers } from '../lib/pagination.js';
import { makeReport, DEFAULT_CONFIG } from '../lib/metrics.js';
import { excelReport } from '../lib/exports.js';
import * as XLSX from 'xlsx';

test('all page sizes cover the filtered, sorted rows exactly once without changing their order', () => {
  const source = Array.from({ length: 237 }, (_, id) => ({ id }));
  const filtered = source.filter(({ id }) => id % 3 !== 0).reverse();
  const original = structuredClone(filtered);
  assert.equal(paginateRows(filtered).items.length, 20);
  for (const size of PAGE_SIZES) {
    const first = paginateRows(filtered, 1, size);
    const pages = Array.from({ length: first.pageCount }, (_, index) =>
      paginateRows(filtered, index + 1, size),
    );
    assert.deepEqual(
      pages.flatMap(({ items }) => items),
      filtered,
    );
    assert(pages.every(({ items }) => items.length <= size));
    assert.equal(pages.at(-1).to, filtered.length);
    assert.equal(pages[1].from, size + 1);
  }
  assert.deepEqual(filtered, original);
});

test('data removal clamps the current page and empty tables report a zero range', () => {
  const rows = Array.from({ length: 40 }, (_, id) => ({ id }));
  assert.equal(paginateRows(rows, 3).page, 2);
  assert.deepEqual(paginateRows(rows.slice(0, 1), 2).items, [rows[0]]);
  const empty = paginateRows([], 5, 100);
  assert.equal(empty.page, 1);
  assert.equal(empty.pageCount, 1);
  assert.equal(empty.from, 0);
  assert.equal(empty.to, 0);
  assert.deepEqual(empty.items, []);
});

test('large tables keep current, neighboring, first and last pages reachable with bounded controls', () => {
  for (const count of [1, 7, 8, 250]) {
    for (let page = 1; page <= count; page++) {
      const controls = pageNumbers(page, count);
      const numbers = controls.filter((value) => value !== null);
      assert(controls.length <= 7);
      assert(numbers.includes(1) && numbers.includes(count) && numbers.includes(page));
      if (page > 1) assert(numbers.includes(page - 1));
      if (page < count) assert(numbers.includes(page + 1));
      assert.deepEqual(
        numbers,
        [...new Set(numbers)].sort((a, b) => a - b),
      );
    }
  }
});

test('paging a monthly report preserves the full-month total and all exported days', async () => {
  const report = makeReport(
    Array.from({ length: 31 }, (_, index) => ({
      date: `2026-10-${String(index + 1).padStart(2, '0')}`,
      spend: 100,
    })),
    '2026-10',
    DEFAULT_CONFIG,
    '2026-11-01',
  );
  const sorted = [...report.rows].reverse();
  assert.equal(paginateRows(sorted).items.length, 20);
  assert.equal(paginateRows(sorted, 2).items.length, 11);
  assert.equal(paginateRows(sorted, 1, 50).items.length, 31);
  assert.equal(report.total.spend, 3100);
  const workbook = await excelReport(
    { client: 'Paging test', month: '2026-10', report: { ...report, rows: sorted } },
    false,
  );
  const content = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
  const exportedDays = content.filter((row) => /^2026-10-\d{2}$/.test(row[0]));
  assert.deepEqual(
    exportedDays.map((row) => row[0]),
    sorted.map((row) => row.date),
  );
  const total = content.find((row) => row[0] === 'Tổng');
  assert.equal(total[report.columns.findIndex((column) => column.key === 'spend') + 1], 3100);
});
