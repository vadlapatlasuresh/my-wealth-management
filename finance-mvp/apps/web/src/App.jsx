import { useState, useMemo, useEffect } from "react";
import { api, setAuthToken, getStoredEmail, getStoredName } from "./api";
import AuthPage from "./pages/AuthPage";
import PublicSharePage from "./pages/PublicSharePage";
import PublicInvoicePage from "./pages/PublicInvoicePage";
import AppLayout from "./components/AppLayout";
import ProfileGate from "./components/ProfileGate";
import useIdleLogout from "./hooks/useIdleLogout";
import { formatDate } from "./utils/format";
import { DONE_STEP } from "./config/makePaymentFlow";

// A profile clears the mandatory KYC gate once identity + address are on file.
// SSN (individual) or EIN (business) satisfies the identity requirement; both are
// stored server-side, so this survives reloads without a client-only flag.
function isProfileComplete(p) {
  if (!p) return false;
  const addressOk =
    !!p.addressLine1 && !!p.city && !!p.state && !!p.postalCode && !!p.country;
  const dobOk = !!p.dateOfBirth;
  const identityOk =
    (p.accountType || "INDIVIDUAL") === "BUSINESS"
      ? !!p.einMasked || !!p.businessName
      : !!p.ssnMasked;
  return addressOk && dobOk && identityOk;
}

