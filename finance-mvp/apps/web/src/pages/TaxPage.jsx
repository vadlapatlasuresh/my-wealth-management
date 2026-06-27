import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { extractPdfText } from "../utils/pdfText";
import { recognizeImage, isOcrableImage } from "../utils/ocr";

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

// Parse any money-ish value to a number.
const numOf = (v) => Number(String(v ?? "").replace(/[^0-9.\-]/g, "")) || 0;
// Small unique id for W-2 rows / document chips.
let _uid = 0;
const uid = () => `id${++_uid}`;

// Household filers derived from filing status. "you"/"spouse" own W-2s; "household" is for shared docs.
const filersFor = (status) => {
  const list = [{ id: "you", name: "You" }];
  if (status === "MARRIED_JOINT" || status === "MARRIED_SEPARATE") list.push({ id: "spouse", name: "Spouse" });
  list.push({ id: "household", name: "Household" });
  return list;
};
const filerName = (filers, id) => (filers.find((f) => f.id === id) || {}).name || "You";

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
  const [ocrStatus, setOcrStatus] = useState(null); // { name, pct } while OCR'ing a photo
  const [history, setHistory] = useState([]); // year-over-year estimate snapshots
  // Joint filing: one W-2 entry per form (per filer); uploaded docs tracked for delete.
  const [w2s, setW2s] = useState([{ id: uid(), filerId: "you", employer: "", wages: "", withholding: "" }]);
  const [docs, setDocs] = useState([]); // { id, fileName, docType, filerId, applied:[{key,amount}], w2Id }

  const filers = filersFor(form.filingStatus);
  const personFilers = filers.filter((f) => f.id !== "household"); // W-2s belong to a person
  const totalW2Wages = w2s.reduce((s, w) => s + numOf(w.wages), 0);
  const totalW2Withholding = w2s.reduce((s, w) => s + numOf(w.withholding), 0);

  // Rental properties (Schedule E): gross rents − expenses − depreciation = net (can be a loss).
  const [rental, setRental] = useState({
    grossRents: "", mortgageInterest: "", propertyTax: "", insurance: "", repairs: "", management: "",
    otherExp: "", costBasis: "", landValue: "", priorCarryforward: "",
  });
  const setR = (k) => (e) => setRental((r) => ({ ...r, [k]: e.target.value }));
  const rentalActive = ["grossRents", "mortgageInterest", "propertyTax", "insurance", "repairs", "management", "otherExp", "costBasis", "priorCarryforward"]
    .some((k) => numOf(rental[k]) > 0);
  const rentalDepreciation = Math.max(0, numOf(rental.costBasis) - numOf(rental.landValue)) / 27.5;
  const rentalExpenses = numOf(rental.mortgageInterest) + numOf(rental.propertyTax) + numOf(rental.insurance)
    + numOf(rental.repairs) + numOf(rental.management) + numOf(rental.otherExp);
  const rentalNet = numOf(rental.grossRents) - rentalExpenses - rentalDepreciation;

  // Passive-activity loss rules with carryforward of suspended (disallowed) losses:
  //  • A current-year loss is deductible against ordinary income up to $25,000/yr (the active-
  //    participation allowance; phases out $100k–$150k AGI). The excess is SUSPENDED and carries
  //    forward.
  //  • Prior suspended losses are released against current-year rental PROFIT (passive income).
  const priorCarryforward = numOf(rental.priorCarryforward);
  let rentalForEstimate, carryforwardUsed = 0, carryforwardAdded = 0;
  if (rentalNet >= 0) {
    carryforwardUsed = Math.min(priorCarryforward, rentalNet); // prior losses offset this year's profit
    rentalForEstimate = rentalNet - carryforwardUsed;
  } else {
    rentalForEstimate = Math.max(rentalNet, -25000);            // deductible loss, capped at $25k
    carryforwardAdded = Math.max(0, -rentalNet - 25000);        // the rest is suspended
  }
  const carryforwardOut = priorCarryforward - carryforwardUsed + carryforwardAdded;

  const [mfs, setMfs] = useState(null); // MFJ-vs-MFS comparison result
  const [mfsBusy, setMfsBusy] = useState(false);

  // Collapsible input sections (Basics always visible; the rest start open).
  const [openSection, setOpenSection] = useState({ income: true, adjustments: true, itemized: true });
  const toggleSection = (k) => setOpenSection((s) => ({ ...s, [k]: !s[k] }));

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // --- W-2 entries ---
  const addW2 = () => setW2s((xs) => [...xs, { id: uid(), filerId: personFilers[0]?.id || "you", employer: "", wages: "", withholding: "" }]);
  const updateW2 = (id, k, v) => setW2s((xs) => xs.map((w) => (w.id === id ? { ...w, [k]: v } : w)));
  const removeW2 = (id) => setW2s((xs) => (xs.length > 1
    ? xs.filter((w) => w.id !== id)
    : xs.map((w) => (w.id === id ? { ...w, employer: "", wages: "", withholding: "" } : w))));
  // Duplicate guard: same filer + employer + wages.
  const isDupW2 = (w) => numOf(w.wages) > 0 && w.employer.trim() &&
    w2s.some((o) => o.id !== w.id && o.filerId === w.filerId && o.employer.trim() === w.employer.trim() && numOf(o.wages) === numOf(w.wages));

  // Filing status: keep filers consistent — reassign spouse data to "you" when not married.
  const onFilingStatusChange = (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, filingStatus: v }));
    if (v !== "MARRIED_JOINT" && v !== "MARRIED_SEPARATE") {
      setW2s((xs) => xs.map((w) => (w.filerId === "spouse" ? { ...w, filerId: "you" } : w)));
      setDocs((ds) => ds.map((d) => (d.filerId === "spouse" ? { ...d, filerId: "you" } : d)));
    }
  };

  // Remove an uploaded document and reverse whatever it applied.
  const removeDoc = (id) => {
    const doc = docs.find((d) => d.id === id);
    if (!doc) return;
    if (doc.w2Id) setW2s((xs) => (xs.length > 1 ? xs.filter((w) => w.id !== doc.w2Id) : xs));
    else if (doc.applied?.length) setForm((f) => {
      const next = { ...f };
      for (const a of doc.applied) next[a.key] = String(Math.max(0, Math.round(numOf(next[a.key]) - numOf(a.amount))));
      return next;
    });
    setDocs((ds) => ds.filter((d) => d.id !== id));
  };
  const retagDoc = (id, filerId) => setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, filerId } : d)));
  const docSummary = (d) => {
    if (d.status === "unreadable") return d.note || "Couldn't read — enter the figures manually.";
    if (d.w2Id) {
      const w = w2s.find((x) => x.id === d.w2Id);
      return w ? `Wages ${usd(numOf(w.wages))}${numOf(w.withholding) ? ` · Withheld ${usd(numOf(w.withholding))}` : ""} → applied` : "W-2 removed";
    }
    if (d.applied?.length) return `${d.applied.map((a) => `${FIELD_LABELS[a.key] || a.key} ${usd(a.amount)}`).join(" · ")} → applied`;
    if (d.note) return d.note;
    return "applied";
  };

  // Estimator/profile payload: W-2s summed into wages/withholding; rental net from the worksheet;
  // collections sent for persistence.
  const buildPayload = () => ({
    ...form,
    wages: String(totalW2Wages),
    withholding: String(totalW2Withholding + numOf(form.withholding)),
    rentalIncome: rentalActive ? String(Math.round(rentalForEstimate)) : form.rentalIncome,
    w2s: w2s.filter((w) => numOf(w.wages) > 0 || w.employer.trim()).map((w) => ({
      filerId: w.filerId, employer: w.employer.trim(), wages: numOf(w.wages), federalWithholding: numOf(w.withholding),
    })),
    filers,
    documents: docs.map((d) => ({ fileName: d.fileName, docType: d.docType, filerId: d.filerId })),
    rental: rentalActive ? rental : undefined,
  });

  const spouseHasIncome = w2s.some((w) => w.filerId === "spouse" && numOf(w.wages) > 0);

  // Compare Married-Filing-Jointly vs Married-Filing-Separately (what-if; not saved to history).
  // MFS split: each spouse keeps their own W-2; all shared items (other income, deductions,
  // dependents) are assigned to the primary filer — a reasonable illustrative split.
  const compareFilingStatus = async () => {
    setMfsBusy(true);
    try {
      const base = buildPayload();
      const sum = (id, k) => w2s.filter((w) => w.filerId === id).reduce((s, w) => s + numOf(w[k]), 0);
      const joint = await api.estimateTaxPreview({ ...base, filingStatus: "MARRIED_JOINT" });
      const youSep = await api.estimateTaxPreview({
        ...base, filingStatus: "MARRIED_SEPARATE",
        wages: String(sum("you", "wages")),
        withholding: String(sum("you", "withholding") + numOf(form.withholding)),
      });
      const spouseSep = await api.estimateTaxPreview({
        year: form.year, filingStatus: "MARRIED_SEPARATE",
        wages: String(sum("spouse", "wages")), withholding: String(sum("spouse", "withholding")),
      });
      setMfs({
        joint: Number(joint.totalTax) || 0,
        you: Number(youSep.totalTax) || 0,
        spouse: Number(spouseSep.totalTax) || 0,
        sepTotal: (Number(youSep.totalTax) || 0) + (Number(spouseSep.totalTax) || 0),
      });
    } catch { setMfs(null); }
    finally { setMfsBusy(false); }
  };

  // Load a previously saved profile (404 = none yet) + the deductions/credits guide.
  useEffect(() => {
    let cancelled = false;
    api.getTaxProfile()
      .then((p) => {
        if (cancelled || !p) return;
        setForm((f) => ({ ...f, ...clean(p) }));
        // Restore saved W-2 entries (the source of truth for wages); documents stay session-scoped.
        if (p.detailsJson) {
          try {
            const d = JSON.parse(p.detailsJson);
            if (Array.isArray(d.w2s) && d.w2s.length) {
              setW2s(d.w2s.map((w) => ({
                id: uid(), filerId: w.filerId || "you", employer: w.employer || "",
                wages: w.wages != null ? String(w.wages) : "",
                withholding: w.federalWithholding != null ? String(w.federalWithholding) : "",
              })));
            }
            if (d.rental && typeof d.rental === "object") {
              setRental((r) => ({ ...r, ...Object.fromEntries(Object.entries(d.rental).map(([k, v]) => [k, v == null ? "" : String(v)])) }));
            }
          } catch { /* ignore malformed json */ }
        }
      })
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
      setResult(await api.estimateTax(buildPayload()));
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
      await api.saveTaxProfile(buildPayload());
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
      if (s && s.grossIncome != null) {
        const v = String(Math.round(s.grossIncome));
        setW2s((xs) => (xs.length ? xs.map((w, i) => (i === 0 ? { ...w, wages: v } : w)) : [{ id: uid(), filerId: "you", employer: "", wages: v, withholding: "" }]));
      } else setErr("No linked-account deposits to estimate income from yet.");
    } catch {
      /* best-effort */
    } finally {
      setSuggesting(false);
    }
  };

  // Parse a single document's text, route each extracted field into the form, and
  // return a short summary line for the extraction log (or null if nothing landed).
  const parseAndRoute = async (payload, fileName) => {
    const p = typeof payload === "string" ? { text: payload } : (payload || {});
    if (!p.text?.trim() && !p.contentBase64) return null;
    const r = await api.parseTaxDocument(p);
    const fields = Array.isArray(r?.fields) ? r.fields : [];
    const docType = r?.documentType || "UNKNOWN";
    if (r?.taxYear === 2024 || r?.taxYear === 2025) setForm((f) => ({ ...f, year: r.taxYear }));
    const get = (k) => { const f = fields.find((x) => x.key === k); return f ? numOf(f.amount) : 0; };

    // A W-2 becomes its own W-2 entry (tagged to the primary filer; the user can re-tag it).
    if (docType === "W2") {
      const wages = get("wages"), wh = get("withholding");
      if (wages > 0 || wh > 0) {
        const w2Id = uid();
        setW2s((xs) => {
          const entry = { id: w2Id, filerId: "you", employer: "", wages: String(Math.round(wages)), withholding: String(Math.round(wh)) };
          const blankIdx = xs.findIndex((w) => !numOf(w.wages) && !numOf(w.withholding) && !w.employer.trim());
          if (blankIdx >= 0) { const copy = [...xs]; copy[blankIdx] = entry; return copy; }
          return [...xs, entry];
        });
        setDocs((ds) => [{ id: uid(), fileName, docType, filerId: "you", w2Id, status: "ok" }, ...ds]);
        return { ok: true };
      }
    }

    // Any other form routes its figures into the matching category fields.
    const applied = [];
    const notes = [];
    for (const fld of fields) {
      if (fld == null || fld.amount == null) continue;
      const key = fld.key;
      if (key === "tuition") { notes.push(`Tuition ${usd(fld.amount)} — you may qualify for an education credit`); continue; }
      if (key === "withholding" || CATEGORY_FIELDS.includes(key)) {
        applied.push({ key, label: FIELD_LABELS[key] || fld.label || key, amount: fld.amount });
      }
    }
    if (applied.length) setForm((f) => {
      const next = { ...f };
      for (const a of applied) next[a.key] = addAmount(next[a.key], a.amount);
      return next;
    });

    const docLabel = DOC_LABELS[docType] || "Document";
    // Always show the file in the manager — even when we couldn't read it — so nothing silently vanishes.
    if (!applied.length && !notes.length) {
      setDocs((ds) => [{ id: uid(), fileName, docType, filerId: "you", applied: [], status: "unreadable",
        note: `Couldn't read figures from this ${docLabel} — enter them manually below, or delete it.` }, ...ds]);
      return { ok: false };
    }
    setDocs((ds) => [{ id: uid(), fileName, docType, filerId: docType === "1098" ? "household" : "you",
      applied, note: notes.join("; ") || null, status: "ok" }, ...ds]);
    return { ok: true };
  };

  // Best-effort text from a file (never throws). PDFs → pdf.js text; images → client-side OCR
  // (tesseract.js) so a photo/scan of a W-2 extracts without any cloud OCR; text/CSV → raw. The
  // raw bytes are always sent too, so the backend can still use Textract when configured.
  const safeText = async (file) => {
    const type = file.type || "";
    const name = (file.name || "").toLowerCase();
    try {
      if (type === "application/pdf" || name.endsWith(".pdf")) return await extractPdfText(file);
      if (isOcrableImage(file)) {
        setOcrStatus({ name: file.name, pct: 0 });
        const text = await recognizeImage(file, (p) =>
          setOcrStatus({ name: file.name, pct: Math.round((p || 0) * 100) }));
        setOcrStatus(null);
        return text;
      }
      return await file.text();
    } catch { setOcrStatus(null); return ""; }
  };

  // Read a file as a base64 data URL (so the backend can hand the bytes to Textract). Skips very
  // large files to keep the request small — those rely on the text path.
  const fileToBase64 = (file) =>
    new Promise((resolve) => {
      if (!file || file.size > 8 * 1024 * 1024) return resolve("");
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });

  // Multi-file uploader: read text + bytes, parse + route each selected file independently.
  const onDocFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = ""; // allow re-selecting the same files
    setDocErr("");
    setDocBusy(true);
    // Each file is handled independently — one tricky file must never block the rest.
    for (const file of files) {
      try {
        const [text, contentBase64] = await Promise.all([safeText(file), fileToBase64(file)]);
        const entry = await parseAndRoute({ text, contentBase64, contentType: file.type, filename: file.name }, file.name);
        if (entry == null) {
          // Nothing readable at all — still list the file so it's never lost.
          setDocs((ds) => [{ id: uid(), fileName: file.name, docType: "UNKNOWN", filerId: "you", applied: [],
            status: "unreadable", note: "Couldn't read this file — enter the figures manually." }, ...ds]);
        }
      } catch (e2) {
        setDocs((ds) => [{ id: uid(), fileName: file.name, docType: "UNKNOWN", filerId: "you", applied: [],
          status: "unreadable", note: e2?.message || "Couldn't read this file — enter the figures manually." }, ...ds]);
      }
    }
    setDocBusy(false);
    setSaved("Files added — review the figures (some may need manual entry), then Calculate.");
  };

  // Paste-text box: parse + route the same way as an uploaded file.
  const onPasteParse = async (text) => {
    if (!text || !text.trim()) return;
    setDocErr("");
    setDocBusy(true);
    try {
      const entry = await parseAndRoute(text, "Pasted text");
      if (entry && !entry.ok) setDocErr("Couldn't read the key figures — try the form fields below.");
      else if (entry?.ok) setSaved("Figures were filled in — review, then Calculate.");
    } catch (e2) {
      setDocErr(e2?.message || "Couldn't read that text.");
    } finally {
      setDocBusy(false);
    }
  };

  const owed = result && Number(result.refundOrOwed) < 0;
  const seTax = result ? Number(result.selfEmploymentTax) || 0 : 0;
  // The shown estimate (and the history row) reflect the LAST calculation — flag when the
  // filing status has changed since, so the user knows to recalculate.
  const filingChangedSinceCalc = result && result.filingStatus && result.filingStatus !== form.filingStatus;

  // Quarterly estimated taxes: cover the projected balance due when income isn't withheld.
  const quarterlyShortfall = result ? Math.max(0, Number(result.totalTax) - Number(result.withholding)) : 0;
  const hasUnwithheldIncome = numOf(form.selfEmploymentIncome) > 0 || rentalNet > 0;
  const showQuarterly = result && quarterlyShortfall > 1000 && hasUnwithheldIncome;
  const quarterlyAmount = Math.ceil(quarterlyShortfall / 4 / 25) * 25;

  // CPA-style "maximize your refund" suggestions — personalized + dollar-quantified from the inputs.
  const refundTips = () => {
    if (!result) return [];
    const tips = [];
    const marginal = Number(result.marginalRate) || 0;
    const joint = form.filingStatus === "MARRIED_JOINT";
    // 1) Rental depreciation — the biggest commonly-missed write-off.
    if (rentalActive && numOf(rental.grossRents) > 0 && rentalDepreciation === 0) {
      tips.push({ pri: 1, icon: "ti ti-building-estate", title: "Claim rental depreciation",
        detail: "Enter your property's cost basis (minus land) in the rental worksheet — you can depreciate the building over 27.5 years. It's often a landlord's single biggest deduction." });
    }
    // 1b) Suspended rental losses carrying forward.
    if (carryforwardOut > 0) {
      tips.push({ pri: 2, icon: "ti ti-clock-dollar", title: "Track your suspended rental losses",
        detail: `${usd(carryforwardOut)} of rental loss is suspended and carries to next year — it offsets future rental profit, or releases in full when you sell the property. Don't lose track of it.` });
    }
    // 2) QBI win (auto-applied when there's qualified income).
    if (Number(result.qbiDeduction) > 0) {
      tips.push({ pri: 3, icon: "ti ti-discount", title: "20% QBI deduction applied",
        detail: `You're getting a ${usd(result.qbiDeduction)} qualified-business-income deduction on your rental/self-employment income — already reflected above.` });
    }
    // 3) Retirement maxing — quantified at the marginal rate.
    if (marginal >= 0.12 && numOf(form.iraContribution) + numOf(form.hsaContribution) < 5000) {
      tips.push({ pri: 2, icon: "ti ti-pig-money", title: "Max out tax-advantaged accounts",
        detail: `Every $1,000 you defer into a pre-tax 401(k)/traditional IRA/HSA cuts your tax by about ${usd(1000 * marginal)} at your ${pct(marginal)} bracket.${joint ? " A couple can defer up to ~$47,000 across two 401(k)s." : ""}` });
    }
    // 4) Dependent care credit.
    if (Number(form.dependentsUnder17) > 0) {
      tips.push({ pri: 3, icon: "ti ti-baby-carriage", title: "Child & Dependent Care Credit",
        detail: "If you pay for daycare/after-care so you can work, you can claim 20–35% of up to $6,000 of expenses (two+ kids) — worth up to ~$1,200." });
    }
    // 5) Estimated payments for un-withheld income.
    if (owed && (rentalNet > 0 || numOf(form.selfEmploymentIncome) > 0)) {
      tips.push({ pri: 2, icon: "ti ti-calendar-dollar", title: "Make quarterly estimated payments",
        detail: "Rental and 1099 income isn't withheld, so a balance due can trigger an underpayment penalty. Pay 1040-ES quarterly (Apr/Jun/Sep/Jan) to stay safe." });
    }
    // 6) Energy / EV credits (general but high-value).
    tips.push({ pri: 4, icon: "ti ti-bolt", title: "Home energy & EV credits",
      detail: "Solar, batteries or a heat pump → 30% back (Residential Clean Energy Credit). New/used clean vehicle → up to $7,500 / $4,000." });
    return tips.sort((a, b) => a.pri - b.pri).slice(0, 6);
  };

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
          Drop in one or more forms for everyone in your household — W-2, 1099-NEC/MISC/INT/DIV/R, 1098,
          1098-E, 1098-T. PDFs, <strong>photos and screenshots</strong> all work — images are read with
          on-device OCR. Each W-2 becomes its own entry; tag every file to a filer and delete any to
          remove its figures. Parsed in your session and <strong>never stored</strong>.
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

        {ocrStatus ? (
          <p className="item-sub" style={{ fontSize: 12 }}>
            <i className="ti ti-loader spin"></i> Reading photo <strong>{ocrStatus.name}</strong> with on-device OCR… {ocrStatus.pct}%
          </p>
        ) : docBusy ? (
          <p className="item-sub" style={{ fontSize: 12 }}><i className="ti ti-loader spin"></i> Reading your document(s)…</p>
        ) : null}
        {docErr && <p className="item-sub" style={{ color: "var(--tv-negative)", fontSize: 12.5 }}><i className="ti ti-alert-triangle"></i> {docErr}</p>}

        {docs.length > 0 && (
          <div className="card" style={{ background: "var(--tv-sage-pale)", marginTop: 12, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div className="form-label" style={{ marginBottom: 0 }}>Your documents <span className="badge badge-gray">{docs.length}</span></div>
              <span className="item-sub" style={{ fontSize: 11 }}>Tag each to a filer · delete removes its figures</span>
            </div>
            {filers.map((flr) => {
              const group = docs.filter((d) => d.filerId === flr.id);
              if (!group.length) return null;
              return (
                <div key={flr.id} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--tv-forest)", margin: "2px 0 6px" }}>
                    <i className={flr.id === "household" ? "ti ti-home" : "ti ti-user"}></i> {flr.name}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {group.map((d) => (
                      <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--tv-card)", border: `1px solid ${d.status === "unreadable" ? "var(--tv-negative)" : "var(--tv-border)"}`, borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
                        <i className={d.status === "unreadable" ? "ti ti-alert-triangle" : "ti ti-file-text"} style={{ color: d.status === "unreadable" ? "var(--tv-negative)" : "var(--tv-forest)" }}></i>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="item-name" style={{ fontSize: 12.5 }}>{d.fileName} <span className="badge badge-gray">{DOC_LABELS[d.docType] || d.docType}</span></div>
                          <div className="item-sub" style={{ fontSize: 11.5, color: d.status === "unreadable" ? "var(--tv-negative)" : undefined }}>{docSummary(d)}</div>
                        </div>
                        <select className="form-select" style={{ maxWidth: 104, fontSize: 12, padding: "4px 8px" }} value={d.filerId} onChange={(e) => retagDoc(d.id, e.target.value)}>
                          {filers.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <button type="button" className="btn btn-secondary btn-sm" title="Delete file" style={{ color: "var(--tv-negative)", padding: "4px 8px" }} onClick={() => removeDoc(d.id)}>
                          <i className="ti ti-trash"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
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
              <select className="form-select" value={form.filingStatus} onChange={onFilingStatusChange}>
                {FILING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Dependents under 17</label>
              <input className="form-input" type="number" min="0" value={form.dependentsUnder17} onChange={set("dependentsUnder17")} />
            </div>
            <Field label="Other federal withholding (non-W-2)" value={form.withholding} onChange={set("withholding")} placeholder="1099-R, estimated payments… (W-2 withholding comes from your W-2s)" />

            {/* Income */}
            <Section title="Income" icon="ti ti-cash" open={openSection.income} onToggle={() => toggleSection("income")}
              helper="Everything you earned this year — we add it up into your gross income.">
              {/* W-2 wages — one entry per W-2 (per filer); combined for joint returns */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>W-2 wages</label>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ padding: "3px 8px", fontSize: 11.5 }} onClick={addW2}>
                    <i className="ti ti-plus"></i> Add W-2
                  </button>
                </div>
                {w2s.map((w) => (
                  <div key={w.id} style={{ border: `1px solid ${isDupW2(w) ? "var(--tv-negative)" : "var(--tv-border)"}`, borderRadius: "var(--radius-md)", padding: 8, marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <select className="form-select" style={{ maxWidth: 104, fontSize: 12, padding: "4px 8px" }}
                        value={w.filerId} onChange={(e) => updateW2(w.id, "filerId", e.target.value)}>
                        {personFilers.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                      <input className="form-input" style={{ flex: 1, padding: "5px 8px" }} placeholder="Employer"
                        value={w.employer} onChange={(e) => updateW2(w.id, "employer", e.target.value)} />
                      <button type="button" className="btn btn-secondary btn-sm" title="Remove W-2"
                        style={{ color: "var(--tv-negative)", padding: "4px 8px" }} onClick={() => removeW2(w.id)}>
                        <i className="ti ti-x"></i>
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <input className="form-input" style={{ padding: "5px 8px" }} inputMode="decimal" placeholder="Wages (Box 1)"
                        value={w.wages} onChange={(e) => updateW2(w.id, "wages", e.target.value)} />
                      <input className="form-input" style={{ padding: "5px 8px" }} inputMode="decimal" placeholder="Withheld (Box 2)"
                        value={w.withholding} onChange={(e) => updateW2(w.id, "withholding", e.target.value)} />
                    </div>
                    {isDupW2(w) && <div className="item-sub" style={{ fontSize: 11, color: "var(--tv-negative)", marginTop: 4 }}><i className="ti ti-alert-triangle"></i> Looks like a duplicate of another W-2.</div>}
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "5px 2px 0", borderTop: "1px dashed var(--tv-border)" }}>
                  <span className="item-sub">Combined wages · withheld ({w2s.length} W-2{w2s.length === 1 ? "" : "s"})</span>
                  <span style={{ fontWeight: 700 }}>{usd(totalW2Wages)} · {usd(totalW2Withholding)}</span>
                </div>
                {form.filingStatus === "MARRIED_JOINT" && totalW2Wages > 0 && !w2s.some((w) => w.filerId === "spouse" && numOf(w.wages) > 0) && (
                  <div className="item-sub" style={{ fontSize: 11.5, color: "var(--tv-gold)", marginTop: 6 }}>
                    <i className="ti ti-info-circle"></i> Filing jointly — add your spouse's W-2s (tag them “Spouse”), or switch filing status.
                  </div>
                )}
                <button type="button" onClick={useSuggestion} disabled={suggesting}
                  style={{ background: "none", color: "var(--tv-forest-light)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "6px 0 0" }}>
                  <i className="ti ti-wand"></i> {suggesting ? "Estimating…" : "Use income from my accounts"}
                </button>
              </div>
              <Field label="Self-employment / 1099 income" value={form.selfEmploymentIncome} onChange={set("selfEmploymentIncome")} placeholder="from your 1099-NEC / 1099-MISC" />
              {/* Rental properties — Schedule E worksheet with depreciation */}
              <div style={{ border: "1px solid var(--tv-border)", borderRadius: "var(--radius-md)", padding: 10 }}>
                <button type="button" onClick={() => toggleSection("rental")}
                  style={{ background: "none", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: 0 }}>
                  <span className="form-label" style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: 6 }}>
                    <i className="ti ti-building-estate" style={{ color: "var(--tv-forest)" }}></i> Rental properties (Schedule E)
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {rentalActive && <span className="item-sub" style={{ fontSize: 12, fontWeight: 700, color: rentalNet < 0 ? "var(--tv-positive)" : "var(--tv-text-primary)" }}>{usd(rentalNet)}</span>}
                    <i className={`ti ti-chevron-${openSection.rental ? "up" : "down"}`} style={{ color: "var(--tv-text-muted)" }}></i>
                  </span>
                </button>
                {openSection.rental && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                    <div className="item-sub" style={{ fontSize: 11.5 }}>Capture rents, expenses and depreciation — most landlords leave depreciation (often the biggest write-off) on the table.</div>
                    <Field label="Gross rents collected" value={rental.grossRents} onChange={setR("grossRents")} placeholder="total rent received" />
                    <div className="form-label" style={{ marginBottom: 0, marginTop: 4 }}>Expenses</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <Field label="Mortgage interest" value={rental.mortgageInterest} onChange={setR("mortgageInterest")} placeholder="rental loan" />
                      <Field label="Property tax" value={rental.propertyTax} onChange={setR("propertyTax")} placeholder="on the rental" />
                      <Field label="Insurance" value={rental.insurance} onChange={setR("insurance")} placeholder="landlord policy" />
                      <Field label="Repairs & maintenance" value={rental.repairs} onChange={setR("repairs")} placeholder="" />
                      <Field label="Management & fees" value={rental.management} onChange={setR("management")} placeholder="PM, HOA, legal" />
                      <Field label="Other expenses" value={rental.otherExp} onChange={setR("otherExp")} placeholder="utilities, travel…" />
                    </div>
                    <div className="form-label" style={{ marginBottom: 0, marginTop: 4 }}>Depreciation <span style={{ fontWeight: 400, color: "var(--tv-text-muted)" }}>(building cost ÷ 27.5 yrs)</span></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <Field label="Property cost basis" value={rental.costBasis} onChange={setR("costBasis")} placeholder="purchase + improvements" />
                      <Field label="Land value" value={rental.landValue} onChange={setR("landValue")} placeholder="not depreciable" />
                    </div>
                    <Field label="Prior-year suspended loss (carryforward)" value={rental.priorCarryforward} onChange={setR("priorCarryforward")} placeholder="disallowed loss from last year, if any" />
                    {rentalActive && (
                      <div style={{ background: "var(--tv-sage-pale)", borderRadius: "var(--radius-md)", padding: 10, fontSize: 12.5 }}>
                        <Row k="Gross rents" v={usd(numOf(rental.grossRents))} />
                        <Row k="− Expenses" v={usd(rentalExpenses)} />
                        <Row k="− Depreciation" v={usd(rentalDepreciation)} />
                        <Row k="Net rental income/loss" v={usd(rentalNet)} bold />
                        {carryforwardUsed > 0 && <Row k="− Prior suspended loss used" v={`− ${usd(carryforwardUsed)}`} />}
                        {(carryforwardUsed > 0 || carryforwardAdded > 0 || rentalForEstimate !== rentalNet) && (
                          <Row k="Counted in this estimate" v={usd(rentalForEstimate)} bold />
                        )}
                        {carryforwardOut > 0 && (
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--tv-border-light)" }}>
                            <Row k="Suspended loss carried to next year" v={usd(carryforwardOut)} bold />
                            <div className="item-sub" style={{ fontSize: 11, marginTop: 4 }}>
                              Enter this as next year's prior carryforward. Suspended losses are released against future rental profit, or in full when you sell the property.
                            </div>
                          </div>
                        )}
                        {rentalNet < 0 && carryforwardAdded === 0 && (
                          <div className="item-sub" style={{ fontSize: 11, marginTop: 4 }}>
                            Active-participation losses are deductible up to $25,000/yr (phasing out $100k–$150k AGI).
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
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
              {filingChangedSinceCalc && (
                <div className="card" style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center", borderColor: "var(--tv-gold)", background: "var(--tv-gold-pale)" }}>
                  <i className="ti ti-refresh" style={{ color: "var(--tv-gold)", fontSize: 18 }}></i>
                  <div className="item-sub" style={{ fontSize: 12.5 }}>
                    This estimate (and your tax history) was calculated as <strong>{FILING.find((f) => f.value === result.filingStatus)?.label || result.filingStatus}</strong>. You changed it to <strong>{FILING.find((f) => f.value === form.filingStatus)?.label || form.filingStatus}</strong> — recalculate to update both.
                  </div>
                </div>
              )}

              <div className="kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 12 }}>
                <Kpi label="Estimated federal tax" value={usd(result.totalTax)} />
                <Kpi label={owed ? "Estimated balance due" : "Estimated refund"}
                     value={usd(Math.abs(Number(result.refundOrOwed)))}
                     color={owed ? "var(--tv-negative)" : "var(--tv-positive)"} />
                <Kpi label="Effective rate" value={pct(result.effectiveRate)} />
                <Kpi label="Marginal bracket" value={pct(result.marginalRate)} />
              </div>
              {w2s.some((w) => numOf(w.wages) > 0 || numOf(w.withholding) > 0) && (
                <div className="card" style={{ marginBottom: 12 }}>
                  <div className="card-title"><i className="ti ti-users" style={{ color: "var(--tv-forest)" }}></i> Income by W-2</div>
                  <div className="table-scroll">
                    <table className="tv-table" style={{ width: "100%" }}>
                      <thead><tr><th>Filer</th><th>Employer</th><th style={{ textAlign: "right" }}>Wages</th><th style={{ textAlign: "right" }}>Fed. tax withheld</th></tr></thead>
                      <tbody>
                        {w2s.filter((w) => numOf(w.wages) > 0 || numOf(w.withholding) > 0).map((w) => (
                          <tr key={w.id}>
                            <td>{filerName(filers, w.filerId)}</td>
                            <td className="item-sub">{w.employer || "—"}</td>
                            <td style={{ textAlign: "right" }}>{usd(numOf(w.wages))}</td>
                            <td style={{ textAlign: "right" }}>{usd(numOf(w.withholding))}</td>
                          </tr>
                        ))}
                        <tr style={{ fontWeight: 700 }}>
                          <td>Combined</td><td></td>
                          <td style={{ textAlign: "right" }}>{usd(totalW2Wages)}</td>
                          <td style={{ textAlign: "right" }}>{usd(totalW2Withholding)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {(() => {
                    const byFiler = personFilers
                      .map((f) => ({ name: f.name, wages: w2s.filter((w) => w.filerId === f.id).reduce((s, w) => s + numOf(w.wages), 0) }))
                      .filter((x) => x.wages > 0);
                    if (form.filingStatus !== "MARRIED_JOINT" || byFiler.length < 2 || totalW2Wages <= 0) return null;
                    const tot = Number(result.totalTax) || 0;
                    return (
                      <div className="item-sub" style={{ fontSize: 12, marginTop: 8 }}>
                        <strong>Approximate</strong> share of the {usd(tot)} total tax, by income: {byFiler.map((x) => `${x.name} ${usd(tot * x.wages / totalW2Wages)}`).join(" · ")}
                        <div style={{ fontSize: 11, color: "var(--tv-text-muted)", marginTop: 2 }}>Joint tax is figured on combined income — this split is illustrative only. The "withheld" column is each W-2's actual Box 2.</div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="card">
                <div className="card-title">How we got there</div>
                <Row k="Gross income" v={usd(result.grossIncome)} />
                <Row k="Adjusted gross income (AGI)" v={usd(result.agi)} />
                <Row k={`Deduction (${result.deductionType?.toLowerCase()})`} v={`− ${usd(result.deductionUsed)}`} />
                {Number(result.qbiDeduction) > 0 && <Row k="QBI deduction (20% · §199A)" v={`− ${usd(result.qbiDeduction)}`} />}
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

              {/* Maximize your refund — personalized, quantified next steps */}
              {refundTips().length > 0 && (
                <div className="card" style={{ marginTop: 12, borderColor: "var(--tv-gold)" }}>
                  <div className="card-title">
                    <i className="ti ti-rosette-discount-check" style={{ color: "var(--tv-gold)" }}></i> Ways to maximize your refund
                  </div>
                  <div className="item-sub" style={{ fontSize: 12, marginBottom: 10 }}>Tailored to what you entered. Talk to a CPA before acting.</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {refundTips().map((t, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--tv-gold-pale)" }}>
                        <i className={t.icon} style={{ fontSize: 18, color: "var(--tv-gold)", marginTop: 1 }}></i>
                        <div>
                          <div className="item-name" style={{ fontSize: 13.5 }}>{t.title}</div>
                          <div className="item-sub" style={{ fontSize: 12.5 }}>{t.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quarterly estimated-tax calculator (un-withheld rental/1099 income) */}
              {showQuarterly && (
                <div className="card" style={{ marginTop: 12 }}>
                  <div className="card-title"><i className="ti ti-calendar-dollar" style={{ color: "var(--tv-forest)" }}></i> Quarterly estimated taxes</div>
                  <div className="item-sub" style={{ fontSize: 12.5, marginBottom: 8 }}>
                    You're projected to owe <strong>{usd(quarterlyShortfall)}</strong> that isn't covered by withholding. Rental/1099 income has no withholding, so paying quarterly (Form 1040-ES) avoids an underpayment penalty.
                  </div>
                  <div className="kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                    <Kpi label="Pay each quarter" value={usd(quarterlyAmount)} />
                    <Kpi label="Annual (4 payments)" value={usd(quarterlyAmount * 4)} />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {["Apr 15", "Jun 16", "Sep 15", "Jan 15"].map((d) => (
                      <Row key={d} k={`Due ${d}`} v={usd(quarterlyAmount)} />
                    ))}
                  </div>
                  <div className="item-sub" style={{ fontSize: 11, marginTop: 6 }}>Safe harbor: you avoid a penalty if you pay 90% of this year's tax, or 100% of last year's (110% if AGI &gt; $150k).</div>
                </div>
              )}

              {/* Married filing jointly vs separately — what-if comparison */}
              {form.filingStatus === "MARRIED_JOINT" && spouseHasIncome && (
                <div className="card" style={{ marginTop: 12 }}>
                  <div className="card-title"><i className="ti ti-arrows-split" style={{ color: "var(--tv-forest)" }}></i> Jointly vs separately</div>
                  {!mfs ? (
                    <>
                      <div className="item-sub" style={{ fontSize: 12.5, marginBottom: 8 }}>See whether filing separately would cost you more or less. (Jointly is usually better, but worth checking.)</div>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={mfsBusy} onClick={compareFilingStatus}>
                        {mfsBusy ? "Comparing…" : "Compare jointly vs separately"}
                      </button>
                    </>
                  ) : (
                    <>
                      <Row k="Married filing jointly — total tax" v={usd(mfs.joint)} bold />
                      <Row k="Filing separately — you" v={usd(mfs.you)} />
                      <Row k="Filing separately — spouse" v={usd(mfs.spouse)} />
                      <Row k="Filing separately — combined" v={usd(mfs.sepTotal)} bold />
                      <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--tv-sage-pale)", fontSize: 13 }}>
                        {mfs.sepTotal >= mfs.joint
                          ? <span><i className="ti ti-check" style={{ color: "var(--tv-positive)" }}></i> <strong>Filing jointly saves you {usd(mfs.sepTotal - mfs.joint)}.</strong> Stay joint.</span>
                          : <span><i className="ti ti-info-circle" style={{ color: "var(--tv-gold)" }}></i> <strong>Filing separately could save {usd(mfs.joint - mfs.sepTotal)}</strong> — rare, but worth confirming with a CPA (it can affect credits, IRAs and student-loan plans).</span>}
                      </div>
                      <div className="item-sub" style={{ fontSize: 11, marginTop: 6 }}>Illustrative split: each spouse keeps their own W-2; shared income & deductions go to the primary filer.</div>
                    </>
                  )}
                </div>
              )}

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
