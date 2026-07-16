import { useState, useEffect } from "react";
import { useParams, NavLink } from "react-router-dom";
import { api } from "../api";
import { currency } from "../utils/format";

/* PlanTierPage — the dedicated feature page for a single subscription tier.
   The entire feature list, pricing, trial length and copy are pulled from the
   /subscriptions/plans/{planKey} DB config; toggling a plan_feature row or editing a
   price in the DB updates this page automatically with no code change. */

export default function PlanTierPage() {
  const { planKey } = useParams();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api
      .getSubscriptionPlan(planKey)
      .then((p) => { if (alive) setPlan(p); })
      .catch((e) => { if (alive) setError(e?.message || "Plan not found."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [planKey]);

  if (loading) {
    return (
      <div className="page active">
        <div className="empty-state" style={{ padding: 48 }}>
          <i className="ti ti-loader spin"></i>
          <p>Loading plan…</p>
        </div>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="page active">
        <div className="card" style={{ maxWidth: 480, margin: "32px auto", textAlign: "center" }}>
          <i className="ti ti-alert-circle" style={{ fontSize: 26, color: "var(--tv-red)" }}></i>
          <p style={{ marginTop: 8 }}>{error || "Plan not found."}</p>
          <NavLink to="/subscription" className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>
            Back to plans
          </NavLink>
        </div>
      </div>
    );
  }

  const accent = plan.accent === "gold" ? "badge-gold" : "badge-forest";
  // Only enabled features are "included"; disabled ones are shown struck-through so the page
  // reflects live config truthfully.
  const features = plan.features || [];

  return (
    <div className="page active">
      <div style={{ marginBottom: 12 }}>
        <NavLink to="/subscription" style={{ color: "var(--tv-text-muted)", fontSize: 13, textDecoration: "none" }}>
          <i className="ti ti-chevron-left"></i> All plans
        </NavLink>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <span className={`badge ${accent}`}>{plan.name} plan</span>
            <h1 className="section-title" style={{ margin: "10px 0 4px" }}>{plan.tagline}</h1>
            <p style={{ color: "var(--tv-text-muted)", margin: 0 }}>
              {plan.trialDays}-day free trial · cancel anytime
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, justifyContent: "flex-end" }}>
              <span style={{ fontSize: 30, fontWeight: 700 }}>{currency(plan.monthlyPrice)}</span>
              <span style={{ color: "var(--tv-text-muted)" }}>/mo</span>
            </div>
            <div style={{ color: "var(--tv-text-muted)", fontSize: 13 }}>
              or {currency(plan.annualPrice)}/yr <span style={{ color: "var(--tv-forest)" }}>(save {plan.annualSavingsPercent}%)</span>
            </div>
            <NavLink to="/subscription" className="btn btn-primary btn-sm" style={{ marginTop: 10, textDecoration: "none" }}>
              Start free trial
            </NavLink>
          </div>
        </div>
      </div>

      <h2 className="section-title" style={{ marginBottom: 12 }}>Everything included</h2>
      <div className="card">
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {features.map((f) => (
            <li
              key={f.featureKey}
              className="list-item"
              style={{ opacity: f.enabled ? 1 : 0.45 }}
            >
              <div className={`item-icon ${f.enabled ? "icon-forest" : "icon-red"}`} style={{ width: 34, height: 34, fontSize: 16 }}>
                <i className={`ti ${f.enabled ? "ti-check" : "ti-minus"}`}></i>
              </div>
              <div className="item-main">
                <div className="item-name" style={{ textDecoration: f.enabled ? "none" : "line-through" }}>{f.label}</div>
                {f.description && <div className="item-sub">{f.description}</div>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
