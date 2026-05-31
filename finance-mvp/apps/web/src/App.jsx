import { useEffect, useMemo, useState } from "react";
import { api, setAuthToken } from "./api";
import Shell from "./components/Shell";
import AIRail from "./components/AIRail";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import CashPage from "./pages/CashPage";
import InvestPage from "./pages/InvestPage";
import PlanPage from "./pages/PlanPage";
import BillPayPage from "./pages/BillPayPage";
import LearnPage from "./pages/LearnPage";
import ProfilePage from "./pages/ProfilePage";
import RealEstatePage from "./pages/RealEstatePage";
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

  const creditCards = useMemo(
    () => accounts.filter((item) => item.type === "CREDIT_CARD"),
    [accounts]
  );
  const fundingAccounts = useMemo(
    () => accounts.filter((item) => item.type === "CHECKING" || item.type === "SAVINGS"),
    [accounts]
  );

  const showRail = page === "home";

  async function loadAll() {
    try {
      setLoading(true);
      setError("");
      const [snapshotRes, accountsRes, txRes, insightsRes, intentsRes] = await Promise.all([
        api.getSnapshot(),
        api.getAccounts(),
        api.getTransactions(),
        api.getInsights(),
        api.getPaymentIntents()
      ]);
      setSnapshot(snapshotRes);
      const accountItems = accountsRes.items ?? [];
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
      setTransactions(txRes.items ?? []);
      setInsights(insightsRes.insights ?? []);
      setPaymentIntents(intentsRes.items ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function syncWithIntegrator() {
    try {
      setLoading(true);
      const resp = await api.getAggregatorAccounts();
      const items = resp.items ?? [];
      // merge by id (prefer existing)
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
      if (api.getToken()) return loadAll();
      // In dev mode, auto-login seeded demo user to speed up local development
      if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
        try {
          const resp = await api.login({ email: 'demo@finance.app', password: 'Demo@1234' });
          setAuthToken(resp.token);
          setUser(resp.user);
          await loadAll();
        } catch (err) {
          // ignore dev auto-login errors and let user sign in manually
          console.warn('Auto-login failed', err.message || err);
        }
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
      setAuthToken(response.token);
      setUser(response.user);
      await loadAll();
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
      // update intents locally and store last created
      setLastBillPayIntent(resp);
      // refresh lists
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
    setPage("billpay");
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

  let content = null;
  if (loading && !snapshot) {
    content = <p className="status">Loading TerraVest…</p>;
  } else {
    switch (page) {
      case "cash":
        content = <CashPage accounts={accounts} transactions={transactions} />;
        break;
      case "invest":
        content = <InvestPage snapshot={snapshot} />;
        break;
      case "plan":
        content = (
          <PlanPage
            planTab={planTab}
            setPlanTab={setPlanTab}
            strategy={strategy}
            setStrategy={setStrategy}
            extraPayment={extraPayment}
            setExtraPayment={setExtraPayment}
            debtScenarios={debtScenarios}
            onRunAllScenarios={runAllDebtScenarios}
            debtLoading={debtLoading}
          />
        );
        break;
      case "billpay":
        content = (
          <BillPayPage
            step={billPayStep}
            setStep={setBillPayStep}
            creditCards={creditCards}
            fundingAccounts={fundingAccounts}
            billPayForm={billPayForm}
            setBillPayForm={setBillPayForm}
            paymentIntents={paymentIntents}
            onSubmit={submitBillPay}
            onBack={() => setPage("home")}
            submitting={billPaySubmitting}
            lastIntent={lastBillPayIntent}
          />
        );
        break;
      case "learn":
        content = <LearnPage />;
        break;
      case "realestate":
        content = <RealEstatePage />;
        break;
      case "profile":
        content = (
          <ProfilePage user={user} accounts={accounts} onLogout={handleLogout} />
        );
        break;
      default:
        content = (
          <HomePage
            snapshot={snapshot}
            accounts={accounts}
            transactions={transactions}
            creditCards={creditCards}
            onPay={openBillPay}
          />
        );
    }
  }

  return (
    <Shell
      page={page === "billpay" ? "cash" : page}
      onNavigate={setPage}
      onPayBill={openBillPay}
      userEmail={user?.email ?? "User"}
      snapshotTime={snapshot ? formatDate(snapshot.computed_at) : null}
      onRefresh={loadAll}
      onSyncIntegrator={syncWithIntegrator}
      onLogout={handleLogout}
      rail={showRail ? <AIRail insights={insights} /> : null}
    >
      {error && <p className="error banner-error">{error}</p>}
      {content}
    </Shell>
  );
}
