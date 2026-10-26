import { format } from './metrics.js';
export function fileName(client, month, extension) {
  return `BaoCao_${client.normalize('NFC').replace(/[^\p{L}\p{N}_-]/gu, '_')}_${month}.${extension}`;
}
export async function excelReport({ client, month, report, currency = 'VND' }, download = true) {
  const XLSX = await import('xlsx');
  const columns = report.columns;
  const content = [
    [`BÁO CÁO QUẢNG CÁO • ${client}`],
    [`Tháng ${month} · ${currency}`],
    [],
    ['Ngày', ...columns.map((c) => c.name)],
    ...report.rows.map((r) => [
      r.date,
      ...columns.map((c) => (r.future ? null : (r[c.key] ?? null))),
    ]),
    ['Tổng', ...columns.map((c) => report.total[c.key] ?? null)],
    [],
    ['* Tiếp cận cộng dồn không phải số người duy nhất trong cả tháng.'],
    ['Tự động tạo bởi Ads Hub'],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(content);
  sheet['!cols'] = [{ wch: 15 }, ...columns.map((c) => ({ wch: Math.max(18, c.name.length + 3) }))];
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columns.length } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columns.length } },
  ];
  for (let r = 4; r <= 4 + report.rows.length; r++)
    for (let c = 1; c <= columns.length; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.t !== 'n') continue;
      const type = columns[c - 1].type;
      cell.z =
        type === 'money'
          ? `#,##0${currency === 'VND' ? '' : '.00'} "${currency}"`
          : type === 'percent'
            ? '0.00"%"'
            : type === 'ratio'
              ? '0.00"x"'
              : '#,##0.##';
    }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Báo cáo tháng');
  if (download) XLSX.writeFile(workbook, fileName(client, month, 'xlsx'));
  return workbook;
}
export async function pdfReport(
  { client, month, report, currency = 'VND' },
  download = true,
  fontOverride,
) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: report.columns.length > 8 ? 'a3' : 'a4',
  });
  let font = fontOverride;
  if (!font) {
    const response = await fetch('/fonts/NotoSans-Regular.ttf');
    if (!response.ok) throw new Error('Không tải được phông chữ PDF.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    font = btoa(binary);
  }
  doc.addFileToVFS('NotoSans.ttf', font);
  doc.addFont('NotoSans.ttf', 'NotoSans', 'normal');
  doc.setFont('NotoSans');
  doc.setTextColor(24, 31, 46);
  doc.setFontSize(20);
  const titleLines = doc.splitTextToSize(
    `Báo cáo quảng cáo · ${client}`,
    doc.internal.pageSize.getWidth() - 28,
  );
  doc.text(titleLines, 14, 20);
  const subtitleY = 29 + (titleLines.length - 1) * 8;
  doc.setFontSize(10);
  doc.text(`Tháng ${month} | Đơn vị: ${currency}`, 14, subtitleY);
  autoTable(doc, {
    showFoot: 'lastPage',
    startY: subtitleY + 7,
    head: [['Ngày', ...report.columns.map((c) => c.name)]],
    body: report.rows.map((r) => [
      r.date,
      ...report.columns.map((c) => (r.future ? '—' : format(r[c.key], c.type, currency))),
    ]),
    foot: [['Tổng', ...report.columns.map((c) => format(report.total[c.key], c.type, currency))]],
    styles: {
      font: 'NotoSans',
      fontStyle: 'normal',
      fontSize: report.columns.length > 8 ? 7 : 8,
      cellPadding: 3,
    },
    headStyles: { fillColor: [39, 60, 88], fontStyle: 'normal' },
    footStyles: { fillColor: [233, 239, 247], textColor: [25, 39, 56], fontStyle: 'normal' },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    margin: { bottom: 20 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.text(
        'Tự động tạo bởi Ads Hub · * Tiếp cận là cộng dồn, không khử trùng lặp.',
        14,
        h - 10,
      );
      doc.text(
        `Trang ${doc.internal.getNumberOfPages()}`,
        doc.internal.pageSize.getWidth() - 30,
        h - 10,
      );
    },
  });
  if (download) doc.save(fileName(client, month, 'pdf'));
  return doc;
}
