import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api';

// How many days out we start nudging that the trial is ending.
const TRIAL_ENDING_THRESHOLD_DAYS = 3;
const ONBOARDING_DISMISS_KEY = 'tv_trial_onboarding_dismissed';

/* subscription.jsx
   Subscription + entitlements context for the web app.

   - Loads the signed-in user's subscription (/me) and resolved entitlements
     (/entitlements) once, and exposes them to the whole app.
   - `hasFeature(key)` backs feature gating. Entitlements come straight from the DB
     plan_feature config, so toggling a feature flag there flips access on the next load.
   - Never throws: a failure leaves the user un-gated (status NONE) so a backend hiccup
     can't lock anyone out of the existing app.

   Gating policy: the subscription is an overlay on top of the existing app. A user who
   has NEVER engaged the subscription system (status NONE) is not gated — everything is
   open. Once they hold a plan, tier-specific features (the Business toolset) are gated,
   so an Individual subscriber sees an upgrade prompt on Business-only screens. */

const SubscriptionContext = createContext(null);

const EMPTY = {
  subscription: { status: 'NONE', subscribed: false, active: false },
  entitlements: { status: 'NONE', entitled: false, features: {} },
};

export function SubscriptionProvider({ children }) {
  const [state, setState] = useState(EMPTY);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [sub, ent] = await Promise.all([
        api.getMySubscription().catch(() => EMPTY.subscription),
        api.getEntitlements().catch(() => EMPTY.entitlements),
      ]);
      setState({
        subscription: sub || EMPTY.subscription,
        entitlements: ent || EMPTY.entitlements,
      });
    } catch {
      setState(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const { subscription, entitlements } = state;
  const status = subscription?.status || 'NONE';

  // Never-engaged users are ungated; otherwise a feature is granted only if the plan
  // grants it (plan_feature enabled) AND the subscription is live.
  const hasFeature = useCallback(
    (key) => {
      if (!key) return true;
      if (status === 'NONE') return true;
      return Boolean(entitlements?.features?.[key]);
    },
    [status, entitlements]
  );

  const value = {
    subscription,
    entitlements,
    status,
    loading,
    hasFeature,
    reload,
  };
  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    // Used outside a provider (e.g. isolated test render) — behave as ungated.
    return {
      subscription: EMPTY.subscription,
      entitlements: EMPTY.entitlements,
      status: 'NONE',
      loading: false,
      hasFeature: () => true,
      reload: () => {},
    };
  }
  return ctx;
}

/* FeatureGate: renders children only when the plan grants `feature`. Otherwise it shows an
   upgrade prompt (or a caller-supplied fallback). While entitlements load it renders nothing
   to avoid a flash of the wrong state. */
export function FeatureGate({ feature, children, fallback, title }) {
  const { hasFeature, loading } = useSubscription();
  if (loading) return null;
  if (hasFeature(feature)) return children;
  if (fallback !== undefined) return fallback;
  return <UpgradePrompt title={title} />;
}

/* TrialBanner: an app-wide strip that surfaces time-sensitive subscription states —
   the trial ending soon, an expired trial, or a failed payment. Rendered at the top of
   the page content. Non-blocking; the "ending soon" variant is dismissible for the
   session, but expired/past-due stay pinned since they've lost access. */
export function TrialBanner() {
  const { subscription, status, loading } = useSubscription();
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  if (loading || dismissed) return null;

  let variant = null; // { tone, icon, text, cta }
  if (status === 'TRIALING') {
    const left = subscription?.trialDaysRemaining ?? 0;
    if (left <= TRIAL_ENDING_THRESHOLD_DAYS) {
      variant = {
        tone: 'amber',
        icon: 'ti ti-clock-exclamation',
        text: left <= 0
          ? 'Your free trial ends today. Subscribe now to keep access.'
          : `Your free trial ends in ${left} day${left === 1 ? '' : 's'}. Subscribe to keep access.`,
        cta: 'Choose a plan',
        dismissible: true,
      };
    }
  } else if (status === 'EXPIRED') {
    variant = { tone: 'red', icon: 'ti ti-clock-x', text: 'Your free trial has ended. Subscribe to restore full access.', cta: 'Subscribe' };
  } else if (status === 'PAST_DUE') {
    variant = { tone: 'red', icon: 'ti ti-alert-triangle', text: 'Your last payment failed. Update your payment method to keep access.', cta: 'Fix payment' };
  }

  if (!variant) return null;

  const bg = variant.tone === 'red' ? 'rgba(192,57,43,.10)' : 'rgba(201,151,58,.12)';
  const fg = variant.tone === 'red' ? 'var(--tv-red)' : 'var(--tv-gold)';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '10px 14px', margin: '0 0 14px', borderRadius: 'var(--radius-md, 10px)',
      background: bg, border: `1px solid ${fg}`,
    }}>
      <i className={variant.icon} style={{ color: fg, fontSize: 18 }}></i>
      <span style={{ flex: 1, minWidth: 180, fontSize: 13.5 }}>{variant.text}</span>
      <button className="btn btn-primary btn-sm" onClick={() => navigate('/subscription')}>
        {variant.cta}
      </button>
      {variant.dismissible && (
        <button className="icon-btn" onClick={() => setDismissed(true)} aria-label="Dismiss">
          <i className="ti ti-x"></i>
        </button>
      )}
    </div>
  );
}

