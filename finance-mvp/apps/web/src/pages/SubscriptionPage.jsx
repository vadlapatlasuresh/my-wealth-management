import { useState, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api";
import { currency } from "../utils/format";
import { useSubscription } from "../config/subscription";

/* SubscriptionPage — the full subscription journey in one place:
   choose a plan → 7-day free trial → prompted to subscribe → pick monthly/annual →
   pay → active; plus cancel, upgrade/downgrade, and honest trial/expiry/decline states.

   Everything (plan names, prices, trial length, feature lists) is rendered from the
   /subscriptions/plans DB config — nothing about the plans is hardcoded here. */

const CYCLES = [
  { id: "MONTHLY", label: "Monthly" },
  { id: "ANNUAL", label: "Annual" },
];

const STATUS_BADGE = {
  TRIALING: { cls: "badge-forest", label: "Free trial" },
  ACTIVE: { cls: "badge-green", label: "Active" },
  PAST_DUE: { cls: "badge-red", label: "Payment due" },
  CANCELED: { cls: "badge-gray", label: "Canceled" },
  EXPIRED: { cls: "badge-amber", label: "Trial ended" },
  NONE: { cls: "badge-gray", label: "No plan" },
};

function priceForCycle(plan, cycle) {
  if (cycle === "ANNUAL") return plan.annualPrice;
  return plan.monthlyPrice;
}

export default function SubscriptionPage() {
  const { reload: reloadEntitlements } = useSubscription();
  const [plans, setPlans] = useState([]);
  const [sub, setSub] = useState(null);
  const [cycle, setCycle] = useState("MONTHLY");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");           // planKey currently mutating
  const [checkout, setCheckout] = useState(null);  // { planKey } when the pay modal is open

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [plansRes, meRes] = await Promise.all([
        api.getSubscriptionPlans(),
        api.getMySubscription(),
      ]);
      setPlans(plansRes?.plans || []);
      setSub(meRes || null);
      // Default the billing toggle to what the user already has.
      if (meRes?.billingCycle) setCycle(meRes.billingCycle);
    } catch (e) {
      setError(e?.message || "Couldn't load subscription plans.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const status = sub?.status || "NONE";
  const currentPlanKey = sub?.subscribed ? sub.planKey : null;
  const badge = STATUS_BADGE[status] || STATUS_BADGE.NONE;

  const afterMutation = async (msg) => {
    setNotice(msg || "");
    await load();
    await reloadEntitlements();
  };

  const startTrial = async (planKey) => {
    setBusy(planKey);
    setError("");
    setNotice("");
    try {
      await api.startTrial(planKey);
      await afterMutation("Your 7-day free trial has started — no charge yet.");
    } catch (e) {
      setError(e?.message || "Couldn't start the trial.");
    } finally {
      setBusy("");
    }
  };

  // A trialing user switching plans (no charge) vs a lapsed/none user needing checkout.
  const switchTrialPlan = async (planKey) => {
    setBusy(planKey);
    setError("");
    setNotice("");
    try {
      await api.changeSubscription({ planKey });
      await afterMutation("Plan switched — still on your free trial.");
    } catch (e) {
      setError(e?.message || "Couldn't switch plans.");
    } finally {
      setBusy("");
    }
  };

  const cancel = async () => {
    if (!window.confirm("Cancel your subscription? Trials end now; paid plans stay active until the period ends.")) return;
    setBusy("cancel");
    setError("");
    setNotice("");
    try {
      await api.cancelSubscription();
      await afterMutation("Your subscription has been canceled.");
    } catch (e) {
      setError(e?.message || "Couldn't cancel.");
    } finally {
      setBusy("");
    }
  };

  const planByKey = useMemo(
    () => Object.fromEntries(plans.map((p) => [p.planKey, p])),
    [plans]
  );

  if (loading) {
    return (
      <div className="page active">
        <div className="empty-state" style={{ padding: 48 }}>
          <i className="ti ti-loader spin"></i>
          <p>Loading plans…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page active">
      <div className="section-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="section-title" style={{ marginBottom: 4 }}>Subscription</h1>
          <p style={{ color: "var(--tv-text-muted)", margin: 0 }}>
            Choose a plan, start a 7-day free trial, and switch anytime.
          </p>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: "var(--tv-red)", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, color: "var(--tv-red)" }}>
            <i className="ti ti-alert-circle"></i>
            <span>{error}</span>
          </div>
        </div>
      )}
      {notice && (
        <div className="card" style={{ borderColor: "var(--tv-forest-light)", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, color: "var(--tv-forest)" }}>
            <i className="ti ti-circle-check"></i>
            <span>{notice}</span>
          </div>
        </div>
      )}

      {/* Current status */}
      {sub?.subscribed && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span className={`badge ${badge.cls}`}>{badge.label}</span>
                <strong style={{ fontSize: 16 }}>{sub.planName || planByKey[sub.planKey]?.name || sub.planKey}</strong>
                {sub.billingCycle && <span style={{ color: "var(--tv-text-muted)" }}>· billed {sub.billingCycle.toLowerCase()}</span>}
              </div>
              <div style={{ color: "var(--tv-text-muted)", fontSize: 14 }}>
                {status === "TRIALING" && sub.trialDaysRemaining > 0 && (
                  <span><i className="ti ti-clock"></i> {sub.trialDaysRemaining} day{sub.trialDaysRemaining === 1 ? "" : "s"} left in your free trial — subscribe below to keep access.</span>
                )}
                {status === "ACTIVE" && !sub.cancelAtPeriodEnd && sub.currentPeriodEnd && (
                  <span><i className="ti ti-calendar"></i> Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}</span>
                )}
                {status === "ACTIVE" && sub.cancelAtPeriodEnd && sub.currentPeriodEnd && (
                  <span><i className="ti ti-calendar-x"></i> Access ends {new Date(sub.currentPeriodEnd).toLocaleDateString()} — you won't be charged again.</span>
                )}
                {status === "PAST_DUE" && <span><i className="ti ti-alert-triangle"></i> Your last payment failed. Update payment to restore access.</span>}
                {status === "EXPIRED" && <span><i className="ti ti-clock-x"></i> Your free trial ended. Subscribe to regain access.</span>}
                {status === "CANCELED" && <span><i className="ti ti-x"></i> Your subscription is canceled.</span>}
              </div>
            </div>
            {sub.active && !sub.cancelAtPeriodEnd && (
              <button className="btn btn-secondary btn-sm" onClick={cancel} disabled={busy === "cancel"}>
                {busy === "cancel" ? "Canceling…" : "Cancel subscription"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Billing cycle toggle */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <div className="seg-control" role="tablist" aria-label="Billing cycle">
          {CYCLES.map((c) => (
            <button
              key={c.id}
              className={`seg-btn ${cycle === c.id ? "active" : ""}`}
              onClick={() => setCycle(c.id)}
            >
              {c.label}
              {c.id === "ANNUAL" && <span className="badge badge-gold" style={{ marginLeft: 6 }}>Save</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {plans.map((plan) => (
          <PlanCard
            key={plan.planKey}
            plan={plan}
            cycle={cycle}
            status={status}
            currentPlanKey={currentPlanKey}
            trialUsed={sub?.subscribed && sub.trialStart != null}
            busy={busy === plan.planKey}
            onStartTrial={() => startTrial(plan.planKey)}
            onSwitchTrial={() => switchTrialPlan(plan.planKey)}
            onCheckout={() => setCheckout({ planKey: plan.planKey })}
          />
        ))}
      </div>

      {checkout && (
        <CheckoutModal
          plan={planByKey[checkout.planKey]}
          cycle={cycle}
          currentPlanKey={currentPlanKey}
          isChange={status === "ACTIVE" || status === "PAST_DUE"}
          onClose={() => setCheckout(null)}
          onDone={async (msg) => { setCheckout(null); await afterMutation(msg); }}
          onError={setError}
        />
      )}
    </div>
  );
}

function PlanCard({ plan, cycle, status, currentPlanKey, trialUsed, busy, onStartTrial, onSwitchTrial, onCheckout }) {
  const isCurrent = currentPlanKey === plan.planKey;
  const price = priceForCycle(plan, cycle);
  const perMonth = cycle === "ANNUAL" ? plan.annualMonthlyEquivalent : plan.monthlyPrice;
  const accent = plan.accent === "gold" ? "badge-gold" : "badge-forest";

  // Decide the primary CTA from the lifecycle state.
  let cta;
  if (status === "NONE") {
    cta = { label: `Start ${plan.trialDays}-day free trial`, onClick: onStartTrial, kind: "btn-primary" };
  } else if (status === "TRIALING") {
    cta = isCurrent
      ? { label: "Subscribe now", onClick: onCheckout, kind: "btn-primary" }
      : { label: "Switch plan", onClick: onSwitchTrial, kind: "btn-secondary" };
  } else if (status === "ACTIVE" || status === "PAST_DUE") {
    cta = isCurrent
      ? { label: "Change billing", onClick: onCheckout, kind: "btn-secondary" }
      : { label: `Switch to ${plan.name}`, onClick: onCheckout, kind: "btn-primary" };
  } else {
    // EXPIRED / CANCELED — trial already consumed, so checkout (no second free trial).
    cta = { label: "Subscribe", onClick: onCheckout, kind: "btn-primary" };
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12, position: "relative", borderColor: isCurrent ? "var(--tv-forest-light)" : undefined }}>
      {isCurrent && (
        <span className="badge badge-green" style={{ position: "absolute", top: 14, right: 14 }}>Current</span>
      )}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={`badge ${accent}`}>{plan.name}</span>
        </div>
        <p style={{ color: "var(--tv-text-muted)", margin: "8px 0 0", fontSize: 14 }}>{plan.tagline}</p>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 30, fontWeight: 700 }}>{currency(perMonth)}</span>
          <span style={{ color: "var(--tv-text-muted)" }}>/mo</span>
        </div>
        {cycle === "ANNUAL" ? (
          <div style={{ color: "var(--tv-text-muted)", fontSize: 13 }}>
            {currency(price)} billed yearly · <span style={{ color: "var(--tv-forest)" }}>save {plan.annualSavingsPercent}%</span>
          </div>
        ) : (
          <div style={{ color: "var(--tv-text-muted)", fontSize: 13 }}>
            or {currency(plan.annualMonthlyEquivalent)}/mo billed yearly
          </div>
        )}
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {(plan.features || []).slice(0, 5).map((f) => (
          <li key={f.featureKey} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, opacity: f.enabled ? 1 : 0.4 }}>
            <i className={`ti ${f.enabled ? "ti-circle-check" : "ti-circle-minus"}`} style={{ color: f.enabled ? "var(--tv-forest)" : "var(--tv-text-muted)", marginTop: 2 }}></i>
            <span>{f.label}</span>
          </li>
        ))}
        {(plan.features || []).length > 5 && (
          <li style={{ fontSize: 13 }}>
            <NavLink to={`/plans/${plan.planKey}`} style={{ color: "var(--tv-forest)" }}>
              + {plan.features.length - 5} more — see all features
            </NavLink>
          </li>
        )}
      </ul>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        <button className={`btn ${cta.kind}`} onClick={cta.onClick} disabled={busy} style={{ justifyContent: "center" }}>
          {busy ? "Working…" : cta.label}
        </button>
        <NavLink to={`/plans/${plan.planKey}`} className="btn btn-secondary btn-sm" style={{ justifyContent: "center", textDecoration: "none" }}>
          View plan details
        </NavLink>
        {status === "NONE" && (
          <span style={{ textAlign: "center", fontSize: 12, color: "var(--tv-text-muted)" }}>
            No charge for {plan.trialDays} days. Cancel anytime.
          </span>
        )}
      </div>
    </div>
  );
}