export default function App() {
  const [page, setPage] = useState("home");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  // True when a CRITICAL dataset (accounts/transactions) failed to load. Without this a
  // partial failure is invisible and every data-driven screen wrongly says "link an account".
  const [dataLoadFailed, setDataLoadFailed] = useState(false);
  const [insights, setInsights] = useState([]);
  const [paymentIntents, setPaymentIntents] = useState([]);
  const [debtScenarios, setDebtScenarios] = useState({});
  // Current strategy run with $0 extra — the "minimums only" baseline, so the Debt Lab can show
  // what the extra payment actually buys (interest + months saved). Null until a comparison runs.
  const [debtBaseline, setDebtBaseline] = useState(null);
  const [debtLoading, setDebtLoading] = useState(false);
  const [strategy, setStrategy] = useState("AVALANCHE");
  const [extraPayment, setExtraPayment] = useState(300);
  const [planTab, setPlanTab] = useState("budget");
  const [billPayStep, setBillPayStep] = useState(0);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    name: "",
    accountType: "INDIVIDUAL",
    mfaChannel: "EMAIL",
    country: "United States"
  });
  const [user, setUser] = useState(null);
  // KYC gate: the signed-in user's profile + whether we've fetched it yet.
  // `profileChecked` prevents a dashboard→gate flash before the profile loads.
  const [profile, setProfile] = useState(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [billPayForm, setBillPayForm] = useState({
    // "linked" = pay one of your linked accounts (card / mortgage / student / auto loan),
    // "external" = pay a biller that isn't linked. "card" is the legacy value for "linked".
    payee_kind: "linked",
    payee_account_id: "",
    // Legacy alias of payee_account_id, kept so previously persisted forms still resolve.
    card_account_id: "",
    funding_account_id: "",
    payee_name: "",
    payee_type: "UTILITY",
    amount: 250,
    scheduled_date: "", // "" = pay now
    memo: ""
  });
  const [billPaySubmitting, setBillPaySubmitting] = useState(false);
  const [lastBillPayIntent, setLastBillPayIntent] = useState(null);
  const [properties, setProperties] = useState([]);

  // Plaid account `type` is lowercase (depository | credit | loan | investment) and
  // `subtype` is the granular kind (checking | savings | credit card | …). Bill Pay
  // needs credit cards to pay and depository accounts to fund from — and it reads
  // camelCase fields (balance/minPayment/creditLimit/mask), so we normalize here.
  const creditCards = useMemo(
    () =>
      accounts
        .filter((a) => (a.type || "").toLowerCase() === "credit")
        .map((a) => ({
          id: a.id,
          name: a.name,
          institution: a.officialName || "",
          mask: a.mask || "",
          balance: Number(a.currentBalance) || 0,
          creditLimit: a.creditLimit != null ? Number(a.creditLimit) : null,
          minPayment: a.minimumPayment != null ? Number(a.minimumPayment) : null,
          lastStatementBalance:
            a.lastStatementBalance != null ? Number(a.lastStatementBalance) : null,
          nextPaymentDueDate: a.nextPaymentDueDate || null,
          apr: a.aprPercentage != null ? Number(a.aprPercentage) : null,
        })),
    [accounts]
  );
  const fundingAccounts = useMemo(
    () =>
      accounts
        .filter((a) => {
          const t = (a.type || "").toLowerCase();
          const s = (a.subtype || "").toLowerCase();
          return t === "depository" && (s === "checking" || s === "savings" || s === "");
        })
        .map((a) => ({
          id: a.id,
          name: a.name,
          institution: a.officialName || "",
          mask: a.mask || "",
          balance: Number(a.currentBalance) || 0,
          available:
            a.availableBalance != null
              ? Number(a.availableBalance)
              : Number(a.currentBalance) || 0,
        })),
    [accounts]
  );

  async function loadAll() {
    if (!api.getToken()) return;

    try {
      setLoading(true);
      setError("");
      setDataLoadFailed(false);

      const results = await Promise.allSettled([
        api.getSnapshot(),
        api.getAccounts(),
        api.getTransactions(),
        api.getInsights(),
        api.getPaymentIntents(),
        api.getRealEstate()
      ]);

      const [snapshotRes, accountsRes, txRes, insightsRes, intentsRes, propertiesRes] =
        results;

      if (snapshotRes.status === "fulfilled") {
        setSnapshot(snapshotRes.value);
      }
      if (accountsRes.status === "fulfilled") {
        const accountItems = accountsRes.value ?? [];
        setAccounts(accountItems);
        // Plaid `type` is lowercase (credit | depository | loan | investment) — matching
        // on "CREDIT_CARD"/"CHECKING" here never hit, so these defaults never applied.
        const firstFunding = accountItems.find(
          (a) => String(a.type || "").toLowerCase() === "depository"
        );
        setBillPayForm((prev) => ({
          ...prev,
          funding_account_id: prev.funding_account_id || firstFunding?.id || ""
        }));
      }
      if (txRes.status === "fulfilled") {
        setTransactions(txRes.value ?? []);
      }
      if (insightsRes.status === "fulfilled") {
        const v = insightsRes.value;
        setInsights(Array.isArray(v) ? v : (v?.insights ?? []));
      }
      if (intentsRes.status === "fulfilled") {
        setPaymentIntents(intentsRes.value?.items ?? []);
      }
      if (propertiesRes.status === "fulfilled") {
        const v = propertiesRes.value;
        setProperties(Array.isArray(v) ? v : (v?.items ?? []));
      }

      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length === results.length) {
        throw failed[0].reason;
      }
      if (failed.length > 0) {
        console.warn(
          "Some data failed to load:",
          failed.map((f) => f.reason?.message || f.reason)
        );
      }
      // Accounts + transactions drive every data-derived screen. If either failed we must say
      // so — otherwise the empty states claim "no data" when the truth is "couldn't load".
      if (accountsRes.status === "rejected" || txRes.status === "rejected") {
        setDataLoadFailed(true);
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function syncWithIntegrator() {
    try {
      setLoading(true);
      // This will eventually be replaced by a Plaid-specific sync
      const resp = await api.getAggregatorAccounts();
      const items = resp.items ?? [];
      setAccounts((prev) => {
        const byId = Object.fromEntries(prev.map((a) => [a.id, a]));
        for (const it of items) {
          if (!byId[it.id]) byId[it.id] = it;
        }
        return Object.values(byId);
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      if (api.getToken()) {
        setUser({ email: getStoredEmail() || authForm.email, name: getStoredName() });
        await refreshProfile();
        return loadAll();
      }
    }
    init();
  }, []);

  // Fetch the profile that the KYC gate is keyed off. Best-effort: a failure here
  // must not strand the user, so we mark it checked either way.
  async function refreshProfile() {
    try {
      const p = await api.getProfile();
      setProfile(p);
      return p;
    } catch {
      return null;
    } finally {
      setProfileChecked(true);
    }
  }

  // Shared success path: store the session for a token-bearing auth response
  // (from login, MFA verify, or register) and load the dashboard. AuthPage owns
  // the network calls now (login may require an MFA second step), so it hands the
  // final token-bearing response here.
  async function onAuthenticated(response) {
    if (!response || !response.token) {
      throw new Error((response && response.message) || "Authentication failed");
    }
    const email = response.email || authForm.email;
    const name = response.name || authForm.name || "";
    setAuthToken(response.token, email, name);
    setUser({ email, name });
    setError("");
    // Load the profile first so the KYC gate can decide before the dashboard paints.
    await refreshProfile();
    await loadAll();
  }

  async function submitAuth(event) {
    // Registration still flows through the parent; login (incl. MFA) is handled
    // inside AuthPage and reports back via onAuthenticated.
    event.preventDefault();
    try {
      setError("");
      const response = await api.register(authForm);
      await onAuthenticated(response);
      // Record the ToS/Privacy consent server-side now that we're authenticated.
      // Best-effort: a ledger write must never fail the signup the user just did.
      if (authForm.agreedToTerms) {
        const CONSENT_VERSION = 1;
        Promise.allSettled([
          api.acceptDisclaimer("terms", CONSENT_VERSION),
          api.acceptDisclaimer("privacy", CONSENT_VERSION),
        ]);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitBillPay() {
    setBillPaySubmitting(true);
    try {
      setError("");
      // "card" is the legacy spelling of "linked" — treat both as paying a linked account.
      const isLinked = billPayForm.payee_kind !== "external";
      const payeeAccountId = billPayForm.payee_account_id || billPayForm.card_account_id;
      const payeeAccount = accounts.find((a) => a.id === payeeAccountId);
      const payeeName = isLinked
        ? `${payeeAccount?.officialName || payeeAccount?.name || "Account"} ····${String(payeeAccount?.mask || "").slice(-4)}`
        : billPayForm.payee_name;

      // A stable idempotency key for this attempt prevents accidental double charges
      // if the user double-clicks or the network retries.
      const idempotencyKey =
        billPayForm._idempotencyKey ||
        `bp-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

      const resp = await api.createBillPayIntent({
        amount: Number(billPayForm.amount),
        currency: "USD",
        payee: payeeName,
        // payee_type is set from the selected account's category (CREDIT_CARD for cards,
        // LOAN for mortgage/student/auto), so it's already correct for linked payees.
        payeeType: billPayForm.payee_type,
        fromAccountId: billPayForm.funding_account_id,
        toAccountId: isLinked ? payeeAccountId : null,
        scheduledDate: billPayForm.scheduled_date || null,
        memo: billPayForm.memo || null,
        idempotencyKey
      });
      setLastBillPayIntent(resp);
      await loadAll();
      setBillPayStep(DONE_STEP);
    } catch (err) {
      setError(err.message);
    } finally {
      setBillPaySubmitting(false);
    }
  }

  async function cancelPaymentIntent(id) {
    try {
      setError("");
      await api.cancelBillPayIntent(id);
      const res = await api.getPaymentIntents();
      setPaymentIntents(res?.items ?? []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function runAllDebtScenarios(priorityDebtIds = []) {
    setDebtLoading(true);
    try {
      const extra = Number(extraPayment);
      const priority = Array.isArray(priorityDebtIds) ? priorityDebtIds : [];
      // Run all three strategies at the chosen extra payment (honoring any "pay off first" picks),
      // plus the current strategy at $0 extra (the minimums-only baseline) — all in one batch.
      const [avalanche, snowball, hybrid, baseline] = await Promise.all([
        api.runDebtScenario({ strategy: "AVALANCHE", extra_payment_monthly: extra, priority_debt_ids: priority }),
        api.runDebtScenario({ strategy: "SNOWBALL", extra_payment_monthly: extra, priority_debt_ids: priority }),
        api.runDebtScenario({ strategy: "HYBRID", extra_payment_monthly: extra, priority_debt_ids: priority }),
        extra > 0 ? api.runDebtScenario({ strategy, extra_payment_monthly: 0, priority_debt_ids: priority }) : Promise.resolve(null),
      ]);
      setDebtScenarios({ AVALANCHE: avalanche, SNOWBALL: snowball, HYBRID: hybrid });
      setDebtBaseline(baseline);
    } catch (err) {
      setError(err.message);
    } finally {
      setDebtLoading(false);
    }
  }

  function handleLogout() {
    setAuthToken("");
    setUser(null);
    setProfile(null);
    setProfileChecked(false);
    setSnapshot(null);
    setAccounts([]);
    setTransactions([]);
    setInsights([]);
    setPage("home");
  }

  // When any API call reports the token is expired/invalid (401/403), drop to the
  // login screen so a stale token doesn't leave every page stuck on errors.
  useEffect(() => {
    function onUnauthorized() {
      setAuthToken("");
      setUser(null);
      setProfile(null);
      setProfileChecked(false);
      setError("Your session expired. Please sign in again.");
    }
    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, []);

  // Auto-logout after the user's configured idle window (default 5 min) while signed in.
  useIdleLogout(!!user, handleLogout);

  function openBillPay() {
    const firstFunding = accounts.find(
      (a) => String(a.type || "").toLowerCase() === "depository"
    );
    // Start with no payee selected — the user picks one from the categorized list.
    setBillPayForm((prev) => ({
      ...prev,
      payee_kind: "linked",
      payee_account_id: "",
      card_account_id: "",
      funding_account_id: firstFunding?.id || prev.funding_account_id || "",
      payee_name: "",
      payee_type: "UTILITY",
      amount: "",
      scheduled_date: "",
      memo: ""
    }));
    setLastBillPayIntent(null);
    setBillPayStep(0);
  }

  // Public, unauthenticated document-share recipient page. Rendered ahead of the
  // auth gate so a CPA/trusted party can open a shared link without an account.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/shared/")) {
    return <PublicSharePage />;
  }
  // Public, unauthenticated invoice page a customer opens to view and pay.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/invoice/")) {
    return <PublicInvoicePage />;
  }

  if (!api.getToken()) {
    return (
      <AuthPage
        authMode={authMode}
        setAuthMode={setAuthMode}
        authForm={authForm}
        setAuthForm={setAuthForm}
        error={error}
        setError={setError}
        onSubmit={submitAuth}
        onAuthenticated={onAuthenticated}
      />
    );
  }

  // Wait for the profile check before deciding gate-vs-dashboard, so an
  // already-complete user never sees the gate flash on load.
  if (!profileChecked) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--tv-bg)", color: "var(--tv-text-muted)", fontSize: 14 }}>
        <i className="ti ti-loader-2" style={{ marginRight: 8 }}></i> Loading your account…
      </div>
    );
  }

  // Mandatory KYC gate: block the app until identity + address are on file.
  // Only gate when we actually loaded a profile — a transient fetch failure
  // (profile === null) must not lock an already-onboarded user out of the app.
  if (profile && !isProfileComplete(profile)) {
    return (
      <ProfileGate
        profile={profile}
        user={user}
        onComplete={async () => { await refreshProfile(); await loadAll(); }}
      />
    );
  }

  return (
    <AppLayout
      snapshot={snapshot}
      accounts={accounts}
      transactions={transactions}
      insights={insights}
      paymentIntents={paymentIntents}
      debtScenarios={debtScenarios}
      debtBaseline={debtBaseline}
      debtLoading={debtLoading}
      strategy={strategy}
      extraPayment={extraPayment}
      planTab={planTab}
      billPayStep={billPayStep}
      user={user}
      billPayForm={billPayForm}
      billPaySubmitting={billPaySubmitting}
      lastBillPayIntent={lastBillPayIntent}
      properties={properties}
      creditCards={creditCards}
      fundingAccounts={fundingAccounts}
      loading={loading}
      error={error}
      setPage={setPage}
      setAuthMode={setAuthMode}
      setAuthForm={setAuthForm}
      setSnapshot={setSnapshot}
      setAccounts={setAccounts}
      setTransactions={setTransactions}
      dataLoadFailed={dataLoadFailed}
      setInsights={setInsights}
      setPaymentIntents={setPaymentIntents}
      setDebtScenarios={setDebtScenarios}
      setDebtLoading={setDebtLoading}
      setStrategy={setStrategy}
      setExtraPayment={setExtraPayment}
      setPlanTab={setPlanTab}
      setBillPayStep={setBillPayStep}
      setUser={setUser}
      setBillPayForm={setBillPayForm}
      setBillPaySubmitting={setBillPaySubmitting}
      setLastBillPayIntent={setLastBillPayIntent}
      setProperties={setProperties}
      setError={setError}
      setLoading={setLoading}
      loadAll={loadAll}
      syncWithIntegrator={syncWithIntegrator}
      submitAuth={submitAuth}
      submitBillPay={submitBillPay}
      cancelPaymentIntent={cancelPaymentIntent}
      runAllDebtScenarios={runAllDebtScenarios}
      handleLogout={handleLogout}
      openBillPay={openBillPay}
      formatDate={formatDate}
    />
  );
}