/* TrialOnboardingModal: the post-signup prompt. Shows once for a user with no subscription
   (status NONE), inviting them to start the 7-day free trial — NO credit card required.
   Dismissible ("Maybe later"), and never blocks the app; the Subscription page stays the
   full home for plans. */
export function TrialOnboardingModal() {
  const { status, loading, reload } = useSubscription();
  const [plans, setPlans] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    const dismissed = localStorage.getItem(ONBOARDING_DISMISS_KEY) === '1';
    if (status === 'NONE' && !dismissed) {
      api.getSubscriptionPlans()
        .then((r) => { setPlans(r?.plans || []); setOpen(true); })
        .catch(() => {});
    }
  }, [status, loading]);

  if (!open) return null;

  const dismiss = () => {
    localStorage.setItem(ONBOARDING_DISMISS_KEY, '1');
    setOpen(false);
  };

  const startTrial = async (planKey) => {
    setBusy(planKey);
    setError('');
    try {
      await api.startTrial(planKey);
      localStorage.setItem(ONBOARDING_DISMISS_KEY, '1');
      await reload();
      setOpen(false);
      navigate('/subscription');
    } catch (e) {
      setError(e?.message || "Couldn't start the trial.");
    } finally {
      setBusy('');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={dismiss}>
      <div className="card" style={{ maxWidth: 620, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div className="item-icon icon-amber" style={{ width: 52, height: 52, margin: '0 auto 10px', fontSize: 24 }}>
            <i className="ti ti-crown"></i>
          </div>
          <h2 style={{ margin: '0 0 4px' }}>Start your 7-day free trial</h2>
          <p style={{ color: 'var(--tv-text-muted)', margin: 0, fontSize: 14 }}>
            <i className="ti ti-lock-open"></i> No credit card required. Cancel anytime — you're only asked to pay when the trial ends.
          </p>
        </div>

        {error && (
          <div style={{ color: 'var(--tv-red)', fontSize: 13, textAlign: 'center', marginBottom: 10 }}>
            <i className="ti ti-alert-circle"></i> {error}
          </div>
        )}

        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {plans.map((plan) => (
            <div key={plan.planKey} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className={`badge ${plan.accent === 'gold' ? 'badge-gold' : 'badge-forest'}`}>{plan.name}</span>
              <div><span style={{ fontSize: 24, fontWeight: 700 }}>${Number(plan.monthlyPrice).toFixed(2)}</span><span style={{ color: 'var(--tv-text-muted)' }}>/mo after trial</span></div>
              <div style={{ fontSize: 12.5, color: 'var(--tv-text-muted)' }}>{plan.tagline}</div>
              <button className={`btn ${plan.accent === 'gold' ? 'btn-secondary' : 'btn-primary'}`} style={{ justifyContent: 'center', marginTop: 'auto' }} disabled={!!busy} onClick={() => startTrial(plan.planKey)}>
                {busy === plan.planKey ? 'Starting…' : `Start free trial`}
              </button>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button className="btn btn-secondary btn-sm" onClick={dismiss}>Maybe later</button>
        </div>
      </div>
    </div>
  );
}

export function UpgradePrompt({ title }) {
  return (
    <div className="page active">
      <div className="card" style={{ maxWidth: 560, margin: '32px auto', textAlign: 'center' }}>
        <div
          className="item-icon icon-amber"
          style={{ width: 56, height: 56, margin: '4px auto 12px', fontSize: 26 }}
        >
          <i className="ti ti-crown"></i>
        </div>
        <h2 style={{ margin: '0 0 6px' }}>{title || 'A Business-plan feature'}</h2>
        <p style={{ color: 'var(--tv-text-muted)', margin: '0 0 18px' }}>
          This is included with the <strong>Business</strong> plan. Upgrade to unlock
          multi-business dashboards, invoicing, the Deal Room and more.
        </p>
        <NavLink to="/subscription" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          <i className="ti ti-crown"></i> View plans &amp; upgrade
        </NavLink>
      </div>
    </div>
  );
}