function CheckoutModal({ plan, cycle, isChange, onClose, onDone, onError }) {
  const [name, setName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [simulateDecline, setSimulateDecline] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!plan) return null;
  const price = priceForCycle(plan, cycle);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    onError("");
    // A real integration would tokenize the card client-side (Stripe.js) and send the token.
    // Here the mock provider accepts any token; a "fail…" token simulates a declined card so
    // payment-failure handling is exercisable end-to-end.
    const paymentToken = simulateDecline ? "fail_card" : `tok_mock_${Date.now()}`;
    try {
      const payload = { planKey: plan.planKey, billingCycle: cycle, paymentToken };
      if (isChange) await api.changeSubscription(payload);
      else await api.activateSubscription(payload);
      await onDone(`You're subscribed to ${plan.name} (${cycle.toLowerCase()}). Thanks!`);
    } catch (err) {
      onError(err?.message || "Payment failed.");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" style={backdrop} onClick={onClose}>
      <div className="card" style={{ maxWidth: 440, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div className="section-header" style={{ marginBottom: 12 }}>
          <h2 className="section-title" style={{ margin: 0 }}>Subscribe to {plan.name}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><i className="ti ti-x"></i></button>
        </div>

        <div className="card" style={{ background: "var(--tv-bg)", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{plan.name} · {cycle.toLowerCase()}</span>
            <strong>{currency(price)}{cycle === "ANNUAL" ? "/yr" : "/mo"}</strong>
          </div>
        </div>

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Name on card</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Rivera" required />
          </div>
          <div className="form-group">
            <label className="form-label">Card number</label>
            <input className="form-input" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="4242 4242 4242 4242" inputMode="numeric" required />
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--tv-text-muted)", margin: "4px 0 14px" }}>
            <input type="checkbox" checked={simulateDecline} onChange={(e) => setSimulateDecline(e.target.checked)} />
            Simulate a declined card (test payment-failure handling)
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
            {busy ? "Processing…" : `Pay ${currency(price)}`}
          </button>
          <p style={{ textAlign: "center", fontSize: 12, color: "var(--tv-text-muted)", marginTop: 10 }}>
            <i className="ti ti-lock"></i> Payments are processed securely. You can cancel anytime.
          </p>
        </form>
      </div>
    </div>
  );
}

const backdrop = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 100,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
};
