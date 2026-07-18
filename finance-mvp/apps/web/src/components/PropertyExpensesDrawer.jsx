import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api";
import { currency, formatDate } from "../utils/format";

const PAYMENT_METHODS = ["Cash", "Check", "Credit Card", "Bank Transfer", "Other"];

const emptyForm = {
  expenseDate: new Date().toISOString().slice(0, 10),
  category: "",
  vendor: "",
  description: "",
  amount: "",
  paymentMethod: "",
  receiptRef: "",
  hours: "",
  hourlyRate: "",
  notes: "",
};

// CSV-escape a single field (wrap in quotes, double internal quotes).
function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Slide-over expense tracker scoped to one property. Add / edit / delete dated,
 * categorized expenses; see YTD / this-month / missing-receipt KPIs; download an
 * accountant-ready CSV or file it in the Documents Center to share with a CPA.
 * The Master log lives server-side — this view is the editor for one property.
 */
export default function PropertyExpensesDrawer({ property, onClose, onChanged }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingDoc, setSavingDoc] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(true);

  const propertyId = property?.id;
  const address = property?.address || "This property";

  // Years offered in the selector: a few back from now (so past filings are reachable).
  const years = useMemo(
    () => Array.from({ length: 6 }, (_, i) => currentYear - i),
    [currentYear]
  );

  const load = useCallback(async () => {
    if (!propertyId) return;
    try {
      setLoading(true);
      setError("");
      const [exp, sum] = await Promise.all([
        api.listPropertyExpenses(propertyId, year),
        api.getPropertyExpenseSummary(propertyId, year),
      ]);
      setExpenses(Array.isArray(exp) ? exp : []);
      setSummary(sum || null);
    } catch (err) {
      setError(err?.message || "Failed to load expenses.");
    } finally {
      setLoading(false);
    }
  }, [propertyId, year]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!propertyId) return;
    api
      .getExpenseCategories(propertyId)
      .then((c) => setCategories(Array.isArray(c) ? c : []))
      .catch(() => setCategories([]));
  }, [propertyId]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onField = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const livePreview = useMemo(() => {
    const amt = Number(form.amount) || 0;
    const hrs = form.hours === "" ? null : Number(form.hours);
    const rate = form.hourlyRate === "" ? null : Number(form.hourlyRate);
    const labor = hrs != null && rate != null ? hrs * rate : null;
    return { labor, total: amt + (labor || 0) };
  }, [form.amount, form.hours, form.hourlyRate]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, category: categories[0] || "" });
    setShowForm(true);
    setError("");
    setNotice("");
  };

  const openEdit = (ex) => {
    setEditingId(ex.id);
    setForm({
      expenseDate: ex.expenseDate || emptyForm.expenseDate,
      category: ex.category || "",
      vendor: ex.vendor || "",
      description: ex.description || "",
      amount: ex.amount != null ? String(ex.amount) : "",
      paymentMethod: ex.paymentMethod || "",
      receiptRef: ex.receiptRef || "",
      hours: ex.hours != null ? String(ex.hours) : "",
      hourlyRate: ex.hourlyRate != null ? String(ex.hourlyRate) : "",
      notes: ex.notes || "",
    });
    setShowForm(true);
    setError("");
    setNotice("");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.category) return setError("Pick a category.");
    if (!form.expenseDate) return setError("Pick a date.");
    if (form.amount === "" || Number(form.amount) < 0)
      return setError("Enter an amount (0 or more).");
    const num = (v) => (v === "" || v == null ? null : Number(v));
    const payload = {
      expenseDate: form.expenseDate,
      category: form.category,
      vendor: form.vendor.trim() || null,
      description: form.description.trim() || null,
      amount: Number(form.amount),
      paymentMethod: form.paymentMethod || null,
      receiptRef: form.receiptRef.trim() || null,
      hours: num(form.hours),
      hourlyRate: num(form.hourlyRate),
      notes: form.notes.trim() || null,
    };
    try {
      setSaving(true);
      setError("");
      if (editingId) {
        await api.updatePropertyExpense(propertyId, editingId, payload);
      } else {
        await api.addPropertyExpense(propertyId, payload);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      setNotice(editingId ? "Expense updated." : "Expense added.");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.message || "Failed to save expense.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ex) => {
    if (!window.confirm("Delete this expense? This cannot be undone.")) return;
    try {
      setError("");
      await api.deletePropertyExpense(propertyId, ex.id);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.message || "Failed to delete expense.");
    }
  };

  // Build an accountant-ready CSV: per-expense rows, then category totals + grand total.
  const buildCsv = () => {
    const header = [
      "Date", "Category", "Vendor/Payee", "Description", "Amount",
      "Payment Method", "Receipt Ref #", "Hours", "Hourly Rate",
      "Labor Cost", "Total Cost", "Notes",
    ];
    const lines = [header.map(csvCell).join(",")];
    expenses.forEach((e) => {
      lines.push([
        e.expenseDate, e.category, e.vendor, e.description, e.amount,
        e.paymentMethod, e.receiptRef, e.hours, e.hourlyRate,
        e.laborCost, e.totalCost, e.notes,
      ].map(csvCell).join(","));
    });
    lines.push("");
    lines.push(csvCell(`Category totals (${year}) — Schedule E rental expenses`));
    (summary?.byCategory || []).forEach((c) => {
      lines.push([c.category, "", "", "", "", "", "", "", "", "", c.total, ""].map(csvCell).join(","));
    });
    lines.push(["GRAND TOTAL", "", "", "", "", "", "", "", "", "", summary?.grandTotal ?? 0, ""].map(csvCell).join(","));
    return lines.join("\n");
  };

  const fileName = () =>
    `${address.replace(/[^\w\s-]/g, "").trim() || "Property"} — Expenses ${year}.csv`;

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
        label: fileName().replace(/\.csv$/, ""),
        docType: "TAX",
        note: `Expense report for ${address} — tax year ${year}.`,
      });
      setNotice("Saved to your Documents Center — you can share it with your CPA from there.");
    } catch (err) {
      setError(err?.message || "Could not save to Documents.");
    } finally {
      setSavingDoc(false);
    }
  };

  const missing = summary?.missingReceiptCount || 0;

  return (
    <div
      className="expense-drawer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Expenses for ${address}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <aside className="expense-drawer" onMouseDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="expense-drawer-head">
          <div style={{ minWidth: 0 }}>
            <div className="expense-drawer-title">
              <i className="ti ti-receipt-2" style={{ color: "var(--tv-forest)" }}></i> Expenses
            </div>
            <div className="expense-drawer-sub">{address}</div>
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

          {/* Controls: year + add */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Tax year</label>
              <select className="form-select" style={{ width: 120 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} onClick={showForm ? () => { setShowForm(false); setEditingId(null); } : openAdd}>
              <i className={showForm ? "ti ti-x" : "ti ti-plus"}></i> {showForm ? "Cancel" : "Add expense"}
            </button>
          </div>

          {/* KPI row */}
          <div className="expense-kpi-row">
            <div className="expense-kpi">
              <div className="expense-kpi-label">Total {year}</div>
              <div className="expense-kpi-value">{currency(summary?.grandTotal || 0)}</div>
            </div>
            <div className="expense-kpi">
              <div className="expense-kpi-label">This month</div>
              <div className="expense-kpi-value">{currency(summary?.totalThisMonth || 0)}</div>
            </div>
            <div className="expense-kpi">
              <div className="expense-kpi-label">Missing receipts</div>
              <div className="expense-kpi-value" style={{ color: missing > 0 ? "var(--tv-gold-dark, #8a6d00)" : "var(--tv-text-primary)" }}>
                {missing > 0 ? <><i className="ti ti-alert-triangle" style={{ marginRight: 4 }}></i>{missing}</> : "0"}
              </div>
            </div>
          </div>

          {/* Add / edit form */}
          {showForm && (
            <form className="card expense-form" onSubmit={submit} style={{ marginBottom: 16 }}>
              <div className="section-title" style={{ fontSize: 13, marginBottom: 10 }}>
                <i className={editingId ? "ti ti-pencil" : "ti ti-plus"} style={{ color: "var(--tv-forest)", marginRight: 6 }}></i>
                {editingId ? "Edit expense" : "New expense"}
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input className="form-input" type="date" value={form.expenseDate} onChange={onField("expenseDate")} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-select" value={form.category} onChange={onField("category")} required>
                    <option value="" disabled>Select…</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Vendor / Payee</label>
                  <input className="form-input" value={form.vendor} onChange={onField("vendor")} placeholder="e.g. Ace Hardware" />
                </div>
                <div className="form-group">
                  <label className="form-label">Amount</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={form.amount} onChange={onField("amount")} placeholder="0.00" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment method</label>
                  <select className="form-select" value={form.paymentMethod} onChange={onField("paymentMethod")}>
                    <option value="">—</option>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Receipt ref #
                    {!form.receiptRef && <span style={{ color: "var(--tv-gold-dark, #8a6d00)", fontWeight: 400 }}> (blank = flagged)</span>}
                  </label>
                  <input className="form-input" value={form.receiptRef} onChange={onField("receiptRef")} placeholder="RCPT-1001" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-input" value={form.description} onChange={onField("description")} placeholder="What was this for?" />
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Time spent (hrs)</label>
                  <input className="form-input" type="number" step="0.25" min="0" value={form.hours} onChange={onField("hours")} placeholder="—" />
                </div>
                <div className="form-group">
                  <label className="form-label">Hourly rate</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={form.hourlyRate} onChange={onField("hourlyRate")} placeholder="—" />
                </div>
                <div className="form-group">
                  <label className="form-label">Labor cost</label>
                  <input className="form-input" value={livePreview.labor != null ? currency(livePreview.labor) : "—"} disabled readOnly />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-input" value={form.notes} onChange={onField("notes")} placeholder="Optional" />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, color: "var(--tv-text-secondary)" }}>
                  Total cost: <strong style={{ color: "var(--tv-text-primary)" }}>{currency(livePreview.total)}</strong>
                </div>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  <i className={`ti ${saving ? "ti-loader spin" : "ti-check"}`}></i>
                  {saving ? "Saving…" : editingId ? "Update expense" : "Add expense"}
                </button>
              </div>
            </form>
          )}

          {/* Expense list */}
          {loading && expenses.length === 0 ? (
            <div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading expenses…</p></div>
          ) : expenses.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-receipt-off"></i>
              <p>No expenses logged for {year} yet.</p>
              {!showForm && <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={openAdd}><i className="ti ti-plus"></i> Add the first one</button>}
            </div>
          ) : (
            <div className="expense-table-wrap">
              <table className="expense-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Category</th><th>Vendor</th>
                    <th style={{ textAlign: "right" }}>Total</th><th>Receipt</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => {
                    const noReceipt = !e.receiptRef;
                    return (
                      <tr key={e.id} className={noReceipt ? "expense-row-flag" : ""}>
                        <td style={{ whiteSpace: "nowrap" }}>{formatDate(e.expenseDate)}</td>
                        <td>{e.category}</td>
                        <td style={{ color: "var(--tv-text-secondary)" }}>{e.vendor || "—"}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {currency(e.totalCost)}
                          {e.laborCost ? <div style={{ fontSize: 10.5, color: "var(--tv-text-muted)" }}>incl. {currency(e.laborCost)} labor</div> : null}
                        </td>
                        <td>
                          {noReceipt
                            ? <span className="badge badge-gold" title="Missing receipt"><i className="ti ti-alert-triangle"></i> Missing</span>
                            : <span className="badge badge-green"><i className="ti ti-check"></i> {e.receiptRef}</span>}
                        </td>
                        <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                          <button className="icon-btn" title="Edit" onClick={() => openEdit(e)}><i className="ti ti-pencil"></i></button>
                          <button className="icon-btn account-action" title="Delete" onClick={() => remove(e)}><i className="ti ti-trash"></i></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Category breakdown */}
          {summary?.byCategory?.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="section-title"
                onClick={() => setShowBreakdown((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, width: "100%" }}
              >
                <i className={`ti ${showBreakdown ? "ti-chevron-down" : "ti-chevron-right"}`}></i>
                Category breakdown · {year}
              </button>
              {showBreakdown && (
                <div style={{ marginTop: 10 }}>
                  {summary.byCategory.map((c) => (
                    <div key={c.category} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, borderBottom: "1px solid var(--tv-border)" }}>
                      <span style={{ color: "var(--tv-text-secondary)" }}>{c.category}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{currency(c.total)}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 2px", fontWeight: 600 }}>
                    <span>Grand total</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{currency(summary.grandTotal || 0)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer: export actions */}
        <div className="expense-drawer-foot">
          <div style={{ fontSize: 11.5, color: "var(--tv-text-muted)" }}>
            Accountant-ready · Schedule E
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={downloadCsv} disabled={expenses.length === 0}>
              <i className="ti ti-download"></i> Download CSV
            </button>
            <button className="btn btn-primary btn-sm" onClick={saveToDocuments} disabled={savingDoc || expenses.length === 0}>
              <i className={`ti ${savingDoc ? "ti-loader spin" : "ti-folder"}`}></i> {savingDoc ? "Saving…" : "Save to Documents"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
