import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { extractPdfText } from "../utils/pdfText";

const INSIGHT_STYLE = {
  TIP:         { icon: "ti ti-bulb", color: "var(--tv-forest)", bg: "var(--tv-sage-pale)" },
  OPPORTUNITY: { icon: "ti ti-trending-up", color: "var(--tv-gold)", bg: "var(--tv-gold-pale)" },
  WARNING:     { icon: "ti ti-alert-triangle", color: "var(--tv-negative)", bg: "var(--tv-negative-bg)" },
  INFO:        { icon: "ti ti-info-circle", color: "var(--tv-text-secondary)", bg: "var(--tv-bg)" },
};

const FILING = [
  { value: "SINGLE", label: "Single" },
  { value: "MARRIED_JOINT", label: "Married filing jointly" },
  { value: "MARRIED_SEPARATE", label: "Married filing separately" },
  { value: "HEAD_OF_HOUSEHOLD", label: "Head of household" },
];

// The categorized money fields the estimator accepts (default "" in the form).
const INCOME_FIELDS = [
  "wages", "selfEmploymentIncome", "rentalIncome", "interestIncome",
  "dividendIncome", "retirementIncome", "otherIncome",
];
const ADJUSTMENT_FIELDS = [
  "studentLoanInterest", "hsaContribution", "iraContribution", "otherAdjustments",
];
const ITEMIZED_FIELDS = [
  "mortgageInterest", "propertyTaxes", "stateLocalTaxes", "charitable", "medicalExpenses",
];
const CATEGORY_FIELDS = [...INCOME_FIELDS, ...ADJUSTMENT_FIELDS, ...ITEMIZED_FIELDS];

// Friendly labels for a parsed document field key (used in the extraction log).
const FIELD_LABELS = {
  wages: "Wages",
  withholding: "Withholding",
  selfEmploymentIncome: "Self-employment income",
  rentalIncome: "Rental income",
  interestIncome: "Interest income",
  dividendIncome: "Dividend income",
  retirementIncome: "Retirement income",
  mortgageInterest: "Mortgage interest",
  propertyTaxes: "Property taxes",
  studentLoanInterest: "Student loan interest",
};

const DOC_LABELS = {
  "W2": "W-2", "1099-NEC": "1099-NEC", "1099-MISC": "1099-MISC", "1099-INT": "1099-INT",
  "1099-DIV": "1099-DIV", "1099-R": "1099-R", "1098": "1098", "1098-E": "1098-E",
  "1098-T": "1098-T", "UNKNOWN": "Document",
};

