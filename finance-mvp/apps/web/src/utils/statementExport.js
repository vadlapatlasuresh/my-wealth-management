/*
 * Export the GL financial statements (P&L, Balance Sheet, Cash Flow) to Excel or PDF (GL.3).
 * jspdf / jspdf-autotable / xlsx are import()-ed lazily so they stay out of the main bundle.
 */
import { downloadBlob } from './expenseExport';

const money = (n) => (n == null ? '' : Number(n).toLocaleString(undefined, { style: 'currency', currency: 'USD' }));

/* ---- flat row builders shared by both formats ---- */

function pnlRows(p) {
  if (!p) return [];
  const rows = [['Income', '']];
  (p.income || []).forEach((r) => rows.push([`  ${r.code} ${r.name}`, Number(r.amount)]));
  rows.push(['Total income', Number(p.totalIncome)]);
  rows.push(['Expenses', '']);
  (p.expenses || []).forEach((r) => rows.push([`  ${r.code} ${r.name}`, Number(r.amount)]));
  rows.push(['Total expenses', Number(p.totalExpense)]);
  rows.push(['Net profit', Number(p.netProfit)]);
  return rows;
}

function balanceRows(b) {
  if (!b) return [];
  const rows = [['Assets', '']];
  (b.assets || []).forEach((r) => rows.push([`  ${r.code} ${r.name}`, Number(r.amount)]));
  rows.push(['Total assets', Number(b.totalAssets)]);
  rows.push(['Liabilities', '']);
  (b.liabilities || []).forEach((r) => rows.push([`  ${r.code} ${r.name}`, Number(r.amount)]));
  rows.push(['Total liabilities', Number(b.totalLiabilities)]);
  rows.push(['Equity', '']);
  (b.equity || []).forEach((r) => rows.push([`  ${r.code} ${r.name}`, Number(r.amount)]));
  rows.push(['Total equity', Number(b.totalEquity)]);
  rows.push(['Total liabilities + equity', Number(b.totalLiabilitiesAndEquity)]);
  return rows;
}

function cashRows(c) {
  if (!c) return [];
  const rows = [['Net income', Number(c.netIncome)], ['Operating adjustments', '']];
  (c.operatingAdjustments || []).forEach((r) => rows.push([`  ${r.code} ${r.name}`, Number(r.amount)]));
  rows.push(['Cash from operations', Number(c.operatingCash)]);
  rows.push(['Investing activities', Number(c.investingCash)]);
  rows.push(['Financing activities', Number(c.financingCash)]);
  rows.push(['Net change in cash', Number(c.netChangeInCash)]);
  rows.push(['Beginning cash', Number(c.beginningCash)]);
  rows.push(['Ending cash', Number(c.endingCash)]);
  return rows;
}

async function buildXlsx({ pnl, balanceSheet, cashFlow }) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const sheet = (rows) => XLSX.utils.aoa_to_sheet([['Line', 'Amount'], ...rows.map(([l, a]) => [l, a === '' ? '' : a])]);
  XLSX.utils.book_append_sheet(wb, sheet(pnlRows(pnl)), 'Profit & Loss');
  XLSX.utils.book_append_sheet(wb, sheet(balanceRows(balanceSheet)), 'Balance Sheet');
  XLSX.utils.book_append_sheet(wb, sheet(cashRows(cashFlow)), 'Cash Flow');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function buildPdf({ pnl, balanceSheet, cashFlow, scopeLabel, periodLabel }) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(15); doc.text(`Financial statements — ${scopeLabel || 'Business'}`, 40, 44);
  doc.setFontSize(10); doc.setTextColor(120); doc.text(periodLabel || '', 40, 62);

  const section = (title, rows) => {
    autoTable(doc, {
      startY: (doc.lastAutoTable ? doc.lastAutoTable.finalY : 74) + 20,
      head: [[title, 'Amount']],
      body: rows.map(([l, a]) => [l, a === '' ? '' : money(a)]),
      styles: { fontSize: 9 }, headStyles: { fillColor: [45, 90, 61] },
      columnStyles: { 1: { halign: 'right' } },
    });
  };
  section('Profit & Loss', pnlRows(pnl));
  section('Balance Sheet', balanceRows(balanceSheet));
  section('Statement of Cash Flows', cashRows(cashFlow));
  return doc.output('blob');
}

/** Build + download a statements export. format: 'xlsx' | 'pdf'. */
export async function exportStatements(format, model) {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `financial-statements-${(model.scopeLabel || 'business').toLowerCase().replace(/\s+/g, '-')}-${stamp}`;
  if (format === 'pdf') {
    downloadBlob(await buildPdf(model), `${base}.pdf`);
  } else {
    downloadBlob(await buildXlsx(model), `${base}.xlsx`);
  }
}
