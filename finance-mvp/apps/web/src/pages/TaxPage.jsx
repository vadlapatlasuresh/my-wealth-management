import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

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

const usd = (v) =>
  v == null ? "—" : Number(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (v) => (v == null ? "—" : `${(Number(v) * 100).toFixed(1)}%`);

/**
 * Tax Overview — an educational federal estimate. Sends the user's figures to the
 * versioned estimator (financial-core) and shows the result. NOT tax advice; ends with a
 * CTA to find a CPA (the marketplace lands in a later phase).
 */
export default function TaxPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    year: 2025,
    filingStatus: "SINGLE",
    grossIncome: "",
    adjustments: "",
    itemizedDeductions: "",
    dependentsUnder17: 0,
    withholding: "",
  });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [guide, setGuide] = useState([]);
  const [guideOpen, setGuideOpen] = useState(true);
  const [doc, setDoc] = useState(null);     // parsed W-2/1099 result
  const [docBusy, setDocBusy] = useState(false);
  const [docErr, setDocErr] = useState("");

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
    return () => { cancelled = true; };
  }, []);

  const calculate = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setErr("");
    try {
      setResult(await api.estimateTax(form));
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
      if (s && s.grossIncome != null) setForm((f) => ({ ...f, grossIncome: String(Math.round(s.grossIncome)) }));
      else setErr("No linked-account deposits to estimate income from yet.");
    } catch {
      /* best-effort */
    } finally {
      setSuggesting(false);
    }
  };

  // Parse a W-2/1099 the user uploads or pastes, and surface the extracted figures.
  const parseText = async (text) => {
    if (!text || !text.trim()) return;
    setDocErr(""); setDoc(null); setDocBusy(true);
    try {
      const r = await api.parseTaxDocument(text);
      setDoc(r);
      if (!r || (r.wages == null && r.federalWithholding == null)) {
        setDocErr(r?.note || "Couldn't read the key figures — try pasting the text, or enter them manually.");
      }
    } catch (e) {
      setDocErr(e?.message || "Couldn't read that document. You can enter the figures manually.");
    } finally {
      setDocBusy(false);
    }
  };

  const onDocFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => parseText(String(reader.result || ""));
    reader.onerror = () => setDocErr("Couldn't open that file — try pasting the text instead.");
    reader.readAsText(file); // best for text/text-based PDFs; images need the live OCR provider
    e.target.value = ""; // allow re-selecting the same file
  };

  // Apply the parsed figures to the estimate form (the user confirms by clicking).
  const applyDoc = () => {
    if (!doc) return;
    setForm((f) => ({
      ...f,
      grossIncome: doc.wages != null ? String(Math.round(doc.wages)) : f.grossIncome,
      withholding: doc.federalWithholding != null ? String(Math.round(doc.federalWithholding)) : f.withholding,
      year: doc.taxYear === 2024 || doc.taxYear === 2025 ? doc.taxYear : f.year,
    }));
    setDoc(null);
    setSaved("Figures from your document were filled in — review, then Calculate.");
  };

  const owed = result && Number(result.refundOrOwed) < 0;

  return (
    <div id="page-tax" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Tax Overview</div>
          <div className="page-subtitle">An educational estimate of your federal taxes</div>
        </div>
      </div>

      <div className="card home-guide-banner" style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <i className="ti ti-info-circle" style={{ fontSize: 22, color: "var(--tv-forest)" }}></i>
        <div className="item-sub">
          This is an <strong>educational estimate, not tax advice</strong>. It's a simplified federal
          calculation (omits AMT, capital gains, self-employment tax, and most credits). For your actual
          return, connect with a CPA.
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

      {/* Upload a W-2 / 1099 to auto-fill income & withholding */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">
          <i className="ti ti-file-upload" style={{ color: "var(--tv-forest)" }}></i> Upload your W-2 or 1099
        </div>
        <div className="item-sub" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Drop in your form and we'll read the wages and federal withholding for you. It's parsed in
          your session and <strong>never stored</strong>. Always double-check the figures.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
            <i className="ti ti-upload"></i> Choose file
            <input type="file" accept=".txt,.csv,.pdf,image/*" onChange={onDocFile} style={{ display: "none" }} />
          </label>
          <span className="item-sub" style={{ fontSize: 12 }}>or paste the text from your form:</span>
        </div>
        <textarea className="form-input" rows={3} placeholder="Paste the contents of your W-2 / 1099 here…"
          style={{ marginTop: 8, width: "100%", resize: "vertical" }}
          onBlur={(e) => e.target.value.trim() && parseText(e.target.value)} />

        {docBusy && <p className="item-sub" style={{ fontSize: 12 }}><i className="ti ti-loader spin"></i> Reading your document…</p>}
        {docErr && <p className="item-sub" style={{ color: "var(--tv-negative)", fontSize: 12.5 }}><i className="ti ti-alert-triangle"></i> {docErr}</p>}

        {doc && (doc.wages != null || doc.federalWithholding != null) && (
          <div className="card" style={{ background: "var(--tv-sage-pale)", marginTop: 12, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div className="item-name" style={{ fontSize: 14 }}>
                  {doc.documentType === "W2" ? "W-2" : doc.documentType === "1099" ? "1099" : "Document"} detected
                  {doc.taxYear ? ` · ${doc.taxYear}` : ""}
                  <span className="badge" style={{ marginLeft: 8, background: "var(--tv-bg)", color: "var(--tv-text-secondary)", fontSize: 10 }}>
                    {Math.round((doc.confidence || 0) * 100)}% confidence
                  </span>
                </div>
                <div className="item-sub" style={{ fontSize: 12.5, marginTop: 4 }}>
                  {doc.wages != null && <span>Wages: <strong>{usd(doc.wages)}</strong></span>}
                  {doc.wages != null && doc.federalWithholding != null && <span> · </span>}
                  {doc.federalWithholding != null && <span>Withheld: <strong>{usd(doc.federalWithholding)}</strong></span>}
                </div>
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={applyDoc}>
                <i className="ti ti-arrow-down-to-arc"></i> Use these figures
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,360px) 1fr", gap: 16, alignItems: "start" }}>
        {/* Inputs */}
        <form className="card" onSubmit={calculate}>
          <div className="card-title">Your figures ({form.year})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
              <Field label="Gross income" value={form.grossIncome} onChange={set("grossIncome")} placeholder="80,000" />
              <button type="button" onClick={useSuggestion} disabled={suggesting}
                style={{ background: "none", color: "var(--tv-forest-light)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "4px 0 0" }}>
                <i className="ti ti-wand"></i> {suggesting ? "Estimating…" : "Use income from my accounts"}
              </button>
            </div>
            <Field label="Above-the-line adjustments" value={form.adjustments} onChange={set("adjustments")} placeholder="HSA, IRA, student loan… (optional)" />
            <Field label="Itemized deductions" value={form.itemizedDeductions} onChange={set("itemizedDeductions")} placeholder="mortgage interest, SALT, charity… (optional)" />
            <div>
              <label className="form-label">Dependents under 17</label>
              <input className="form-input" type="number" min="0" value={form.dependentsUnder17} onChange={set("dependentsUnder17")} />
            </div>
            <Field label="Federal tax withheld" value={form.withholding} onChange={set("withholding")} placeholder="for refund vs. owed (optional)" />
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
                <Kpi label="Estimated federal tax" value={usd(result.taxAfterCredits)} />
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
                <Row k="Estimated federal tax" v={usd(result.taxAfterCredits)} bold />
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

// Map a saved tax profile (server shape) onto the form, skipping nulls.
function clean(p) {
  const out = {};
  if (p.taxYear != null) out.year = p.taxYear;
  if (p.filingStatus) out.filingStatus = p.filingStatus;
  if (p.grossIncome != null) out.grossIncome = String(p.grossIncome);
  if (p.adjustments != null) out.adjustments = String(p.adjustments);
  if (p.itemizedDeductions != null) out.itemizedDeductions = String(p.itemizedDeductions);
  if (p.dependentsUnder17 != null) out.dependentsUnder17 = p.dependentsUnder17;
  if (p.withholding != null) out.withholding = String(p.withholding);
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
