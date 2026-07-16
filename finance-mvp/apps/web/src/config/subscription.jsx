import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api';

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
