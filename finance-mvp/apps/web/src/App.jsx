import { useState, useMemo, useEffect } from "react";
import { api, setAuthToken, getStoredEmail } from "./api";
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
    email: "demo@finance.app",
    password: "Demo@1234"
  });
  const [user, setUser] = useState(null);
  const [billPayForm, setBillPayForm] = useState({
    card_account_id: "",
    funding_account_id: "",
    amount: 250
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
        setInsights(insightsRes.value?.insights ?? []);
      }
      if (intentsRes.status === "fulfilled") {
        setPaymentIntents(intentsRes.value?.items ?? []);
      }
      if (propertiesRes.status === "fulfilled") {
        setProperties(propertiesRes.value?.items ?? []);
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
        setUser({ email: getStoredEmail() || authForm.email });
        return loadAll();
      }
    }
    init();
  }, []);

  async function submitAuth(event) {
    event.preventDefault();
    try {
      setError("");
      const response =
        authMode === "login" ? await api.login(authForm) : await api.register(authForm);
      
      if (response && response.token) {
        setAuthToken(response.token, authForm.email);
        setUser({ email: authForm.email });
        await loadAll();
      } else {
        throw new Error(response.message || "Authentication failed");
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitBillPay() {
    setBillPaySubmitting(true);
    try {
      setError("");
      const resp = await api.createBillPayIntent({
        ...billPayForm,
        amount: Number(billPayForm.amount),
        currency: "USD"
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

  function openBillPay() {
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
        onSubmit={submitAuth}
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
      runAllDebtScenarios={runAllDebtScenarios}
      handleLogout={handleLogout}
      openBillPay={openBillPay}
      formatDate={formatDate}
    />
  );
}
