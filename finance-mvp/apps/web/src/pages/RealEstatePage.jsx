import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { currency, formatDate } from "../utils/format";
import { api } from "../api";
import AddressAutocomplete from "../components/AddressAutocomplete";
import LastRefreshed from "../components/LastRefreshed";
import Disclaimer from "../components/Disclaimer";

// Normalize a property from the API (which may use value/mortgage or currentValue/loanBalance)
function normalize(p) {
  const currentValue = p.currentValue ?? p.value ?? 0;
  const loanBalance = p.loanBalance ?? p.mortgage ?? p.mortgageBalance ?? 0;
  const equity = p.equity ?? currentValue - loanBalance;
  return {
    ...p,
    currentValue,
    loanBalance,
    equity,
    type: p.type ?? p.propertyType ?? "",
    appreciation: p.purchasePrice ? currentValue - p.purchasePrice : 0,
  };
}

function extractList(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.items)) return res.items;
  return [];
}

const TYPE_LABELS = {
  PRIMARY_RESIDENCE: "Primary",
  RENTAL_PROPERTY: "Rental",
  LAND: "Land",
};

export default function RealEstatePage({ properties = [] }) {
  const [props, setProps] = useState(() => properties.map(normalize));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null); // non-null = editing that property
  const [revaluingId, setRevaluingId] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const emptyForm = {
    address: "",
    propertyType: "PRIMARY_RESIDENCE",
    purchasePrice: "",
    currentValue: "",
    mortgageBalance: "",
    beds: "",
    baths: "",
    sqft: "",
    yearBuilt: "",
    rentEstimate: "",
    // Financing & monthly carrying costs
    apr: "",
    monthlyPayment: "",
    monthlyTax: "",
    monthlyInsurance: "",
    monthlyHoa: "",
    monthlyPmi: "",
  };
  const [form, setForm] = useState(emptyForm);
  const formRef = useRef(null);
  const [formFlash, setFormFlash] = useState(false); // brief highlight when the form opens

  // The add/edit form renders at the top of the page; when opened (esp. via a card's Edit
  // button lower down) scroll it into view and flash it, so it's obvious the form opened
  // rather than looking like the Edit button did nothing.
  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      setFormFlash(true);
      const t = setTimeout(() => setFormFlash(false), 1300);
      return () => clearTimeout(t);
    }
  }, [showForm, editingId]);

  // Estimate value + details from the address via the real-estate service.
  const lookupFromAddress = async () => {
    if (!form.address.trim()) {
      setError("Enter an address first to estimate its value.");
      return;
    }
    try {
      setError("");
      setLookingUp(true);
      const est = await api.lookupProperty(form.address.trim());
      setForm((prev) => ({
        ...prev,
        currentValue: prev.currentValue || Math.round(est.estimatedValue || 0),
        purchasePrice: prev.purchasePrice || Math.round(est.estimatedValue || 0),
        beds: est.beds ?? prev.beds,
        baths: est.baths ?? prev.baths,
        sqft: est.sqft ?? prev.sqft,
        yearBuilt: est.yearBuilt ?? prev.yearBuilt,
        rentEstimate: est.rentEstimate ? Math.round(est.rentEstimate) : prev.rentEstimate,
      }));
    } catch (err) {
      setError(err?.message || "Could not estimate this address.");
    } finally {
      setLookingUp(false);
    }
  };

  const fetchProperties = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.getRealEstate();
      setProps(extractList(res).map(normalize));
    } catch (err) {
      setError(err?.message || "Failed to load properties.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  const totalValue = useMemo(
    () => props.reduce((sum, p) => sum + (p.currentValue || 0), 0),
    [props]
  );
  const totalEquity = useMemo(
    () => props.reduce((sum, p) => sum + (p.equity || 0), 0),
    [props]
  );
  const totalMortgage = useMemo(
    () => props.reduce((sum, p) => sum + (p.loanBalance || 0), 0),
    [props]
  );

  const onFormChange = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  // Load a property into the form for editing (the address field is the dup key, so it
  // stays editable but the dup-check skips the property being edited).
  const startEdit = (prop) => {
    setEditingId(prop.id);
    setForm({
      address: prop.address || "",
      propertyType: prop.propertyType || prop.type || "PRIMARY_RESIDENCE",
      purchasePrice: prop.purchasePrice != null ? String(prop.purchasePrice) : "",
      currentValue: prop.currentValue != null ? String(prop.currentValue) : "",
      mortgageBalance: prop.loanBalance != null ? String(prop.loanBalance) : "",
      beds: prop.beds != null ? String(prop.beds) : "",
      baths: prop.baths != null ? String(prop.baths) : "",
      sqft: prop.sqft != null ? String(prop.sqft) : "",
      yearBuilt: prop.yearBuilt != null ? String(prop.yearBuilt) : "",
      rentEstimate: prop.rentEstimate != null ? String(prop.rentEstimate) : "",
      apr: prop.apr != null ? String(prop.apr) : "",
      monthlyPayment: prop.monthlyPayment != null ? String(prop.monthlyPayment) : "",
      monthlyTax: prop.monthlyTax != null ? String(prop.monthlyTax) : "",
      monthlyInsurance: prop.monthlyInsurance != null ? String(prop.monthlyInsurance) : "",
      monthlyHoa: prop.monthlyHoa != null ? String(prop.monthlyHoa) : "",
      monthlyPmi: prop.monthlyPmi != null ? String(prop.monthlyPmi) : "",
    });
    setError("");
    setNotice("");
    setShowForm(true);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.address.trim()) {
      setError("Enter an address to add this property.");
      return;
    }
    // Block adding a property whose address is already in the list (ignore the one being
    // edited). Normalize whitespace/case so "123 Main St" == "123 main st  ".
    const normAddr = form.address.trim().toLowerCase().replace(/\s+/g, " ");
    const dup = props.find(
      (p) => (p.address || "").trim().toLowerCase().replace(/\s+/g, " ") === normAddr && p.id !== editingId
    );
    if (dup) {
      setError("That property is already in your list — edit the existing one instead.");
      return;
    }
    try {
      setError("");
      setNotice("");
      setSaving(true);

      // Start from whatever the user typed in.
      const filled = {
        currentValue: form.currentValue === "" ? null : Number(form.currentValue),
        purchasePrice: form.purchasePrice === "" ? null : Number(form.purchasePrice),
        beds: form.beds === "" ? null : Number(form.beds),
        baths: form.baths === "" ? null : Number(form.baths),
        sqft: form.sqft === "" ? null : Number(form.sqft),
        yearBuilt: form.yearBuilt === "" ? null : Number(form.yearBuilt),
        rentEstimate: form.rentEstimate === "" ? null : Number(form.rentEstimate),
      };

      // If the value (or other facts) weren't entered, fetch an estimate from the
      // address so the user can save with just an address and we fill the rest.
      let estimatedValue = null;
      const needsEstimate =
        filled.currentValue == null ||
        filled.beds == null ||
        filled.baths == null ||
        filled.sqft == null ||
        filled.yearBuilt == null ||
        filled.rentEstimate == null;
      if (needsEstimate) {
        try {
          const est = await api.lookupProperty(form.address.trim());
          if (filled.currentValue == null && est.estimatedValue != null) {
            estimatedValue = Math.round(est.estimatedValue);
            filled.currentValue = estimatedValue;
          }
          if (filled.purchasePrice == null && est.estimatedValue != null)
            filled.purchasePrice = Math.round(est.estimatedValue);
          if (filled.beds == null && est.beds != null) filled.beds = est.beds;
          if (filled.baths == null && est.baths != null) filled.baths = est.baths;
          if (filled.sqft == null && est.sqft != null) filled.sqft = est.sqft;
          if (filled.yearBuilt == null && est.yearBuilt != null) filled.yearBuilt = est.yearBuilt;
          if (filled.rentEstimate == null && est.rentEstimate != null)
            filled.rentEstimate = Math.round(est.rentEstimate);
        } catch {
          // Estimate is best-effort — still save what we have.
        }
      }

      // Rent income & PMI only apply to rentals — don't send them for other types.
      const isRental = form.propertyType === "RENTAL_PROPERTY";
      const num = (v) => (v === "" || v == null ? null : Number(v));
      const payload = {
        address: form.address.trim(),
        propertyType: form.propertyType,
        purchasePrice: filled.purchasePrice ?? 0,
        currentValue: filled.currentValue ?? 0,
        mortgageBalance: Number(form.mortgageBalance) || 0,
        beds: filled.beds,
        baths: filled.baths,
        sqft: filled.sqft,
        yearBuilt: filled.yearBuilt,
        rentEstimate: isRental ? filled.rentEstimate : null,
        // Financing & monthly carrying costs
        apr: num(form.apr),
        monthlyPayment: num(form.monthlyPayment),
        monthlyTax: num(form.monthlyTax),
        monthlyInsurance: num(form.monthlyInsurance),
        monthlyHoa: num(form.monthlyHoa),
        monthlyPmi: isRental ? num(form.monthlyPmi) : null,
      };
      if (editingId) {
        await api.updateProperty(editingId, payload);
      } else {
        await api.addProperty(payload);
      }
      setForm(emptyForm);
      setShowForm(false);
      setEditingId(null);
      await fetchProperties();
      if (editingId) {
        setNotice("Property updated.");
      } else if (estimatedValue != null) {
        setNotice(
          `Saved. We estimated this property at ${currency(estimatedValue)} from the address — you can refine it anytime with Revalue or by editing.`
        );
      } else {
        setNotice("Property saved.");
      }
    } catch (err) {
      setError(err?.message || "Failed to add property.");
    } finally {
      setSaving(false);
    }
  };

  const onRevalue = async (id) => {
    try {
      setError("");
      setRevaluingId(id);
      await api.revalueProperty(id);
      await fetchProperties();
    } catch (err) {
      setError(err?.message || "Failed to revalue property.");
    } finally {
      setRevaluingId(null);
    }
  };

  const onDelete = async (id) => {
    try {
      setError("");
      await api.deleteProperty(id);
      await fetchProperties();
    } catch (err) {
      setError(err?.message || "Failed to delete property.");
    }
  };

  const getDeltaClass = (value) => (value >= 0 ? "pos" : "neg");
  const getDeltaIcon = (value) =>
    value >= 0 ? "ti ti-arrow-up-right" : "ti ti-arrow-down-right";

  // Placeholder for 30d changes
  const valueChange30d = 8500;
  const equityChange30d = 1800;
  const mortgageChange30d = -800;

  const pct = (chg, total) => {
    const base = total - chg;
    if (!base) return "0.0";
    return ((chg / base) * 100).toFixed(1);
  };

  return (
    <div id="page-realestate" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Properties</div>
          <div className="page-subtitle">Your real estate portfolio</div>
        </div>
        <div className="page-actions" style={{ alignItems: "center" }}>
          <LastRefreshed onRefresh={fetchProperties} />
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              if (showForm) { setShowForm(false); setEditingId(null); setForm(emptyForm); }
              else { setEditingId(null); setForm(emptyForm); setError(""); setNotice(""); setShowForm(true); }
            }}
          >
            <i className={showForm ? "ti ti-x" : "ti ti-plus"}></i>{" "}
            {showForm ? "Cancel" : "Add property"}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="card"
          style={{
            marginBottom: "16px",
            borderLeft: "4px solid var(--tv-negative)",
            color: "var(--tv-negative)",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          className="card"
          style={{
            marginBottom: "16px",
            borderLeft: "4px solid var(--tv-positive)",
            color: "var(--tv-text-primary)",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>
            <i className="ti ti-circle-check" style={{ color: "var(--tv-positive)", marginRight: 6 }}></i>
            {notice}
          </span>
          <button className="icon-btn" title="Dismiss" onClick={() => setNotice("")}>
            <i className="ti ti-x"></i>
          </button>
        </div>
      )}

      {showForm && (
        <div
          ref={formRef}
          className="card"
          style={{
            marginBottom: "16px",
            scrollMarginTop: "16px",
            transition: "box-shadow .5s ease, border-color .3s ease",
            borderLeft: editingId ? "4px solid var(--tv-forest)" : undefined,
            boxShadow: formFlash ? "0 0 0 3px var(--tv-forest)" : undefined,
          }}
        >
          <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <i className={editingId ? "ti ti-pencil" : "ti ti-plus"} style={{ color: "var(--tv-forest)" }}></i>
            {editingId ? "Edit property" : "Add a property"}
            {editingId && form.address ? (
              <span className="badge badge-green" style={{ fontSize: 11, fontWeight: 500 }}>{form.address}</span>
            ) : null}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--tv-text-muted)", marginTop: -4, marginBottom: 14 }}>
            {editingId
              ? "Update any detail and save your changes."
              : "Only the address is required. Leave the value or any detail blank and we'll estimate it from the address when you save."}
          </div>
          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label">Address</label>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <AddressAutocomplete
                    value={form.address}
                    onChange={(v) => setForm((p) => ({ ...p, address: v }))}
                    placeholder="Start typing an address…"
                    required
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={lookupFromAddress}
                  disabled={lookingUp}
                  title="Estimate value & details from this address"
                  style={{ flexShrink: 0 }}
                >
                  <i className={`ti ${lookingUp ? "ti-loader spin" : "ti-wand"}`}></i>
                  {lookingUp ? "Estimating…" : "Auto-fill"}
                </button>
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={form.propertyType} onChange={onFormChange("propertyType")}>
                  <option value="PRIMARY_RESIDENCE">Primary residence</option>
                  <option value="RENTAL_PROPERTY">Rental property</option>
                  <option value="LAND">Land</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Purchase price</label>
                <input className="form-input" type="number" value={form.purchasePrice} onChange={onFormChange("purchasePrice")} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Current value <span style={{ color: "var(--tv-text-muted)", fontWeight: 400 }}>(auto if blank)</span></label>
                <input className="form-input" type="number" value={form.currentValue} onChange={onFormChange("currentValue")} placeholder="We'll estimate it" />
                <Disclaimer
                  keyId="realestate.valuation"
                  variant="inline"
                  fallbackTitle=""
                  fallbackBody="Property values are automated estimates and may differ from market or appraised value."
                />
              </div>
              <div className="form-group">
                <label className="form-label">Mortgage balance</label>
                <input className="form-input" type="number" value={form.mortgageBalance} onChange={onFormChange("mortgageBalance")} placeholder="0" />
              </div>
            </div>
            <div className="grid-3">
              <div className="form-group">
                <label className="form-label">Beds</label>
                <input className="form-input" type="number" value={form.beds} onChange={onFormChange("beds")} placeholder="—" />
              </div>
              <div className="form-group">
                <label className="form-label">Baths</label>
                <input className="form-input" type="number" step="0.5" value={form.baths} onChange={onFormChange("baths")} placeholder="—" />
              </div>
              <div className="form-group">
                <label className="form-label">Sq ft</label>
                <input className="form-input" type="number" value={form.sqft} onChange={onFormChange("sqft")} placeholder="—" />
              </div>
              <div className="form-group">
                <label className="form-label">Year built</label>
                <input className="form-input" type="number" value={form.yearBuilt} onChange={onFormChange("yearBuilt")} placeholder="—" />
              </div>
            </div>

            {/* Financing & monthly carrying costs — apply to any property type. */}
            <div className="section-title" style={{ fontSize: 13, marginTop: 6, marginBottom: 10 }}>Financing &amp; carrying costs</div>
            <div className="grid-3">
              <div className="form-group">
                <label className="form-label">APR <span style={{ color: "var(--tv-text-muted)", fontWeight: 400 }}>(%)</span></label>
                <input className="form-input" type="number" step="0.01" min="0" value={form.apr} onChange={onFormChange("apr")} placeholder="—" />
              </div>
              <div className="form-group">
                <label className="form-label">Monthly payment</label>
                <input className="form-input" type="number" min="0" value={form.monthlyPayment} onChange={onFormChange("monthlyPayment")} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Taxes <span style={{ color: "var(--tv-text-muted)", fontWeight: 400 }}>(monthly)</span></label>
                <input className="form-input" type="number" min="0" value={form.monthlyTax} onChange={onFormChange("monthlyTax")} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Insurance <span style={{ color: "var(--tv-text-muted)", fontWeight: 400 }}>(monthly)</span></label>
                <input className="form-input" type="number" min="0" value={form.monthlyInsurance} onChange={onFormChange("monthlyInsurance")} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">HOA <span style={{ color: "var(--tv-text-muted)", fontWeight: 400 }}>(monthly)</span></label>
                <input className="form-input" type="number" min="0" value={form.monthlyHoa} onChange={onFormChange("monthlyHoa")} placeholder="0" />
              </div>
            </div>

            {/* Rental-only: rent income + optional PMI. Hidden for personal residences / land. */}
            {form.propertyType === "RENTAL_PROPERTY" && (
              <>
                <div className="section-title" style={{ fontSize: 13, marginTop: 6, marginBottom: 10 }}>Rental income</div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Monthly rent income</label>
                    <input className="form-input" type="number" min="0" value={form.rentEstimate} onChange={onFormChange("rentEstimate")} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">PMI <span style={{ color: "var(--tv-text-muted)", fontWeight: 400 }}>(monthly, optional)</span></label>
                    <input className="form-input" type="number" min="0" value={form.monthlyPmi} onChange={onFormChange("monthlyPmi")} placeholder="0" />
                  </div>
                </div>
              </>
            )}
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              <i className={`ti ${saving ? "ti-loader spin" : "ti-check"}`}></i>
              {saving ? (editingId ? "Updating…" : "Saving & estimating…") : (editingId ? "Update property" : "Save property")}
            </button>
          </form>
        </div>
      )}

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Value</div>
          <div className="kpi-value">{currency(totalValue)}</div>
          <div className={`kpi-delta ${getDeltaClass(valueChange30d)}`}>
            <i className={getDeltaIcon(valueChange30d)}></i>{" "}
            {valueChange30d >= 0 ? "+" : ""}
            {currency(valueChange30d)} ({pct(valueChange30d, totalValue)}%) 30d
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Equity</div>
          <div className="kpi-value">{currency(totalEquity)}</div>
          <div className={`kpi-delta ${getDeltaClass(equityChange30d)}`}>
            <i className={getDeltaIcon(equityChange30d)}></i>{" "}
            {equityChange30d >= 0 ? "+" : ""}
            {currency(equityChange30d)} ({pct(equityChange30d, totalEquity)}%) 30d
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Mortgage</div>
          <div className="kpi-value">{currency(totalMortgage)}</div>
          <div className={`kpi-delta ${getDeltaClass(mortgageChange30d)}`}>
            <i className={getDeltaIcon(mortgageChange30d)}></i>{" "}
            {mortgageChange30d >= 0 ? "+" : ""}
            {currency(mortgageChange30d)} ({pct(mortgageChange30d, totalMortgage)}%) 30d
          </div>
        </div>
      </div>

      <div className="grid-2">
        {loading && props.length === 0 ? (
          <div className="card col-span-2">
            <div className="empty-state">
              <i className="ti ti-loader spin"></i>
              <p>Loading properties…</p>
            </div>
          </div>
        ) : props.length === 0 ? (
          <div className="card col-span-2">
            <div className="empty-state">
              <i className="ti ti-building-estate"></i>
              <p>No properties added yet.</p>
              <button
                className="btn btn-primary btn-sm"
                style={{ marginTop: "12px" }}
                onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm(true); }}
              >
                <i className="ti ti-plus"></i> Add your first property
              </button>
            </div>
          </div>
        ) : (
          props.map((prop) => {
            const typeLabel = TYPE_LABELS[prop.type] || prop.type || "Property";
            const isPrimary = prop.type === "PRIMARY_RESIDENCE" || prop.type === "Primary";
            return (
              <div className="property-card" key={prop.id}>
                <div className="property-header">
                  <div className="property-icon">🏡</div>
                  <div style={{ flex: 1 }}>
                    <div className="property-address">{prop.address}</div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--tv-text-muted)",
                        marginTop: "3px",
                      }}
                    >
                      Purchased: {formatDate(prop.purchaseDate)} &nbsp;·&nbsp;
                      <span
                        className={`badge ${isPrimary ? "badge-green" : "badge-gold"}`}
                        style={{ fontSize: "10.5px" }}
                      >
                        {typeLabel}
                      </span>
                      {prop.appreciation !== 0 && prop.purchasePrice ? (
                        <span
                          className={`badge ${prop.appreciation >= 0 ? "badge-green" : "badge-red"}`}
                          style={{ fontSize: "10.5px", marginLeft: 6 }}
                          title="Change vs. purchase price"
                        >
                          <i className={prop.appreciation >= 0 ? "ti ti-trending-up" : "ti ti-trending-down"}></i>
                          {prop.appreciation >= 0 ? "+" : ""}{((prop.appreciation / prop.purchasePrice) * 100).toFixed(1)}%
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => startEdit(prop)}
                      title="Edit this property's details"
                    >
                      <i className="ti ti-pencil"></i> Edit
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => onRevalue(prop.id)}
                      disabled={revaluingId === prop.id}
                    >
                      {revaluingId === prop.id ? (
                        <>
                          <i className="ti ti-loader spin"></i> Revaluing…
                        </>
                      ) : (
                        <>
                          <i className="ti ti-refresh"></i> Revalue
                        </>
                      )}
                    </button>
                    <button
                      className="icon-btn account-action"
                      title="Delete property"
                      onClick={() => onDelete(prop.id)}
                    >
                      <i className="ti ti-trash"></i>
                    </button>
                  </div>
                </div>
                <div className="property-meta-row">
                  <div className="property-stat">
                    <div className="property-stat-label">Current Value</div>
                    <div className="property-stat-value">
                      {currency(prop.currentValue)}
                    </div>
                  </div>
                  <div className="property-stat">
                    <div className="property-stat-label">Equity</div>
                    <div
                      className="property-stat-value"
                      style={{ color: "var(--tv-positive)" }}
                    >
                      {currency(prop.equity)}
                    </div>
                  </div>
                  <div className="property-stat">
                    <div className="property-stat-label">Mortgage</div>
                    <div className="property-stat-value">
                      {currency(prop.loanBalance)}
                    </div>
                  </div>
                </div>

                {/* Property details (beds / baths / sqft / year) */}
                {(prop.beds || prop.baths || prop.sqft || prop.yearBuilt) && (
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "0 18px 12px", fontSize: 12.5, color: "var(--tv-text-secondary)" }}>
                    {prop.beds ? <span><i className="ti ti-bed" style={{ marginRight: 4, color: "var(--tv-text-muted)" }}></i>{prop.beds} bd</span> : null}
                    {prop.baths ? <span><i className="ti ti-bath" style={{ marginRight: 4, color: "var(--tv-text-muted)" }}></i>{prop.baths} ba</span> : null}
                    {prop.sqft ? <span><i className="ti ti-ruler-2" style={{ marginRight: 4, color: "var(--tv-text-muted)" }}></i>{Number(prop.sqft).toLocaleString()} sqft</span> : null}
                    {prop.yearBuilt ? <span><i className="ti ti-calendar" style={{ marginRight: 4, color: "var(--tv-text-muted)" }}></i>Built {prop.yearBuilt}</span> : null}
                  </div>
                )}

                {/* Rental analysis — net cap rate accounts for all monthly carrying costs */}
                {prop.rentEstimate && (prop.type === "RENTAL_PROPERTY" || prop.type === "Rental") ? (() => {
                  const rent = Number(prop.rentEstimate) || 0;
                  // Operating expenses for the cap rate: taxes + insurance + HOA + PMI (monthly).
                  const monthlyOpEx =
                    (Number(prop.monthlyTax) || 0) +
                    (Number(prop.monthlyInsurance) || 0) +
                    (Number(prop.monthlyHoa) || 0) +
                    (Number(prop.monthlyPmi) || 0);
                  const noiAnnual = (rent - monthlyOpEx) * 12; // net operating income (excludes debt service)
                  const capRate = prop.currentValue ? (noiAnnual / prop.currentValue) * 100 : null;
                  const payment = Number(prop.monthlyPayment) || 0;
                  // Monthly cash flow also nets out the mortgage payment (debt service).
                  const cashFlow = rent - payment - monthlyOpEx;
                  // Cap rate is an UNLEVERED yield (before the mortgage), so it can be positive while
                  // cash flow (after the mortgage) is negative. Don't paint a positive cap rate green —
                  // that falsely reads as "good" when the property is cash-flow negative. Neutral by
                  // default; red only when the cap rate itself is negative (operating at a loss).
                  const capColor = capRate != null && capRate < 0 ? "var(--tv-negative)" : "var(--tv-text-primary)";
                  // Flag the counter-intuitive case so a positive cap rate + negative cash flow
                  // doesn't look like a bug.
                  const leverageNote = capRate != null && capRate >= 0 && cashFlow < 0;
                  return (
                    <div style={{ margin: "0 18px 16px", padding: "10px 12px", background: "var(--tv-sage-pale)", borderRadius: "var(--radius-md)", fontSize: 12.5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span><i className="ti ti-cash" style={{ color: "var(--tv-forest)", marginRight: 4 }}></i>Rent <strong>{currency(rent)}/mo</strong></span>
                        {capRate != null ? (
                          <span title="Unlevered yield — (annual rent − taxes, insurance, HOA & PMI) ÷ current value. Before the mortgage payment.">
                            Cap rate <strong style={{ color: capColor }}>{capRate.toFixed(1)}%</strong>
                          </span>
                        ) : null}
                      </div>
                      {(monthlyOpEx > 0 || payment > 0) && (
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, color: "var(--tv-text-muted)", fontSize: 11.5 }}>
                          <span>Expenses {currency(monthlyOpEx)}/mo{payment > 0 ? ` · payment ${currency(payment)}/mo` : ""}</span>
                          <span title="After the mortgage payment — rent − payment − taxes, insurance, HOA & PMI.">Cash flow <strong style={{ color: cashFlow >= 0 ? "var(--tv-positive)" : "var(--tv-negative)" }}>{cashFlow >= 0 ? "+" : ""}{currency(cashFlow)}/mo</strong></span>
                        </div>
                      )}
                      {leverageNote && (
                        <div style={{ marginTop: 6, fontSize: 11, color: "var(--tv-text-muted)", display: "flex", alignItems: "flex-start", gap: 4 }}>
                          <i className="ti ti-info-circle" style={{ marginTop: 1 }}></i>
                          <span>Cap rate is the yield <em>before</em> financing; the mortgage payment makes monthly cash flow negative.</span>
                        </div>
                      )}
                    </div>
                  );
                })() : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
