import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api";
import { currency, formatDate } from "../utils/format";
import { categoryColor } from "../utils/categoryPalette";
import ChartSelector from "./viz/ChartSelector";
import { useChartPref } from "../utils/chartPrefs";
import ComboBarChart from "./viz/ComboBarChart";
import DonutChart from "./viz/DonutChart";

const PAYMENT_METHODS = ["Cash", "Check", "Credit Card", "Bank Transfer", "Other"];

// Income categories — must mirror ExpenseCategories.INCOME on the server so income vs
// expense is classified the same way everywhere. Money in these categories is treated
// as inflow; everything else is an expense.
const INCOME_CATEGORIES = new Set(["rental income", "other income"]);
const isIncome = (cat) => !!cat && INCOME_CATEGORIES.has(cat.trim().toLowerCase());

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
 * Slide-over rental tracker scoped to one property. Log dated, categorized income &
 * expenses (attach a receipt ref); see Income / Expenses / Net KPIs; toggle between a
 * monthly income-vs-expense chart and a category-breakdown chart; and export a
 * tax-ready year-end summary (CSV) either as a download or filed in the Documents Center
 * to share with a CPA. The server is the source of truth for the income/expense split,
 * category totals, and the monthly series.
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

  const [cashflowType] = useChartPref("reCashflow");
  const [breakdownType] = useChartPref("reBreakdown");

  const propertyId = property?.id;
  const address = property?.address || "This property";
  const annualDep = Number(property?.annualDepreciation || 0);
  const monthlyDep = Number(property?.monthlyDepreciation || annualDep / 12 || 0);

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
      setError(err?.message || "Failed to load transactions.");
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

  const incomeCats = useMemo(() => categories.filter(isIncome), [categories]);
  const expenseCats = useMemo(() => categories.filter((c) => !isIncome(c)), [categories]);
  const formIsIncome = isIncome(form.category);

  const livePreview = useMemo(() => {
    const amt = Number(form.amount) || 0;
    const hrs = form.hours === "" ? null : Number(form.hours);
    const rate = form.hourlyRate === "" ? null : Number(form.hourlyRate);
    const labor = hrs != null && rate != null ? hrs * rate : null;
    return { labor, total: amt + (labor || 0) };
  }, [form.amount, form.hours, form.hourlyRate]);

  // Contiguous monthly series (Jan → latest active month, or current month this year) for
  // the cash-flow chart, with net = income − expense.
  const periods = useMemo(() => {
    const rows = summary?.monthly || [];
    if (!rows.length) return [];
    let lastActive = 0;
    rows.forEach((m) => {
      if ((Number(m.income) || 0) > 0 || (Number(m.expense) || 0) > 0) lastActive = m.month;
    });
    if (year === currentYear) lastActive = Math.max(lastActive, new Date().getMonth() + 1);
    if (lastActive === 0) return [];
    return rows.slice(0, lastActive).map((m) => {
      const income = Number(m.income) || 0;
      const expense = Number(m.expense) || 0;
      return { label: MONTHS[m.month - 1], income, expense, net: income - expense };
    });
  }, [summary, year, currentYear]);

  const breakdown = useMemo(
    () =>
      (summary?.byCategory || []).map((c) => ({
        label: c.category,
        value: Number(c.total) || 0,
        color: categoryColor(c.category),
      })),
    [summary]
  );

  const totalIncome = Number(summary?.totalIncome || 0);
  const totalExpense = Number(summary?.grandTotal || 0);
  const net = summary?.netIncomeLoss != null ? Number(summary.netIncomeLoss) : totalIncome - totalExpense;
  const taxableNet = net - annualDep; // after non-cash depreciation
  const missing = summary?.missingReceiptCount || 0;

  const openAdd = (category) => {
    setEditingId(null);
    setForm({ ...emptyForm, category: category || expenseCats[0] || categories[0] || "" });
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
      setNotice(editingId ? "Entry updated." : (formIsIncome ? "Income added." : "Expense added."));
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.message || "Failed to save entry.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ex) => {
    if (!window.confirm("Delete this entry? This cannot be undone.")) return;
    try {
      setError("");
      await api.deletePropertyExpense(propertyId, ex.id);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.message || "Failed to delete entry.");
    }
  };

  // Build a tax-ready year-end summary CSV: per-transaction rows, then an income section,
  // expense category totals, depreciation, and the net cash-flow / taxable-net lines.
  const buildCsv = () => {
    const header = [
      "Date", "Type", "Category", "Vendor/Payee", "Description", "Amount",
      "Payment Method", "Receipt Ref #", "Hours", "Hourly Rate",
      "Labor Cost", "Total", "Notes",
    ];
    const lines = [csvCell(`${address} — Rental tax summary ${year}`), "", header.map(csvCell).join(",")];
    expenses.forEach((e) => {
      lines.push([
        e.expenseDate, isIncome(e.category) ? "Income" : "Expense", e.category, e.vendor,
        e.description, e.amount, e.paymentMethod, e.receiptRef, e.hours, e.hourlyRate,
        e.laborCost, e.totalCost, e.notes,
      ].map(csvCell).join(","));
    });

    lines.push("");
    lines.push(csvCell(`Rental income (${year})`));
    lines.push(["Total rental income", "", "", "", "", "", "", "", "", "", "", totalIncome, ""].map(csvCell).join(","));

    lines.push("");
    lines.push(csvCell(`Itemized expenses by category (${year}) — Schedule E`));
    (summary?.byCategory || []).forEach((c) => {
      lines.push([c.category, "", "", "", "", "", "", "", "", "", "", c.total, ""].map(csvCell).join(","));
    });
    lines.push(["Total operating expenses", "", "", "", "", "", "", "", "", "", "", totalExpense, ""].map(csvCell).join(","));

    lines.push("");
    lines.push(["Depreciation (straight-line, 27.5 yr)", "", "", "", "", "", "", "", "", "", "", annualDep, ""].map(csvCell).join(","));
    lines.push(["NET CASH FLOW (income − expenses)", "", "", "", "", "", "", "", "", "", "", net, ""].map(csvCell).join(","));
    lines.push(["TAXABLE NET (after depreciation)", "", "", "", "", "", "", "", "", "", "", taxableNet, ""].map(csvCell).join(","));

    const flagged = expenses.filter((e) => !isIncome(e.category) && !e.receiptRef).length;
    if (flagged > 0) {
      lines.push("");
      lines.push(csvCell(`Note: ${flagged} expense(s) are missing a receipt reference.`));
    }
    return lines.join("\n");
  };

  const fileName = () =>
    `${address.replace(/[^\w\s-]/g, "").trim() || "Property"} — Tax Summary ${year}.csv`;

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
        note: `Rental tax summary for ${address} — tax year ${year}.`,
      });
      setNotice("Saved to your Documents Center — you can share it with your CPA from there.");
    } catch (err) {
      setError(err?.message || "Could not save to Documents.");
    } finally {
      setSavingDoc(false);
    }
  };

  const hasData = expenses.length > 0;

  return (
    <div
      className="expense-drawer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Rental tracker for ${address}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <aside className="expense-drawer" onMouseDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="expense-drawer-head">
          <div style={{ minWidth: 0 }}>
            <div className="expense-drawer-title">
              <i className="ti ti-receipt-2" style={{ color: "var(--tv-forest)" }}></i> Income &amp; expenses
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

          {/* Controls: year + add income + add expense */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Tax year</label>
              <select className="form-select" style={{ width: 120 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => openAdd(incomeCats[0] || "Rental Income")}>
                <i className="ti ti-cash"></i> Add income
              </button>
              <button className="btn btn-primary btn-sm" onClick={showForm ? () => { setShowForm(false); setEditingId(null); } : () => openAdd(expenseCats[0])}>
                <i className={showForm ? "ti ti-x" : "ti ti-plus"}></i> {showForm ? "Cancel" : "Add expense"}
              </button>
            </div>
          </div>

          {/* KPI row: income / expenses / net (labeled loss when negative) / missing receipts */}
          <div className="expense-kpi-row">
            <div className="expense-kpi">
              <div className="expense-kpi-label">Income {year}</div>
              <div className="expense-kpi-value" style={{ color: "var(--tv-positive)" }}>{currency(totalIncome)}</div>
            </div>
            <div className="expense-kpi">
              <div className="expense-kpi-label">Expenses {year}</div>
              <div className="expense-kpi-value">{currency(totalExpense)}</div>
            </div>
            <div className="expense-kpi">
              <div className="expense-kpi-label">{net < 0 ? "Net loss" : "Net cash flow"}</div>
              <div className="expense-kpi-value" style={{ color: net < 0 ? "var(--tv-negative)" : "var(--tv-positive)" }}>
                {net < 0 ? "−" : "+"}{currency(Math.abs(net))}
              </div>
            </div>
            <div className="expense-kpi">
              <div className="expense-kpi-label">Missing receipts</div>
              <div className="expense-kpi-value" style={{ color: missing > 0 ? "var(--tv-gold-dark, #8a6d00)" : "var(--tv-text-primary)" }}>
                {missing > 0 ? <><i className="ti ti-alert-triangle" style={{ marginRight: 4 }}></i>{missing}</> : "0"}
              </div>
            </div>
          </div>

          {/* Cash-flow chart — monthly income vs expense with a net line; toggle Bar/Trend */}
          {periods.length > 0 && (
            <div className="card" style={{ marginTop: 4, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <div className="section-title" style={{ margin: 0, fontSize: 13 }}>Monthly income vs. expenses · {year}</div>
                <ChartSelector section="reCashflow" compact />
              </div>
              {cashflowType === "line" ? (
                <NetTrend periods={periods} />
              ) : (
                <ComboBarChart periods={periods} currency={currency} height={220} />
              )}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: 11.5, color: "var(--tv-text-muted)" }}>
                <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--tv-positive)", marginRight: 5 }} />Income</span>
                <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--tv-negative)", marginRight: 5 }} />Expenses</span>
                <span><span style={{ display: "inline-block", width: 14, height: 3, borderRadius: 2, background: "var(--tv-text-primary)", marginRight: 5, verticalAlign: "middle" }} />Net</span>
              </div>
            </div>
          )}

          {/* Expense breakdown — donut or horizontal bars; toggle */}
          {breakdown.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <div className="section-title" style={{ margin: 0, fontSize: 13 }}>Expense breakdown · {year}</div>
                <ChartSelector section="reBreakdown" compact />
              </div>
              {breakdownType === "bar" ? (
                <div>
                  {breakdown.map((d) => {
                    const pct = totalExpense > 0 ? (d.value / totalExpense) * 100 : 0;
                    return (
                      <div key={d.label} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                          <span style={{ color: "var(--tv-text-secondary)" }}>{d.label}</span>
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>{currency(d.value)} · {pct.toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: "var(--tv-border-light, rgba(128,128,128,.15))", overflow: "hidden" }}>
                          <div style={{ width: `${Math.max(2, pct)}%`, height: "100%", background: d.color, borderRadius: 4 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                  <DonutChart
                    size={160}
                    thickness={22}
                    data={breakdown}
                    centerValue={currency(totalExpense)}
                    centerLabel="expenses"
                  />
                  <div style={{ flex: 1, minWidth: 180 }}>
                    {breakdown.map((d) => (
                      <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12.5, borderBottom: "1px solid var(--tv-border-light)" }}>
                        <span style={{ width: 11, height: 11, borderRadius: 3, background: d.color, flex: "0 0 auto" }} />
                        <span style={{ flex: 1 }}>{d.label}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{currency(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Depreciation line — auto-calculated, non-cash. */}
          {annualDep > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "0 0 14px", padding: "9px 12px", background: "var(--tv-sage-pale)", borderRadius: "var(--radius-md)", fontSize: 12.5 }}>
              <span>
                <i className="ti ti-building-bank" style={{ color: "var(--tv-forest)", marginRight: 6 }}></i>
                Depreciation <span style={{ color: "var(--tv-text-muted)" }}>(straight-line, 27.5 yr)</span>
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                <strong>{currency(annualDep)}</strong>/yr · {currency(monthlyDep)}/mo
              </span>
            </div>
          )}

          {/* Add / edit form */}
          {showForm && (
            <form className="card expense-form" onSubmit={submit} style={{ marginBottom: 16 }}>
              <div className="section-title" style={{ fontSize: 13, marginBottom: 10 }}>
                <i className={editingId ? "ti ti-pencil" : (formIsIncome ? "ti ti-cash" : "ti ti-plus")} style={{ color: "var(--tv-forest)", marginRight: 6 }}></i>
                {editingId ? "Edit entry" : formIsIncome ? "New income" : "New expense"}
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
                    {incomeCats.length > 0 && (
                      <optgroup label="Income">
                        {incomeCats.map((c) => <option key={c} value={c}>{c}</option>)}
                      </optgroup>
                    )}
                    <optgroup label="Expenses">
                      {expenseCats.map((c) => <option key={c} value={c}>{c}</option>)}
                    </optgroup>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{formIsIncome ? "Source / Tenant" : "Vendor / Payee"}</label>
                  <input className="form-input" value={form.vendor} onChange={onField("vendor")} placeholder={formIsIncome ? "e.g. Unit 2 tenant" : "e.g. Ace Hardware"} />
                </div>
                <div className="form-group">
                  <label className="form-label">Amount</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={form.amount} onChange={onField("amount")} placeholder="0.00" required />
                </div>
                <div className="form-group">
                  <label className="form-label">{formIsIncome ? "Deposited to" : "Payment method"}</label>
                  <select className="form-select" value={form.paymentMethod} onChange={onField("paymentMethod")}>
                    <option value="">—</option>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    {formIsIncome ? "Reference #" : "Receipt ref #"}
                    {!formIsIncome && !form.receiptRef && <span style={{ color: "var(--tv-gold-dark, #8a6d00)", fontWeight: 400 }}> (blank = flagged)</span>}
                  </label>
                  <input className="form-input" value={form.receiptRef} onChange={onField("receiptRef")} placeholder={formIsIncome ? "DEP-2201" : "RCPT-1001"} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-input" value={form.description} onChange={onField("description")} placeholder="What was this for?" />
              </div>
              {!formIsIncome && (
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
              )}
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-input" value={form.notes} onChange={onField("notes")} placeholder="Optional" />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, color: "var(--tv-text-secondary)" }}>
                  {formIsIncome ? "Income" : "Total cost"}: <strong style={{ color: "var(--tv-text-primary)" }}>{currency(livePreview.total)}</strong>
                </div>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  <i className={`ti ${saving ? "ti-loader spin" : "ti-check"}`}></i>
                  {saving ? "Saving…" : editingId ? "Update entry" : formIsIncome ? "Add income" : "Add expense"}
                </button>
              </div>
            </form>
          )}

          {/* Transaction list */}
          {loading && expenses.length === 0 ? (
            <div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading transactions…</p></div>
          ) : expenses.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-receipt-off"></i>
              <p>No income or expenses logged for {year} yet.</p>
              {!showForm && <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => openAdd(expenseCats[0])}><i className="ti ti-plus"></i> Add the first one</button>}
            </div>
          ) : (
            <div className="expense-table-wrap">
              <table className="expense-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Category</th><th>Vendor</th>
                    <th style={{ textAlign: "right" }}>Amount</th><th>Receipt</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => {
                    const income = isIncome(e.category);
                    const noReceipt = !income && !e.receiptRef;
                    return (
                      <tr key={e.id} className={noReceipt ? "expense-row-flag" : ""}>
                        <td style={{ whiteSpace: "nowrap" }}>{formatDate(e.expenseDate)}</td>
                        <td>
                          {income && <i className="ti ti-arrow-down-left" style={{ color: "var(--tv-positive)", marginRight: 4 }} title="Income"></i>}
                          {e.category}
                        </td>
                        <td style={{ color: "var(--tv-text-secondary)" }}>{e.vendor || "—"}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: income ? "var(--tv-positive)" : undefined }}>
                          {income ? "+" : ""}{currency(e.totalCost)}
                          {e.laborCost ? <div style={{ fontSize: 10.5, color: "var(--tv-text-muted)" }}>incl. {currency(e.laborCost)} labor</div> : null}
                        </td>
                        <td>
                          {income
                            ? <span className="badge badge-green">Income</span>
                            : noReceipt
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

          {/* Year-end summary — income, expenses, depreciation, net */}
          {(summary?.byCategory?.length > 0 || totalIncome > 0) && (
            <div className="card" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="section-title"
                onClick={() => setShowBreakdown((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, width: "100%" }}
              >
                <i className={`ti ${showBreakdown ? "ti-chevron-down" : "ti-chevron-right"}`}></i>
                Year-end summary · {year}
              </button>
              {showBreakdown && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, borderBottom: "1px solid var(--tv-border)" }}>
                    <span style={{ color: "var(--tv-positive)" }}>Rental income</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--tv-positive)" }}>{currency(totalIncome)}</span>
                  </div>
                  {(summary?.byCategory || []).map((c) => (
                    <div key={c.category} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, borderBottom: "1px solid var(--tv-border)" }}>
                      <span style={{ color: "var(--tv-text-secondary)" }}>{c.category}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>−{currency(c.total)}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, borderBottom: "1px solid var(--tv-border)" }}>
                    <span style={{ color: "var(--tv-text-secondary)" }}>Total operating expenses</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>−{currency(totalExpense)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 2px", fontWeight: 600 }}>
                    <span>{net < 0 ? "Net loss (income − expenses)" : "Net cash flow (income − expenses)"}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", color: net < 0 ? "var(--tv-negative)" : "var(--tv-positive)" }}>
                      {net < 0 ? "−" : "+"}{currency(Math.abs(net))}
                    </span>
                  </div>
                  {annualDep > 0 && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, color: "var(--tv-text-muted)" }}>
                        <span>Less depreciation (non-cash)</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>−{currency(annualDep)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 2px", fontWeight: 600 }}>
                        <span>Taxable net {taxableNet < 0 ? "(loss)" : ""}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums", color: taxableNet < 0 ? "var(--tv-negative)" : "var(--tv-text-primary)" }}>
                          {taxableNet < 0 ? "−" : ""}{currency(Math.abs(taxableNet))}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer: export actions */}
        <div className="expense-drawer-foot">
          <div style={{ fontSize: 11.5, color: "var(--tv-text-muted)" }}>
            Tax-ready · Schedule E
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={downloadCsv} disabled={!hasData}>
              <i className="ti ti-download"></i> Download summary
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

/**
 * Compact net-cash-flow trend — a single line of net (income − expense) per month with a
 * zero baseline; the area is tinted green above zero and red below, so negative months
 * read as loss at a glance. Self-contained SVG, theme-aware via currentColor tokens.
 */
function NetTrend({ periods = [] }) {
  const W = 720;
  const H = 220;
  const padX = 20;
  const padY = 18;
  const plotW = W - padX * 2;
  const plotH = H - padY * 2;
  if (!periods.length) return null;
  const nets = periods.map((p) => p.net);
  const maxAbs = Math.max(1, ...nets.map((n) => Math.abs(n)));
  const zeroY = padY + plotH / 2;
  const x = (i) => padX + (periods.length === 1 ? plotW / 2 : (plotW * i) / (periods.length - 1));
  const y = (n) => zeroY - (n / maxAbs) * (plotH / 2);
  const linePts = periods.map((p, i) => `${x(i)},${y(p.net)}`).join(" ");
  const areaPts = `${x(0)},${zeroY} ${linePts} ${x(periods.length - 1)},${zeroY}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Net cash flow by month" style={{ display: "block" }}>
      <defs>
        <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--tv-positive)" stopOpacity="0.28" />
          <stop offset="50%" stopColor="var(--tv-positive)" stopOpacity="0.04" />
          <stop offset="50%" stopColor="var(--tv-negative)" stopOpacity="0.04" />
          <stop offset="100%" stopColor="var(--tv-negative)" stopOpacity="0.28" />
        </linearGradient>
      </defs>
      {/* zero baseline */}
      <line x1={padX} y1={zeroY} x2={W - padX} y2={zeroY} stroke="var(--tv-border)" strokeWidth="1" strokeDasharray="4 4" />
      <polygon points={areaPts} fill="url(#netFill)" />
      <polyline points={linePts} fill="none" stroke="var(--tv-text-primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {periods.map((p, i) => (
        <g key={p.label + i}>
          <circle cx={x(i)} cy={y(p.net)} r="3.5" fill={p.net < 0 ? "var(--tv-negative)" : "var(--tv-positive)"} />
          <text x={x(i)} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--tv-text-muted)">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}
