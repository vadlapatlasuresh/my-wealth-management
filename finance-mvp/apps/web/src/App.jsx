import { useState, useMemo, useEffect } from "react";
import { api, setAuthToken, getStoredEmail, getStoredName } from "./api";
import AuthPage from "./pages/AuthPage";
import AppLayout from "./components/AppLayout";
import { formatDate } from "./utils/format";

export default function App() {
  const [page, setPage] = useState("home");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [insights, setInsights] = useState([]);
  const [paymentIntents, setPaymentIntents] = useState([]);
  const [debtScenarios, setDebtScenarios] = useState({});
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
  const [billPayForm, setBillPayForm] = useState({
    payee_kind: "card", // "card" = pay one of your cards, "external" = pay a biller
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

  const creditCards = useMemo(
    () => accounts.filter((item) => item.type === "CREDIT_CARD"),
    [accounts]
  );
  const fundingAccounts = useMemo(
    () => accounts.filter((item) => item.type === "CHECKING" || item.type === "SAVINGS"),
    [accounts]
  );

  async function loadAll() {
    if (!api.getToken()) return;

    try {
      setLoading(true);
      setError("");

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
        const firstCard = accountItems.find((a) => a.type === "CREDIT_CARD");
        const firstFunding = accountItems.find(
          (a) => a.type === "CHECKING" || a.type === "SAVINGS"
        );
        setBillPayForm((prev) => ({
          ...prev,
          card_account_id: prev.card_account_id || firstCard?.id || "",
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
        return loadAll();
      }
    }
    init();
  }, []);

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
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitBillPay() {
    setBillPaySubmitting(true);
    try {
      setError("");
      const isCard = billPayForm.payee_kind === "card";
      const card = accounts.find((a) => a.id === billPayForm.card_account_id);
      const payeeName = isCard
        ? `${card?.institution || card?.name || "Card"} ····${String(card?.account_number || card?.mask || "").slice(-4)}`
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
        payeeType: isCard ? "CREDIT_CARD" : billPayForm.payee_type,
        fromAccountId: billPayForm.funding_account_id,
        toAccountId: isCard ? billPayForm.card_account_id : null,
        scheduledDate: billPayForm.scheduled_date || null,
        memo: billPayForm.memo || null,
        idempotencyKey
      });
      setLastBillPayIntent(resp);
      await loadAll();
      setBillPayStep(4);
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

  async function runAllDebtScenarios() {
    setDebtLoading(true);
    try {
      const strategies = ["AVALANCHE", "SNOWBALL", "HYBRID"];
      const results = await Promise.all(
        strategies.map((s) =>
          api.runDebtScenario({
            strategy: s,
            extra_payment_monthly: Number(extraPayment)
          })
        )
      );
      setDebtScenarios({
        AVALANCHE: results[0],
        SNOWBALL: results[1],
        HYBRID: results[2]
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setDebtLoading(false);
    }
  }

  function handleLogout() {
    setAuthToken("");
    setUser(null);
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
      setError("Your session expired. Please sign in again.");
    }
    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, []);

  function openBillPay() {
    const firstCard = accounts.find((a) => a.type === "CREDIT_CARD");
    const firstFunding = accounts.find((a) => a.type === "CHECKING" || a.type === "SAVINGS");
    setBillPayForm((prev) => ({
      ...prev,
      payee_kind: "card",
      card_account_id: firstCard?.id || "",
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

  return (
    <AppLayout
      snapshot={snapshot}
      accounts={accounts}
      transactions={transactions}
      insights={insights}
      paymentIntents={paymentIntents}
      debtScenarios={debtScenarios}
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