const usd = (v) =>
  v == null ? "—" : Number(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (v) => (v == null ? "—" : `${(Number(v) * 100).toFixed(1)}%`);

// Add a numeric amount onto whatever's already in a form field (multiple docs stack).
const addAmount = (existing, amount) => {
  const prev = Number(String(existing).replace(/[^0-9.\-]/g, "")) || 0;
  return String(Math.round(prev + Number(amount)));
};

/**
 * Tax Overview — an educational federal estimate. Sends the user's categorized
 * figures (income / adjustments / itemized deductions) to the versioned estimator
 * (financial-core) and shows the result. NOT tax advice; ends with a CTA to find a CPA.
 */
export default function TaxPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    year: 2025,
    filingStatus: "SINGLE",
    dependentsUnder17: 0,
    withholding: "",
    // categorized income / adjustments / itemized — all default ""
    wages: "", selfEmploymentIncome: "", rentalIncome: "", interestIncome: "",
    dividendIncome: "", retirementIncome: "", otherIncome: "",
    studentLoanInterest: "", hsaContribution: "", iraContribution: "", otherAdjustments: "",
    mortgageInterest: "", propertyTaxes: "", stateLocalTaxes: "", charitable: "", medicalExpenses: "",
  });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [guide, setGuide] = useState([]);
  const [guideOpen, setGuideOpen] = useState(true);
  const [docBusy, setDocBusy] = useState(false);
  const [docErr, setDocErr] = useState("");
  const [docLog, setDocLog] = useState([]);   // running list of what each upload extracted
  const [history, setHistory] = useState([]); // year-over-year estimate snapshots

  // Collapsible input sections (Basics always visible; the rest start open).
  const [openSection, setOpenSection] = useState({ income: true, adjustments: true, itemized: true });
  const toggleSection = (k) => setOpenSection((s) => ({ ...s, [k]: !s[k] }));

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Load a previously saved profile (404 = none yet) + the deductions/credits guide.
  useEffect(() => {
    let cancelled = false;
    api.getTaxProfile()
      .then((p) => { if (!cancelled && p) setForm((f) => ({ ...f, ...clean(p) })); })
      .catch(() => {});
    api.getTaxGuide()
      .then((g) => { if (!cancelled && Array.isArray(g)) setGuide(g); })
      .catch(() => {});
    api.getTaxHistory()
      .then((h) => { if (!cancelled && Array.isArray(h)) setHistory(h); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const loadHistory = () => {
    api.getTaxHistory().then((h) => Array.isArray(h) && setHistory(h)).catch(() => {});
  };

  const calculate = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setErr("");
    try {
      setResult(await api.estimateTax(form));
      loadHistory(); // the estimate is persisted server-side; refresh the year-over-year view
    } catch (e2) {
      setErr(e2?.message || "Could not calculate the estimate.");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    setSaved("");
    try {
      await api.saveTaxProfile(form);
      setSaved("Saved.");
      setTimeout(() => setSaved(""), 2500);
    } catch {
      setSaved("Could not save.");
    }
  };

  const useSuggestion = async () => {
    setSuggesting(true);
    try {
      const s = await api.getTaxPrefill();
      if (s && s.grossIncome != null) setForm((f) => ({ ...f, wages: String(Math.round(s.grossIncome)) }));
      else setErr("No linked-account deposits to estimate income from yet.");
    } catch {
      /* best-effort */
    } finally {
      setSuggesting(false);
    }
  };

  // Parse a single document's text, route each extracted field into the form, and
  // return a short summary line for the extraction log (or null if nothing landed).
  const parseAndRoute = async (text, fileName) => {
    if (!text || !text.trim()) return null;
    const r = await api.parseTaxDocument(text);
    const fields = Array.isArray(r?.fields) ? r.fields : [];
    const landed = [];   // { key, label, amount } to apply to the form
    const notes = [];    // info-only items (e.g. tuition → education credit)

    // Decide what lands BEFORE touching state — the functional setForm updater runs later, so we
    // can't read these arrays back if we populate them inside it.
    for (const fld of fields) {
      if (fld == null || fld.amount == null) continue;
      const key = fld.key;
      if (key === "tuition") {
        notes.push(`Tuition ${usd(fld.amount)} — you may qualify for an education credit`);
        continue;
      }
      // Only route keys that exist on the form (income/adjustments/itemized + withholding).
      if (key === "withholding" || CATEGORY_FIELDS.includes(key)) {
        landed.push({ key, label: FIELD_LABELS[key] || fld.label || key, amount: fld.amount });
      }
    }

    // Apply the routed amounts (accumulating across multiple documents) + adopt a valid tax year.
    const adoptYear = r?.taxYear === 2024 || r?.taxYear === 2025;
    if (landed.length || adoptYear) {
      setForm((f) => {
        const next = { ...f };
        for (const l of landed) next[l.key] = addAmount(next[l.key], l.amount);
        if (adoptYear) next.year = r.taxYear;
        return next;
      });
    }

    const docLabel = DOC_LABELS[r?.documentType] || "Document";
    if (landed.length === 0 && notes.length === 0) {
      return { ok: false, name: fileName, text: `${docLabel}: couldn't read any figures` };
    }
    const parts = landed.map((l) => `${l.label} ${usd(l.amount)}`);
    const yearStr = r?.taxYear ? ` (${r.taxYear})` : "";
    return {
      ok: true,
      name: fileName,
      text: landed.length
        ? `${docLabel}${yearStr}: ${parts.join(", ")} → added`
        : `${docLabel}${yearStr}: ${notes.join("; ")}`,
      notes,
    };
  };

  // Pull text out of one File depending on its type. Returns "" if it needs OCR.
  const extractFileText = async (file) => {
    const type = file.type || "";
    const name = (file.name || "").toLowerCase();
    if (type.startsWith("image/")) {
      throw new Error("Photos and scans need OCR, which isn't enabled yet — paste the text instead.");
    }
    if (type === "application/pdf" || name.endsWith(".pdf")) {
      const text = await extractPdfText(file);
      if (!text || !text.trim()) {
        throw new Error("Scanned PDF with no text layer — paste the text or enter the figures manually.");
      }
      return text;
    }
    // Plain text / CSV.
    return await file.text();
  };

  // Multi-file uploader: read + parse + route each selected file in turn.
  const onDocFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = ""; // allow re-selecting the same files
    setDocErr("");
    setDocBusy(true);
    const newEntries = [];
    let anyError = "";
    for (const file of files) {
      try {
        const text = await extractFileText(file);
        const entry = await parseAndRoute(text, file.name);
        if (entry) newEntries.push(entry);
      } catch (e2) {
        anyError = e2?.message || `Couldn't read ${file.name}.`;
        newEntries.push({ ok: false, name: file.name, text: anyError });
      }
    }
    if (newEntries.length) setDocLog((log) => [...newEntries, ...log]);
    if (anyError && !newEntries.some((x) => x.ok)) setDocErr(anyError);
    setDocBusy(false);
    setSaved("Figures from your document(s) were filled in — review, then Calculate.");
  };

  // Paste-text box: parse + route the same way as an uploaded file.
  const onPasteParse = async (text) => {
    if (!text || !text.trim()) return;
    setDocErr("");
    setDocBusy(true);
    try {
      const entry = await parseAndRoute(text, "Pasted text");
      if (entry) {
        setDocLog((log) => [entry, ...log]);
        if (!entry.ok) setDocErr("Couldn't read the key figures — try the form fields below.");
        else setSaved("Figures were filled in — review, then Calculate.");
      }
    } catch (e2) {
      setDocErr(e2?.message || "Couldn't read that text.");
    } finally {
      setDocBusy(false);
    }
  };

  const owed = result && Number(result.refundOrOwed) < 0;
  const seTax = result ? Number(result.selfEmploymentTax) || 0 : 0;

  return (
    <div id="page-tax" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Tax Overview</div>
          <div className="page-subtitle">An educational estimate of your federal taxes</div>
        </div>
      </div>

      {/* Find a CPA — prominent entry at the top of the Taxes section */}
      <div className="card" style={{
        marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        background: "var(--tv-forest)", borderColor: "var(--tv-forest)", color: "#fff",
      }}>
        <i className="ti ti-user-check" style={{ fontSize: 28, color: "var(--tv-gold)" }}></i>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="item-name" style={{ color: "#fff", fontSize: 16 }}>Work with a verified CPA</div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>
            Browse vetted tax professionals, read verified reviews, and connect — right from your taxes.
          </div>
        </div>
        <button className="btn" style={{ background: "#fff", color: "var(--tv-forest)", fontWeight: 600 }}
          onClick={() => navigate("/cpa")}>
          <i className="ti ti-arrow-right"></i> Find a CPA
        </button>
      </div>

      <div className="card home-guide-banner" style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <i className="ti ti-info-circle" style={{ fontSize: 22, color: "var(--tv-forest)" }}></i>
        <div className="item-sub">
          This is an <strong>educational estimate, not tax advice</strong>. It's a simplified federal
          calculation (omits AMT, capital gains, and most credits). For your actual return, connect with a CPA.
        </div>
      </div>

      {/* What you may be able to claim — prominent education panel on top */}
      {guide.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <button type="button" onClick={() => setGuideOpen((o) => !o)}
            style={{ background: "none", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: 0 }}>
            <span className="card-title" style={{ marginBottom: 0 }}>
              <i className="ti ti-checklist" style={{ color: "var(--tv-gold)" }}></i> What you may be able to claim
            </span>
            <i className={`ti ti-chevron-${guideOpen ? "up" : "down"}`} style={{ color: "var(--tv-text-muted)" }}></i>
          </button>
          {guideOpen && (
            <>
              <div className="item-sub" style={{ fontSize: 12.5, marginTop: 4, marginBottom: 12 }}>
                Common federal deductions & credits. Eligibility and limits vary — confirm with a CPA.
              </div>
              <div className="tax-guide-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <GuideColumn title="Deductions — lower your taxable income" items={guide.filter((g) => g.type === "DEDUCTION")} />
                <GuideColumn title="Credits — dollar-for-dollar savings" items={guide.filter((g) => g.type === "CREDIT")} />
              </div>
            </>
          )}
        </div>
      )}

      {/* Upload W-2s / 1099s / 1098s — multi-file, auto-routed into the right fields */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">
          <i className="ti ti-file-upload" style={{ color: "var(--tv-forest)" }}></i> Upload your tax forms
        </div>
        <div className="item-sub" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Drop in one or more forms — W-2, 1099-NEC/MISC/INT/DIV/R, 1098, 1098-E, 1098-T — and we'll read
          the figures and drop each into the right field. Parsed in your session and <strong>never stored</strong>.
          Always double-check the numbers.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
            <i className="ti ti-upload"></i> Choose files
            <input type="file" multiple accept=".txt,.csv,.pdf,image/*" onChange={onDocFiles} style={{ display: "none" }} />
          </label>
          <span className="item-sub" style={{ fontSize: 12 }}>or paste the text from a form:</span>
        </div>
        <textarea className="form-input" rows={3} placeholder="Paste the contents of a W-2 / 1099 / 1098 here…"
          style={{ marginTop: 8, width: "100%", resize: "vertical" }}
          onBlur={(e) => { if (e.target.value.trim()) { onPasteParse(e.target.value); e.target.value = ""; } }} />

        {docBusy && <p className="item-sub" style={{ fontSize: 12 }}><i className="ti ti-loader spin"></i> Reading your document(s)…</p>}
        {docErr && <p className="item-sub" style={{ color: "var(--tv-negative)", fontSize: 12.5 }}><i className="ti ti-alert-triangle"></i> {docErr}</p>}

        {docLog.length > 0 && (
          <div className="card" style={{ background: "var(--tv-sage-pale)", marginTop: 12, padding: 14 }}>
            <div className="form-label" style={{ marginBottom: 8 }}>Extracted from your documents</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {docLog.map((entry, i) => (
                <div key={i} className="item-sub" style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "baseline" }}>
                  <i className={entry.ok ? "ti ti-circle-check" : "ti ti-alert-triangle"}
                     style={{ color: entry.ok ? "var(--tv-positive)" : "var(--tv-negative)" }}></i>
                  <span><strong>{entry.name}</strong> — {entry.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,400px) 1fr", gap: 16, alignItems: "start" }}>
        {/* Inputs */}
        <form className="card" onSubmit={calculate}>
          <div className="card-title">Your figures ({form.year})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Basics — always visible */}
            <div>
              <label className="form-label">Tax year</label>
              <select className="form-select" value={form.year} onChange={set("year")}>
                <option value={2025}>2025</option>
                <option value={2024}>2024</option>
              </select>
            </div>
            <div>
              <label className="form-label">Filing status</label>
              <select className="form-select" value={form.filingStatus} onChange={set("filingStatus")}>
                {FILING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Dependents under 17</label>
              <input className="form-input" type="number" min="0" value={form.dependentsUnder17} onChange={set("dependentsUnder17")} />
            </div>
            <Field label="Federal tax withheld" value={form.withholding} onChange={set("withholding")} placeholder="for refund vs. owed (optional)" />

            {/* Income */}
            <Section title="Income" icon="ti ti-cash" open={openSection.income} onToggle={() => toggleSection("income")}
              helper="Everything you earned this year — we add it up into your gross income.">
              <div>
                <Field label="Wages (W-2)" value={form.wages} onChange={set("wages")} placeholder="from your W-2 (Box 1)" />
                <button type="button" onClick={useSuggestion} disabled={suggesting}
                  style={{ background: "none", color: "var(--tv-forest-light)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "4px 0 0" }}>
                  <i className="ti ti-wand"></i> {suggesting ? "Estimating…" : "Use income from my accounts"}
                </button>
              </div>
              <Field label="Self-employment / 1099 income" value={form.selfEmploymentIncome} onChange={set("selfEmploymentIncome")} placeholder="from your 1099-NEC / 1099-MISC" />
              <Field label="Rental income" value={form.rentalIncome} onChange={set("rentalIncome")} placeholder="net rents you collected" />
              <Field label="Interest income" value={form.interestIncome} onChange={set("interestIncome")} placeholder="from your 1099-INT" />
              <Field label="Dividend income" value={form.dividendIncome} onChange={set("dividendIncome")} placeholder="from your 1099-DIV" />
              <Field label="Retirement income" value={form.retirementIncome} onChange={set("retirementIncome")} placeholder="from your 1099-R" />
              <Field label="Other income" value={form.otherIncome} onChange={set("otherIncome")} placeholder="anything else (optional)" />
            </Section>

            {/* Adjustments */}
            <Section title="Adjustments (above-the-line)" icon="ti ti-arrow-down-circle" open={openSection.adjustments} onToggle={() => toggleSection("adjustments")}
              helper="These lower your taxable income before deductions.">
              <Field label="Student loan interest" value={form.studentLoanInterest} onChange={set("studentLoanInterest")} placeholder="from your 1098-E" />
              <Field label="HSA contribution" value={form.hsaContribution} onChange={set("hsaContribution")} placeholder="your own (non-payroll) HSA deposits" />
              <Field label="IRA contribution" value={form.iraContribution} onChange={set("iraContribution")} placeholder="deductible traditional IRA" />
              <Field label="Other adjustments" value={form.otherAdjustments} onChange={set("otherAdjustments")} placeholder="SE tax deduction, etc. (optional)" />
            </Section>

            {/* Itemized deductions */}
            <Section title="Itemized deductions" icon="ti ti-receipt" open={openSection.itemized} onToggle={() => toggleSection("itemized")}
              helper="We compare these to the standard deduction and use whichever saves more (SALT capped at $10,000).">
              <Field label="Mortgage interest" value={form.mortgageInterest} onChange={set("mortgageInterest")} placeholder="from your 1098" />
              <Field label="Property taxes" value={form.propertyTaxes} onChange={set("propertyTaxes")} placeholder="real-estate taxes you paid" />
              <Field label="State & local income/sales tax" value={form.stateLocalTaxes} onChange={set("stateLocalTaxes")} placeholder="part of the $10k SALT cap" />
              <Field label="Charitable giving" value={form.charitable} onChange={set("charitable")} placeholder="cash & non-cash donations" />
              <Field label="Medical expenses" value={form.medicalExpenses} onChange={set("medicalExpenses")} placeholder="only the part over 7.5% of AGI counts" />
            </Section>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="submit" className="btn btn-primary" disabled={busy} style={{ flex: 1 }}>
                {busy ? "Calculating…" : "Calculate estimate"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={saveProfile} title="Save these figures">
                <i className="ti ti-device-floppy"></i> Save
              </button>
            </div>
            {saved && <p className="item-sub" style={{ color: "var(--tv-positive)", fontSize: 12 }}>{saved}</p>}
            {err && <p className="error" style={{ color: "var(--tv-negative)", fontSize: 13 }}>{err}</p>}
          </div>
        </form>

        {/* Results */}
        <div>
          {!result ? (
            <div className="card empty-state" style={{ padding: 40, textAlign: "center" }}>
              <i className="ti ti-calculator" style={{ fontSize: 34, color: "var(--tv-text-muted)" }}></i>
              <p>Enter your figures and calculate to see your estimate.</p>
            </div>
          ) : (
            <>
              <div className="kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 12 }}>
                <Kpi label="Estimated federal tax" value={usd(result.totalTax)} />
                <Kpi label={owed ? "Estimated balance due" : "Estimated refund"}
                     value={usd(Math.abs(Number(result.refundOrOwed)))}
                     color={owed ? "var(--tv-negative)" : "var(--tv-positive)"} />
                <Kpi label="Effective rate" value={pct(result.effectiveRate)} />
                <Kpi label="Marginal bracket" value={pct(result.marginalRate)} />
              </div>
              <div className="card">
                <div className="card-title">How we got there</div>
                <Row k="Gross income" v={usd(result.grossIncome)} />
                <Row k="Adjusted gross income (AGI)" v={usd(result.agi)} />
                <Row k={`Deduction (${result.deductionType?.toLowerCase()})`} v={`− ${usd(result.deductionUsed)}`} />
                <Row k="Taxable income" v={usd(result.taxableIncome)} bold />
                <Row k="Tax before credits" v={usd(result.taxBeforeCredits)} />
                {Number(result.childTaxCredit) > 0 && <Row k="Child tax credit" v={`− ${usd(result.childTaxCredit)}`} />}
                {seTax > 0 ? (
                  <>
                    <Row k="Income tax" v={usd(result.taxAfterCredits)} />
                    <Row k="Self-employment tax" v={usd(result.selfEmploymentTax)} />
                    <Row k="Total federal tax" v={usd(result.totalTax)} bold />
                  </>
                ) : (
                  <Row k="Estimated federal tax" v={usd(result.totalTax)} bold />
                )}
                <p className="item-sub" style={{ marginTop: 10, fontSize: 11.5 }}>{result.disclaimer}</p>
              </div>

              {result.insights?.length > 0 && (
                <div className="card" style={{ marginTop: 12 }}>
                  <div className="card-title">Ways to understand & lower your taxes</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {result.insights.map((ins, i) => {
                      const s = INSIGHT_STYLE[ins.type] || INSIGHT_STYLE.INFO;
                      return (
                        <div key={i} style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: "var(--radius-md)", background: s.bg }}>
                          <i className={s.icon} style={{ fontSize: 18, color: s.color, marginTop: 1 }}></i>
                          <div>
                            <div className="item-name" style={{ fontSize: 13.5 }}>{ins.title}</div>
                            <div className="item-sub" style={{ fontSize: 12.5 }}>{ins.detail}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="card" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
                <i className="ti ti-user-check" style={{ fontSize: 22, color: "var(--tv-forest)" }}></i>
                <div style={{ flex: 1 }}>
                  <div className="item-name">Want a professional to file this?</div>
                  <div className="item-sub">Connect with a verified CPA from our marketplace.</div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate("/cpa")}>
                  Find a CPA
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            <i className="ti ti-history" style={{ color: "var(--tv-forest)" }}></i> Your tax history
          </div>
          <div className="item-sub" style={{ fontSize: 12.5, marginBottom: 10 }}>
            The latest estimate you ran for each year — see how your effective rate and refund trend over time.
          </div>
          <div className="table-scroll">
            <table className="tv-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Year</th><th>Filing</th>
                  <th style={{ textAlign: "right" }}>AGI</th>
                  <th style={{ textAlign: "right" }}>Federal tax</th>
                  <th style={{ textAlign: "right" }}>Eff. rate</th>
                  <th style={{ textAlign: "right" }}>Refund / Owed</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const refund = Number(h.refundOrOwed) >= 0;
                  return (
                    <tr key={h.taxYear}>
                      <td style={{ fontWeight: 600 }}>{h.taxYear}</td>
                      <td className="item-sub">{FILING.find((f) => f.value === h.filingStatus)?.label || h.filingStatus || "—"}</td>
                      <td style={{ textAlign: "right" }}>{usd(h.agi)}</td>
                      <td style={{ textAlign: "right" }}>{usd(h.totalTax)}</td>
                      <td style={{ textAlign: "right" }}>{pct(h.effectiveRate)}</td>
                      <td style={{ textAlign: "right", color: refund ? "var(--tv-positive)" : "var(--tv-negative)", fontWeight: 600 }}>
                        {refund ? "+" : "−"}{usd(Math.abs(Number(h.refundOrOwed)))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// A collapsible group of form fields, matching the page's guide-panel pattern.
function Section({ title, icon, helper, open, onToggle, children }) {
  return (
    <div style={{ borderTop: "1px solid var(--tv-border)", paddingTop: 12 }}>
      <button type="button" onClick={onToggle}
        style={{ background: "none", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: 0 }}>
        <span className="form-label" style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <i className={icon} style={{ color: "var(--tv-forest)" }}></i> {title}
        </span>
        <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ color: "var(--tv-text-muted)" }}></i>
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
          {helper && <div className="item-sub" style={{ fontSize: 12 }}>{helper}</div>}
          {children}
        </div>
      )}
    </div>
  );
}

function GuideColumn({ title, items }) {
  return (
    <div>
      <div className="form-label" style={{ marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it, i) => (
          <div key={i} style={{ borderLeft: "2px solid var(--tv-sage-light)", paddingLeft: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span className="item-name" style={{ fontSize: 13 }}>{it.name}</span>
              <span className="badge" style={{ fontSize: 9.5, background: "var(--tv-bg)", color: "var(--tv-text-muted)", padding: "1px 6px", borderRadius: 10 }}>{it.category}</span>
            </div>
            <div className="item-sub" style={{ fontSize: 12 }}>{it.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Map a saved tax profile (server shape) onto the form, skipping nulls. Parses the
// categorized fields out of detailsJson so income/adjustments/itemized persist.
function clean(p) {
  const out = {};
  if (p.taxYear != null) out.year = p.taxYear;
  if (p.filingStatus) out.filingStatus = p.filingStatus;
  if (p.dependentsUnder17 != null) out.dependentsUnder17 = p.dependentsUnder17;
  if (p.withholding != null) out.withholding = String(p.withholding);
  if (p.detailsJson) {
    try {
      const details = JSON.parse(p.detailsJson);
      for (const k of CATEGORY_FIELDS) {
        if (details[k] != null) out[k] = String(details[k]);
      }
    } catch { /* ignore malformed json */ }
  }
  return out;
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <input className="form-input" inputMode="decimal" value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div className="card kpi-card" style={{ padding: 16 }}>
      <div className="item-sub" style={{ fontSize: 12 }}>{label}</div>
      <div className="kpi-value" style={{ fontSize: 22, color: color || "var(--tv-text-primary)" }}>{value}</div>
    </div>
  );
}

function Row({ k, v, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--tv-border-light)" }}>
      <span className="item-sub" style={{ fontWeight: bold ? 600 : 400, color: bold ? "var(--tv-text-primary)" : undefined }}>{k}</span>
      <span style={{ fontWeight: bold ? 700 : 500, fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
}
