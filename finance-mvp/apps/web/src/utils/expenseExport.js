/**
 * Expense report exports — one data model, four renderers (CSV, Excel, PDF, executive
 * summary). Every renderer returns a { blob, filename } pair so the SAME bytes can be both
 * downloaded and uploaded into the business's Documents.
 *
 * jspdf / jspdf-autotable / xlsx are `import()`-ed lazily inside the renderers, so they are
 * code-split into their own chunk and never load unless the user actually exports.
 */

const BRAND = { forest: '#1A4D3B', gold: '#C9973A', muted: '#6B7280' };

const money = (n) => {
  const v = Number(n) || 0;
  return `${v < 0 ? '-$' : '$'}${Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
};

const today = () => new Date().toISOString().slice(0, 10);

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Normalizes what the UI holds into the shape every renderer consumes.
 *
 * @param {object} o
 * @param {Array}  o.expenses    expense DTOs (already filtered to the export range)
 * @param {object} o.summary     ExpenseSummaryDto for the same range
 * @param {string} o.scopeLabel  e.g. "Acme LLC" or "All businesses"
 * @param {string} o.from,o.to   ISO dates (optional)
 * @param {Map}    o.businessNames  id -> name, used to group the consolidated export
 */
export function buildReportModel({ expenses = [], summary = null, scopeLabel = 'Business', from, to, businessNames = new Map() }) {
  const rows = expenses.map((e) => ({
    business: businessNames.get(e.businessId) || '',
    date: e.expenseDate || '',
    category: e.category || 'Uncategorized',
    vendor: e.vendor || '',
    description: e.description || '',
    mode: e.sourceMode === 'LINKED' ? 'Linked' : 'Standalone',
    linkCount: e.linkCount || 0,
    status: e.status || '',
    paymentMethod: e.paymentMethod || '',
    receipt: e.receiptDocumentId ? 'Yes' : 'No',
    amount: Number(e.effectiveAmount ?? e.amount ?? 0),
    notes: e.notes || '',
  }));

  const s = summary || {};
  const period = from && to ? `${from} → ${to}` : 'All time';
  return {
    scopeLabel,
    period,
    generated: today(),
    rows,
    totals: {
      total: Number(s.total ?? rows.reduce((a, r) => a + r.amount, 0)),
      standalone: Number(s.standaloneTotal ?? 0),
      linked: Number(s.linkedTotal ?? 0),
      count: s.count ?? rows.length,
      missingReceipts: s.missingReceiptCount ?? rows.filter((r) => r.receipt === 'No').length,
      uncategorized: s.uncategorizedCount ?? 0,
    },
    byCategory: s.byCategory || [],
    byVendor: s.byVendor || [],
    byMonth: s.byMonth || [],
    byBusiness: s.byBusiness || [],
    isConsolidated: !!(s.byBusiness && s.byBusiness.length),
  };
}

const fileBase = (m) =>
  `${m.scopeLabel.replace(/[^\w\s-]/g, '').trim() || 'Business'} - Expenses ${m.period === 'All time' ? 'all-time' : m.period.replace(/[^\d-]/g, '_')}`;

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */
export function buildCsv(m) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [];
  lines.push([`Expense Report`].map(esc).join(','));
  lines.push([m.scopeLabel, m.period, `Generated ${m.generated}`].map(esc).join(','));
  lines.push('');

  const header = m.isConsolidated
    ? ['Business', 'Date', 'Category', 'Vendor', 'Description', 'Type', 'Linked txns', 'Status', 'Payment method', 'Receipt', 'Amount', 'Notes']
    : ['Date', 'Category', 'Vendor', 'Description', 'Type', 'Linked txns', 'Status', 'Payment method', 'Receipt', 'Amount', 'Notes'];
  lines.push(header.map(esc).join(','));

  m.rows.forEach((r) => {
    const base = [r.date, r.category, r.vendor, r.description, r.mode, r.linkCount, r.status, r.paymentMethod, r.receipt, r.amount, r.notes];
    lines.push((m.isConsolidated ? [r.business, ...base] : base).map(esc).join(','));
  });

  lines.push('');
  lines.push(['Total', m.totals.total].map(esc).join(','));
  lines.push(['  of which standalone (new spend)', m.totals.standalone].map(esc).join(','));
  lines.push(['  of which linked (documents ledger spend)', m.totals.linked].map(esc).join(','));
  lines.push(['Expenses', m.totals.count].map(esc).join(','));
  lines.push(['Missing receipts', m.totals.missingReceipts].map(esc).join(','));
  lines.push('');
  lines.push(['By category', 'Total', 'Count'].map(esc).join(','));
  m.byCategory.forEach((b) => lines.push([b.label, b.total, b.count].map(esc).join(',')));
  if (m.isConsolidated) {
    lines.push('');
    lines.push(['By business', 'Total', 'Count'].map(esc).join(','));
    m.byBusiness.forEach((b) => lines.push([b.label, b.total, b.count].map(esc).join(',')));
  }

  return {
    blob: new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }),
    filename: `${fileBase(m)}.csv`,
  };
}

/* ------------------------------------------------------------------ */
/* Excel (.xlsx) — multi-sheet                                         */
/* ------------------------------------------------------------------ */
export async function buildXlsx(m) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const detail = m.rows.map((r) => {
    const base = {
      Date: r.date, Category: r.category, Vendor: r.vendor, Description: r.description,
      Type: r.mode, 'Linked txns': r.linkCount, Status: r.status,
      'Payment method': r.paymentMethod, Receipt: r.receipt, Amount: r.amount, Notes: r.notes,
    };
    return m.isConsolidated ? { Business: r.business, ...base } : base;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail.length ? detail : [{}]), 'Expenses');

  const summaryRows = [
    { Metric: 'Scope', Value: m.scopeLabel },
    { Metric: 'Period', Value: m.period },
    { Metric: 'Generated', Value: m.generated },
    { Metric: 'Total', Value: m.totals.total },
    { Metric: 'Standalone (new spend)', Value: m.totals.standalone },
    { Metric: 'Linked (documents ledger spend)', Value: m.totals.linked },
    { Metric: 'Expenses', Value: m.totals.count },
    { Metric: 'Missing receipts', Value: m.totals.missingReceipts },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');

  const cat = m.byCategory.map((b) => ({ Category: b.label, Total: b.total, Count: b.count }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cat.length ? cat : [{}]), 'By category');

  const ven = m.byVendor.map((b) => ({ Vendor: b.label, Total: b.total, Count: b.count }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ven.length ? ven : [{}]), 'By vendor');

  if (m.isConsolidated) {
    const biz = m.byBusiness.map((b) => ({ Business: b.label, Total: b.total, Count: b.count }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(biz), 'By business');
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return {
    blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename: `${fileBase(m)}.xlsx`,
  };
}

/* ------------------------------------------------------------------ */
/* PDF — full detail table                                             */
/* ------------------------------------------------------------------ */
async function newPdf() {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  return { doc: new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }), autoTable };
}

function pdfHeader(doc, m, subtitle) {
  doc.setFillColor(BRAND.forest);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 56, 'F');
  doc.setTextColor('#FFFFFF');
  doc.setFontSize(16);
  doc.text(subtitle, 40, 26);
  doc.setFontSize(9);
  doc.text(`${m.scopeLabel}  ·  ${m.period}  ·  generated ${m.generated}`, 40, 42);
  doc.setTextColor('#111827');
}

export async function buildPdf(m) {
  const { doc, autoTable } = await newPdf();
  pdfHeader(doc, m, 'Expense Report');

  const head = m.isConsolidated
    ? [['Business', 'Date', 'Category', 'Vendor', 'Description', 'Type', 'Status', 'Receipt', 'Amount']]
    : [['Date', 'Category', 'Vendor', 'Description', 'Type', 'Status', 'Receipt', 'Amount']];
  const body = m.rows.map((r) => {
    const base = [r.date, r.category, r.vendor, r.description, r.mode, r.status, r.receipt, money(r.amount)];
    return m.isConsolidated ? [r.business, ...base] : base;
  });

  autoTable(doc, {
    head, body, startY: 74, styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: BRAND.forest, textColor: '#FFFFFF', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: '#F4F6F5' },
    columnStyles: { [head[0].length - 1]: { halign: 'right' } },
    // Flag rows with no receipt in amber so the reader can chase documentation.
    didParseCell: (d) => {
      if (d.section === 'body') {
        const receiptIdx = head[0].length - 2;
        if (d.column.index === receiptIdx && d.cell.raw === 'No') {
          d.cell.styles.textColor = BRAND.gold;
          d.cell.styles.fontStyle = 'bold';
        }
      }
    },
    foot: [[...Array(head[0].length - 2).fill(''), 'Total', money(m.totals.total)]],
    footStyles: { fillColor: '#E8EFEA', textColor: '#111827', fontStyle: 'bold', halign: 'right' },
  });

  let y = doc.lastAutoTable.finalY + 20;
  doc.setFontSize(9);
  doc.setTextColor(BRAND.muted);
  doc.text(
    `Standalone (new spend): ${money(m.totals.standalone)}   ·   Linked (documents existing ledger spend): ${money(m.totals.linked)}   ·   Missing receipts: ${m.totals.missingReceipts}`,
    40, y
  );

  return { blob: doc.output('blob'), filename: `${fileBase(m)}.pdf` };
}

/* ------------------------------------------------------------------ */
/* Executive summary — one polished, client-facing page                */
/* ------------------------------------------------------------------ */
export async function buildExecutiveSummary(m) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  pdfHeader(doc, m, 'Expense Summary');

  // KPI strip
  const kpis = [
    ['Total spend', money(m.totals.total)],
    ['Expenses', String(m.totals.count)],
    ['Missing receipts', String(m.totals.missingReceipts)],
  ];
  let x = 40;
  kpis.forEach(([label, value]) => {
    doc.setDrawColor('#DDE5E1'); doc.setFillColor('#FFFFFF');
    doc.roundedRect(x, 76, 158, 56, 6, 6, 'FD');
    doc.setFontSize(8); doc.setTextColor(BRAND.muted); doc.text(label.toUpperCase(), x + 12, 96);
    doc.setFontSize(15); doc.setTextColor('#111827'); doc.text(value, x + 12, 118);
    x += 168;
  });

  // Reconciliation note — the single most important thing for a reader comparing to P&L.
  doc.setFontSize(8.5); doc.setTextColor(BRAND.muted);
  doc.text(
    `${money(m.totals.standalone)} is spend recorded here only; ${money(m.totals.linked)} documents transactions already in the ledger (not additional spend).`,
    40, 150
  );

  const section = (title, rows, startY) => {
    autoTable(doc, {
      head: [[title, 'Total', 'Count']],
      body: rows.length ? rows.map((b) => [b.label, money(b.total), String(b.count)]) : [['No activity', '—', '0']],
      startY,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: BRAND.forest, textColor: '#FFFFFF' },
      alternateRowStyles: { fillColor: '#F4F6F5' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', cellWidth: 50 } },
      margin: { left: 40, right: 40 },
    });
    return doc.lastAutoTable.finalY + 16;
  };

  let y = 166;
  y = section('Spend by category', m.byCategory.slice(0, 10), y);
  y = section('Top vendors', m.byVendor.slice(0, 10), y);
  if (m.isConsolidated) y = section('By business', m.byBusiness, y);
  if (m.byMonth.length) section('Monthly trend', m.byMonth, y);

  doc.setFontSize(8); doc.setTextColor(BRAND.muted);
  doc.text(
    `${m.scopeLabel} · ${m.period} · generated ${m.generated}`,
    40, doc.internal.pageSize.getHeight() - 24
  );

  return { blob: doc.output('blob'), filename: `${fileBase(m)} - executive summary.pdf` };
}

/* ------------------------------------------------------------------ */
/* Dispatch + download                                                 */
/* ------------------------------------------------------------------ */
export async function buildExport(format, model) {
  switch (format) {
    case 'csv': return buildCsv(model);
    case 'xlsx': return buildXlsx(model);
    case 'pdf': return buildPdf(model);
    case 'summary': return buildExecutiveSummary(model);
    default: throw new Error(`Unknown export format: ${format}`);
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export { escapeHtml, money };
