import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { excelReport, pdfReport, fileName } from '../lib/exports.js';
import { makeReport, DEFAULT_CONFIG } from '../lib/metrics.js';
const config = {
  ...DEFAULT_CONFIG,
  custom_names: { spend: 'Chi phí QC' },
  custom_metrics: [
    {
      id: 'custom_roas',
      name: 'ROAS thực',
      left: 'purchase_value',
      operator: '/',
      rightType: 'metric',
      right: 'spend',
      type: 'ratio',
    },
  ],
};
const report = makeReport(
  [{ date: '2026-10-01', spend: 123000, purchase_value: 369000, 'actions:purchase': 3 }],
  '2026-10',
  config,
  '2026-10-25',
);
test('Excel roundtrip preserves Vietnamese custom labels, totals, numeric currency formatting', async () => {
  const wb = await excelReport({ client: 'Lá Natural', month: '2026-10', report }, false);
  const binary = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const parsed = XLSX.read(binary, { type: 'buffer', cellNF: true });
  const sheet = parsed.Sheets['Báo cáo tháng'];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  assert.equal(rows[3][1], 'Chi phí QC');
  assert.equal(rows[3].at(-1), 'ROAS thực');
  assert.equal(rows[4].at(-1), 3);
  assert.equal(rows[35][1], 123000);
  assert(sheet.B5.z.includes('VND'));
  assert.equal(sheet.B5.t, 'n');
});
test('PDF generates embedded Vietnamese font and paginated table', async () => {
  const font = (
    await readFile(new URL('../public/fonts/NotoSans-Regular.ttf', import.meta.url))
  ).toString('base64');
  const doc = await pdfReport({ client: 'Lá Natural', month: '2026-10', report }, false, font);
  const buffer = Buffer.from(doc.output('arraybuffer'));
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  assert(buffer.toString('latin1').includes('/FontFile2'));
  assert(doc.internal.getNumberOfPages() >= 2);
});
test('export file names sanitize separators without dropping Vietnamese', () =>
  assert.equal(fileName('Lá / Natural', '2026-10', 'pdf'), 'BaoCao_Lá___Natural_2026-10.pdf'));
