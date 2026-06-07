import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  };
  const [form, setForm] = useState(emptyForm);

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

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.address.trim()) {
      setError("Enter an address to add this property.");
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

      await api.addProperty({
        address: form.address.trim(),
        propertyType: form.propertyType,
        purchasePrice: filled.purchasePrice ?? 0,
        currentValue: filled.currentValue ?? 0,
        mortgageBalance: Number(form.mortgageBalance) || 0,
        beds: filled.beds,
        baths: filled.baths,
        sqft: filled.sqft,
        yearBuilt: filled.yearBuilt,
        rentEstimate: filled.rentEstimate,
      });
      setForm(emptyForm);
      setShowForm(false);
      await fetchProperties();
      if (estimatedValue != null) {
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
            onClick={() => setShowForm((s) => !s)}
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
        <div className="card" style={{ marginBottom: "16px" }}>
          <div className="section-title">Add a property</div>
          <div style={{ fontSize: 12.5, color: "var(--tv-text-muted)", marginTop: -4, marginBottom: 14 }}>
            Only the address is required. Leave the value or any detail blank and we'll
            estimate it from the address when you save.
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
              <div className="form-group">
                <label className="form-label">Est. monthly rent</label>
                <input className="form-input" type="number" value={form.rentEstimate} onChange={onFormChange("rentEstimate")} placeholder="—" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              <i className={`ti ${saving ? "ti-loader spin" : "ti-check"}`}></i>
              {saving ? "Saving & estimating…" : "Save property"}
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
                onClick={() => setShowForm(true)}
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

                {/* Rental analysis for rental properties with a rent estimate */}
                {prop.rentEstimate && (prop.type === "RENTAL_PROPERTY" || prop.type === "Rental") ? (
                  <div style={{ margin: "0 18px 16px", padding: "10px 12px", background: "var(--tv-sage-pale)", borderRadius: "var(--radius-md)", display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span><i className="ti ti-cash" style={{ color: "var(--tv-forest)", marginRight: 4 }}></i>Est. rent <strong>{currency(prop.rentEstimate)}/mo</strong></span>
                    {prop.currentValue ? (
                      <span title="Annual rent ÷ current value">
                        Cap rate <strong>{(((prop.rentEstimate * 12) / prop.currentValue) * 100).toFixed(1)}%</strong>
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
