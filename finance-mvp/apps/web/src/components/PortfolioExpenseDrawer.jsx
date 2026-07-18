import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api";
import { currency, formatDate } from "../utils/format";

// CSV-escape a single field (wrap in quotes, double internal quotes).
function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const num = (v) => (v == null || v === "" ? 0 : Number(v) || 0);

/**
 * Portfolio-wide expense export: ONE combined, accountant-ready file covering every
 * property's expenses for a tax year — grouped under each property with per-property
 * subtotals and a portfolio grand total. Download as CSV or file a single copy in the
 * Documents Center (instead of one document per property). Read-only; editing happens
 * in each property's own expense tracker.
 */
export default function PortfolioExpenseDrawer({ properties = [], onClose }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingDoc, setSavingDoc] = useState(false);
  // [{ id, address, rows: [expense...] }]
  const [byProperty, setByProperty] = useState([]);

  const years = useMemo(
    () => Array.from({ length: 6 }, (_, i) => currentYear - i),
    [currentYear]
  );

  const load = useCallback(async () => {
    if (!properties.length) {
      setByProperty([]);
      return;
    }
    try {
      setLoading(true);
      setError("");
      const results = await Promise.all(
        properties.map(async (p) => {
          let rows = [];
          try {
            const r = await api.listPropertyExpenses(p.id, year);
            rows = Array.isArray(r) ? r : [];
          } catch {
            rows = [];
          }
          return { id: p.id, address: p.address || `Property #${p.id}`, rows };
        })
      );
      setByProperty(results);
    } catch (err) {
      setError(err?.message || "Failed to load portfolio expenses.");
    } finally {
      setLoading(false);
    }
  }, [properties, year]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Aggregates across all properties for the selected year.
  const agg = useMemo(() => {
    let grandTotal = 0;
    let missing = 0;
    let expenseCount = 0;
    const perProperty = [];
    const catTotals = new Map();
    byProperty.forEach((p) => {
      let pTotal = 0;
      let pMissing = 0;
      p.rows.forEach((e) => {
        const t = num(e.totalCost);
        pTotal += t;
        grandTotal += t;
        expenseCount += 1;
        if (!e.receiptRef) {
          pMissing += 1;
          missing += 1;
        }
        catTotals.set(e.category, (catTotals.get(e.category) || 0) + t);
      });
      perProperty.push({ id: p.id, address: p.address, count: p.rows.length, total: pTotal, missing: pMissing });
    });
    const byCategory = [...catTotals.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
    const propertiesWithExpenses = perProperty.filter((p) => p.count > 0).length;
    return { grandTotal, missing, expenseCount, perProperty, byCategory, propertiesWithExpenses };
  }, [byProperty]);

  // ---- Combined CSV: header, per-property sections w/ subtotals, then summaries ----
  const buildCsv = () => {
    const lines = [];
    lines.push(csvCell("Portfolio Rental Expense Report"));
    lines.push(["Tax Year", year].map(csvCell).join(","));
    lines.push(["Generated", new Date().toISOString().slice(0, 10)].map(csvCell).join(","));
    lines.push(["Properties", byProperty.length, "Expenses", agg.expenseCount].map(csvCell).join(","));
    lines.push("");

    const header = [
      "Property", "Date", "Category", "Vendor/Payee", "Description", "Amount",
      "Payment Method", "Receipt Ref #", "Hours", "Hourly Rate",
      "Labor Cost", "Total Cost", "Notes",
    ];
    lines.push(header.map(csvCell).join(","));

    byProperty.forEach((p) => {
      if (!p.rows.length) return;
      let sub = 0;
      p.rows.forEach((e) => {
        sub += num(e.totalCost);
        lines.push([
          p.address, e.expenseDate, e.category, e.vendor, e.description, e.amount,
          e.paymentMethod, e.receiptRef, e.hours, e.hourlyRate,
          e.laborCost, e.totalCost, e.notes,
        ].map(csvCell).join(","));
      });
      lines.push([`Subtotal — ${p.address}`, "", "", "", "", "", "", "", "", "", "", sub, ""].map(csvCell).join(","));
      lines.push("");
    });

    lines.push(csvCell(`Summary by property (${year})`));
    lines.push(["Property", "Expenses", "Missing receipts", "Total"].map(csvCell).join(","));
    agg.perProperty.forEach((p) => {
      lines.push([p.address, p.count, p.missing, p.total].map(csvCell).join(","));
    });
    lines.push(["GRAND TOTAL", agg.expenseCount, agg.missing, agg.grandTotal].map(csvCell).join(","));
    lines.push("");

    lines.push(csvCell(`Summary by category — all properties (${year}) — Schedule E`));
    lines.push(["Category", "Total"].map(csvCell).join(","));
    agg.byCategory.forEach((c) => {
      lines.push([c.category, c.total].map(csvCell).join(","));
    });
    lines.push(["GRAND TOTAL", agg.grandTotal].map(csvCell).join(","));
    return lines.join("\n");
  };

  const fileName = () => `All Properties — Expenses ${year}.csv`;

  const downloadCsv = () => {
    const blob = new Blob([buildCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const saveToDocuments = async () => {
    try {
      setSavingDoc(true);
      setError("");
      const file = new File([buildCsv()], fileName(), { type: "text/csv" });
      await api.uploadDocument(file, {
        label: `Portfolio expense report ${year}`,
        docType: "TAX",
        note: `Combined expense report for all ${byProperty.length} properties — tax year ${year}.`,
      });
      setNotice("Saved to your Documents Center — one combined file you can share with your CPA.");
    } catch (err) {
      setError(err?.message || "Could not save to Documents.");
    } finally {
      setSavingDoc(false);
    }
  };

  const hasData = agg.expenseCount > 0;

  return (
    <div
      className="expense-drawer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Tax export for all properties"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <aside className="expense-drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="expense-drawer-head">
          <div style={{ minWidth: 0 }}>
            <div className="expense-drawer-title">
              <i className="ti ti-file-invoice" style={{ color: "var(--tv-forest)" }}></i> Tax export · all properties
            </div>
            <div className="expense-drawer-sub">One combined report across your whole portfolio</div>
          </div>
          <button className="icon-btn" title="Close" onClick={onClose}>
            <i className="ti ti-x"></i>
          </button>
        </div>

        <div className="expense-drawer-body">
          {error && (
            <div className="card" style={{ borderLeft: "4px solid var(--tv-negative)", color: "var(--tv-negative)", fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}
          {notice && (
            <div className="card" style={{ borderLeft: "4px solid var(--tv-positive)", fontSize: 13, marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span><i className="ti ti-circle-check" style={{ color: "var(--tv-positive)", marginRight: 6 }}></i>{notice}</span>
              <button className="icon-btn" title="Dismiss" onClick={() => setNotice("")}><i className="ti ti-x"></i></button>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Tax year</label>
              <select className="form-select" style={{ width: 120 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {loading && <span style={{ fontSize: 12, color: "var(--tv-text-muted)" }}><i className="ti ti-loader spin"></i> Loading…</span>}
          </div>

          {/* Portfolio KPIs */}
          <div className="expense-kpi-row">
            <div className="expense-kpi">
              <div className="expense-kpi-label">Total {year}</div>
              <div className="expense-kpi-value">{currency(agg.grandTotal)}</div>
            </div>
            <div className="expense-kpi">
              <div className="expense-kpi-label">Properties</div>
              <div className="expense-kpi-value">{agg.propertiesWithExpenses}<span style={{ fontSize: 12, color: "var(--tv-text-muted)" }}> / {properties.length}</span></div>
            </div>
            <div className="expense-kpi">
              <div className="expense-kpi-label">Missing receipts</div>
              <div className="expense-kpi-value" style={{ color: agg.missing > 0 ? "var(--tv-gold-dark, #8a6d00)" : "var(--tv-text-primary)" }}>
                {agg.missing > 0 ? <><i className="ti ti-alert-triangle" style={{ marginRight: 4 }}></i>{agg.missing}</> : "0"}
              </div>
            </div>
          </div>

          {/* Per-property breakdown */}
          {!hasData ? (
            <div className="empty-state">
              <i className="ti ti-receipt-off"></i>
              <p>No expenses logged across your properties for {year}.</p>
            </div>
          ) : (
            <>
              <div className="section-title" style={{ fontSize: 13, marginBottom: 8 }}>By property</div>
              <div className="expense-table-wrap">
                <table className="expense-table">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th style={{ textAlign: "right" }}>Expenses</th>
                      <th style={{ textAlign: "right" }}>Total</th>
                      <th>Receipts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agg.perProperty.map((p) => (
                      <tr key={p.id} className={p.missing > 0 ? "expense-row-flag" : ""}>
                        <td>{p.address}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.count}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{currency(p.total)}</td>
                        <td>
                          {p.missing > 0
                            ? <span className="badge badge-gold" title="Expenses missing a receipt"><i className="ti ti-alert-triangle"></i> {p.missing} missing</span>
                            : <span className="badge badge-green"><i className="ti ti-check"></i> Complete</span>}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ fontWeight: 700 }}>Grand total</td>
                      <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{agg.expenseCount}</td>
                      <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{currency(agg.grandTotal)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Portfolio category breakdown */}
              <div className="card" style={{ marginTop: 16 }}>
                <div className="section-title" style={{ fontSize: 13 }}>By category · all properties · {year}</div>
                <div style={{ marginTop: 10 }}>
                  {agg.byCategory.map((c) => (
                    <div key={c.category} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, borderBottom: "1px solid var(--tv-border)" }}>
                      <span style={{ color: "var(--tv-text-secondary)" }}>{c.category}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{currency(c.total)}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 2px", fontWeight: 600 }}>
                    <span>Grand total</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{currency(agg.grandTotal)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="expense-drawer-foot">
          <div style={{ fontSize: 11.5, color: "var(--tv-text-muted)" }}>
            One file · all properties · Schedule E
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={downloadCsv} disabled={!hasData}>
              <i className="ti ti-download"></i> Download CSV
            </button>
            <button className="btn btn-primary btn-sm" onClick={saveToDocuments} disabled={savingDoc || !hasData}>
              <i className={`ti ${savingDoc ? "ti-loader spin" : "ti-folder"}`}></i> {savingDoc ? "Saving…" : "Save to Documents"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
