import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { exportStatements } from '../../utils/statementExport';

/**
 * Financial statements from the general ledger (GL.3): Profit & Loss, Balance Sheet, and a
 * Statement of Cash Flows for a chosen period, with Excel / PDF export. Self-contained.
 */
const money = (n) => (n == null ? '—' : Number(n).toLocaleString(undefined, { style: 'currency', currency: 'USD' }));
const iso = (d) => d.toISOString().slice(0, 10);

function presetRange(preset) {
  const now = new Date();
  const y = now.getFullYear();
  if (preset === 'month') return [new Date(y, now.getMonth(), 1), new Date(y, now.getMonth() + 1, 0)];
  if (preset === 'quarter') { const q = Math.floor(now.getMonth() / 3); return [new Date(y, q * 3, 1), new Date(y, q * 3 + 3, 0)]; }
  if (preset === 'lastyear') return [new Date(y - 1, 0, 1), new Date(y - 1, 11, 31)];
  return [new Date(y, 0, 1), now]; // ytd
}

export default function StatementsPanel({ businessId, scopeLabel = 'Business', onError }) {
  const [preset, setPreset] = useState('ytd');
  const [tab, setTab] = useState('pnl');
  const [data, setData] = useState({ pnl: null, balanceSheet: null, cashFlow: null });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');

  const [from, to] = useMemo(() => presetRange(preset).map(iso), [preset]);
  const periodLabel = useMemo(() => `${from} → ${to}`, [from, to]);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [pnl, balanceSheet, cashFlow] = await Promise.all([
        api.getLedgerPnl(businessId, from, to),
        api.getLedgerBalanceSheet(businessId, to),
        api.getLedgerCashFlow(businessId, from, to),
      ]);
      setData({ pnl, balanceSheet, cashFlow });
    } catch (err) { onError?.(err?.message || 'Could not load statements.'); }
    finally { setLoading(false); }
  }, [businessId, from, to, onError]);

  useEffect(() => { load(); }, [load]);

  async function doExport(format) {
    try {
      setExporting(format);
      await exportStatements(format, { ...data, scopeLabel, periodLabel });
    } catch (err) { onError?.(err?.message || 'Export failed.'); }
    finally { setExporting(''); }
  }

  const Row = ({ label, value, indent, strong, top }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', paddingLeft: indent ? 16 : 0,
      fontWeight: strong ? 600 : 400, borderTop: top ? '1px solid var(--tv-border)' : 'none', marginTop: top ? 4 : 0 }}>
      <span>{label}</span><span className="item-amount">{value}</span>
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-header">
        <div className="section-title"><i className="ti ti-report-money" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>Financial statements</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-select" style={{ width: 'auto', padding: '4px 8px', height: 'auto' }} value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="month">This month</option>
            <option value="quarter">This quarter</option>
            <option value="ytd">Year to date</option>
            <option value="lastyear">Last year</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={() => doExport('xlsx')} disabled={!!exporting}><i className="ti ti-file-spreadsheet"></i> Excel</button>
          <button className="btn btn-secondary btn-sm" onClick={() => doExport('pdf')} disabled={!!exporting}><i className="ti ti-file-type-pdf"></i> PDF</button>
        </div>
      </div>
      <p className="item-sub" style={{ margin: '-4px 0 12px' }}>Derived from your double-entry general ledger · {periodLabel}</p>

      <div className="seg-group" style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[['pnl', 'Profit & Loss'], ['balance', 'Balance Sheet'], ['cash', 'Cash Flow']].map(([id, label]) => (
          <button key={id} className={`seg-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state"><i className="ti ti-loader-2"></i><p>Loading…</p></div>
      ) : tab === 'pnl' ? (
        <div>
          <div className="item-sub" style={{ fontWeight: 600, margin: '6px 0 2px' }}>Income</div>
          {(data.pnl?.income || []).map((r) => <Row key={r.code} indent label={`${r.code} · ${r.name}`} value={money(r.amount)} />)}
          <Row strong top label="Total income" value={money(data.pnl?.totalIncome)} />
          <div className="item-sub" style={{ fontWeight: 600, margin: '10px 0 2px' }}>Expenses</div>
          {(data.pnl?.expenses || []).map((r) => <Row key={r.code} indent label={`${r.code} · ${r.name}`} value={money(r.amount)} />)}
          <Row strong top label="Total expenses" value={money(data.pnl?.totalExpense)} />
          <Row strong top label={`Net ${Number(data.pnl?.netProfit) >= 0 ? 'profit' : 'loss'}`} value={money(data.pnl?.netProfit)} />
        </div>
      ) : tab === 'balance' ? (
        <div>
          <div className="item-sub" style={{ fontWeight: 600, margin: '6px 0 2px' }}>Assets</div>
          {(data.balanceSheet?.assets || []).map((r) => <Row key={r.code} indent label={`${r.code} · ${r.name}`} value={money(r.amount)} />)}
          <Row strong top label="Total assets" value={money(data.balanceSheet?.totalAssets)} />
          <div className="item-sub" style={{ fontWeight: 600, margin: '10px 0 2px' }}>Liabilities</div>
          {(data.balanceSheet?.liabilities || []).map((r) => <Row key={r.code} indent label={`${r.code} · ${r.name}`} value={money(r.amount)} />)}
          <Row strong top label="Total liabilities" value={money(data.balanceSheet?.totalLiabilities)} />
          <div className="item-sub" style={{ fontWeight: 600, margin: '10px 0 2px' }}>Equity</div>
          {(data.balanceSheet?.equity || []).map((r, i) => <Row key={`${r.code}-${i}`} indent label={`${r.code} · ${r.name}`} value={money(r.amount)} />)}
          <Row strong top label="Total liabilities + equity" value={money(data.balanceSheet?.totalLiabilitiesAndEquity)} />
          {data.balanceSheet && !data.balanceSheet.balanced && (
            <div className="item-sub" style={{ color: 'var(--tv-negative)', marginTop: 6 }}><i className="ti ti-alert-triangle"></i> Assets and liabilities + equity don't tie — check for unposted entries.</div>
          )}
        </div>
      ) : (
        <div>
          <Row label="Net income" value={money(data.cashFlow?.netIncome)} />
          {(data.cashFlow?.operatingAdjustments || []).length > 0 && <div className="item-sub" style={{ fontWeight: 600, margin: '8px 0 2px' }}>Adjustments (working capital)</div>}
          {(data.cashFlow?.operatingAdjustments || []).map((r) => <Row key={r.code} indent label={`${r.code} · ${r.name}`} value={money(r.amount)} />)}
          <Row strong top label="Cash from operating activities" value={money(data.cashFlow?.operatingCash)} />
          <Row label="Investing activities" value={money(data.cashFlow?.investingCash)} />
          <Row label="Financing activities" value={money(data.cashFlow?.financingCash)} />
          <Row strong top label="Net change in cash" value={money(data.cashFlow?.netChangeInCash)} />
          <Row indent label="Beginning cash" value={money(data.cashFlow?.beginningCash)} />
          <Row indent label="Ending cash" value={money(data.cashFlow?.endingCash)} />
        </div>
      )}
    </div>
  );
}
