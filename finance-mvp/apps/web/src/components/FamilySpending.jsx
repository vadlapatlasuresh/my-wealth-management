import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { currency, currency0 } from "../utils/format";
import { categoryColor } from "../utils/categoryPalette";
import DonutChart from "./viz/DonutChart";
import ProgressRing from "./viz/ProgressRing";

/* FamilySpending — kids' cards, budgets & family spending (Phase 5 extension).

   The cards a child "uses" are the GUARDIAN's own connected cards: only the guardian who owns a
   card can link it or sync it, and synced transactions are stored as household-owned copies. So
   both guardians see the same figures and nobody reads another person's live bank feed.

   Attribution: a linked card sends its whole spend to the child it's attached to (pick the card),
   or a location rule sends matching merchants to a child (pick the location). Everything folds
   from those household-owned transactions. */

const currency2 = (v) =>
  `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const budgetColor = (pct) =>
  pct >= 1 ? "var(--tv-negative, #e5484d)" : pct >= 0.8 ? "var(--tv-gold, #c9973a)" : "var(--tv-positive, #3DDC97)";

export default function FamilySpending({ members = [] }) {
  const [cards, setCards] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [rules, setRules] = useState([]);
  const [spending, setSpending] = useState(null);
  const [txns, setTxns] = useState([]);
  const [linkable, setLinkable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const memberName = useCallback(
    (id) => members.find((m) => String(m.id) === String(id))?.name || "Child",
    [members]
  );

  const load = useCallback(async () => {
    try {
      const [c, b, r, s, t] = await Promise.all([
        api.getFamilyCards().catch(() => ({ cards: [] })),
        api.getFamilyBudgets().catch(() => ({ budgets: [] })),
        api.getFamilyRules().catch(() => ({ rules: [] })),
        api.getFamilySpending().catch(() => null),
        api.getFamilyTransactions().catch(() => ({ transactions: [] })),
      ]);
      setCards(c?.cards || []);
      setBudgets(b?.budgets || []);
      setRules(r?.rules || []);
      setSpending(s);
      setTxns(t?.transactions || []);
      setError("");
    } catch (e) {
      setError(e?.message || "Couldn't load family spending.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (fn, ok) => {
    setBusy(true); setError(""); setNote("");
    try { await fn(); if (ok) setNote(ok); await load(); }
    catch (e) { setError(e?.message || "That didn't work."); }
    finally { setBusy(false); }
  };

  const sync = async () => {
    setBusy(true); setError(""); setNote("");
    try {
      const res = await api.syncFamilySpending();
      const n = res?.synced ?? 0;
      setNote(n > 0 ? `Synced ${n} new transaction${n === 1 ? "" : "s"}.` : "You're all caught up — nothing new.");
      await load();
    } catch (e) {
      setError(e?.message || "Couldn't sync right now.");
    } finally {
      setBusy(false);
    }
  };

  // Load the guardian's own linkable cards lazily (only when they open the linker).
  const [showLinker, setShowLinker] = useState(false);
  const openLinker = async () => {
    setShowLinker(true);
    try { setLinkable((await api.getLinkableCards())?.cards || []); } catch { setLinkable([]); }
  };

  const byChild = useMemo(
    () => (spending?.byChild || []).map((c) => ({ label: c.name, value: Number(c.spent) || 0, color: categoryColor(c.name) })),
    [spending]
  );
  const byCategory = useMemo(
    () => (spending?.byCategory || []).map((c) => ({ label: c.category, value: Number(c.spent) || 0, color: categoryColor(c.category) })),
    [spending]
  );
  const total = Number(spending?.total) || 0;

  if (loading) {
    return <div className="card" style={{ padding: 24 }}><div className="page-subtitle">Loading spending…</div></div>;
  }

  if (members.length === 0) {
    return (
      <div className="card" style={{ padding: 26, textAlign: "center" }}>
        <i className="ti ti-credit-card" style={{ fontSize: 32, color: "var(--tv-forest-light)" }} />
        <div className="page-title" style={{ fontSize: 17, marginTop: 8 }}>Add a child first</div>
        <div className="page-subtitle">Cards, budgets and spending attach to a child. Add one on the Children tab.</div>
      </div>
    );
  }

  return (
    <>
      {error && <Banner icon="ti ti-alert-circle" tone="negative" text={error} />}
      {note && <Banner icon="ti ti-check" tone="positive" text={note} />}

      {/* Sync + this-month headline */}
      <div className="card" style={{ padding: 18, marginBottom: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>Family spending this month</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{currency0(total)}</div>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={sync}>
          <i className="ti ti-refresh" /> Sync linked cards
        </button>
      </div>

      {/* Breakdown donuts */}
      {(byChild.length > 0 || byCategory.length > 0) && (
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginBottom: 14 }}>
          {byChild.length > 0 && (
            <ChartCard title="Who's spending" sub="This month, by child">
              <DonutChart data={byChild} size={180} thickness={22} centerLabel="Total" centerValue={currency0(total)} />
              <Legend items={byChild} />
            </ChartCard>
          )}
          {byCategory.length > 0 && (
            <ChartCard title="Where it goes" sub="This month, by category">
              <DonutChart data={byCategory} size={180} thickness={22} centerLabel="Categories" centerValue={String(byCategory.length)} />
              <Legend items={byCategory} />
            </ChartCard>
          )}
        </div>
      )}

      {/* Budgets */}
      <Section title="Budgets" sub="A monthly cap per child or for the whole family.">
        {(spending?.budgets || []).length > 0 && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            {spending.budgets.map((b) => {
              const pct = Number(b.monthlyLimit) > 0 ? Number(b.spent) / Number(b.monthlyLimit) : 0;
              return (
                <div key={b.id} style={{ textAlign: "center", flex: "0 0 auto" }}>
                  <ProgressRing value={Math.min(1, pct)} size={104} thickness={11} color={budgetColor(pct)}
                    centerText={`${Math.round(pct * 100)}%`} />
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>{b.category}</div>
                  <div className="page-subtitle" style={{ margin: 0, fontSize: 11.5 }}>
                    {b.memberName} · {currency0(b.spent)} / {currency0(b.monthlyLimit)}
                  </div>
                  <button className="btn btn-ghost btn-sm" disabled={busy} style={{ marginTop: 4 }}
                    onClick={() => run(() => api.deleteFamilyBudget(b.id))}>Remove</button>
                </div>
              );
            })}
          </div>
        )}
        <BudgetForm members={members} busy={busy} run={run} />
      </Section>

      {/* Cards */}
      <Section title="Cards" sub="Link one of your own cards to a child, or track a card by hand.">
        {cards.length > 0 && cards.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--tv-border-light)" }}>
            <i className={c.sourceType === "LINKED" ? "ti ti-credit-card" : "ti ti-credit-card-off"}
              style={{ fontSize: 20, color: "var(--tv-forest, #2f7a5b)" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{c.label}{c.last4 ? ` ····${c.last4}` : ""}</div>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>
                {memberName(c.familyMemberId)} · {c.sourceType === "LINKED" ? "Linked to your account" : "Manual"}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api.deleteFamilyCard(c.id))}>Remove</button>
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={openLinker}>
            <i className="ti ti-link" /> Link one of my cards
          </button>
        </div>
        {showLinker && <LinkCardForm members={members} linkable={linkable} busy={busy} run={run} />}
        <ManualCardForm members={members} busy={busy} run={run} />
      </Section>

      {/* Rules */}
      <Section title="Location rules" sub="Send spending at a place to a child — even on a shared card.">
        {rules.filter((r) => r.matchType === "LOCATION").map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", fontSize: 13.5 }}>
            <i className="ti ti-map-pin" style={{ color: "var(--tv-muted, #7a8a83)" }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              Spending matching <strong>“{r.locationMatch}”</strong> → {memberName(r.familyMemberId)}
            </span>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api.deleteFamilyRule(r.id))}>Remove</button>
          </div>
        ))}
        <LocationRuleForm members={members} busy={busy} run={run} />
      </Section>

      {/* Recent transactions */}
      <Section title="Recent transactions" sub="The household-owned spend behind every number.">
        {txns.length === 0 ? (
          <div className="page-subtitle" style={{ fontSize: 12.5 }}>Nothing yet. Link a card and hit sync, or add one by hand on a child.</div>
        ) : txns.slice(0, 15).map((t) => (
          <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--tv-border-light)" }}>
            <span className="page-subtitle" style={{ margin: 0, fontSize: 12, width: 92 }}>{t.occurredOn}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
              {t.merchant || t.category || "Spend"} · <span className="page-subtitle" style={{ fontSize: 12 }}>{memberName(t.familyMemberId)}</span>
              {t.source === "LINKED_SYNC" ? <i className="ti ti-link" style={{ fontSize: 12, marginLeft: 6, color: "var(--tv-muted)" }} /> : null}
            </span>
            <span style={{ fontWeight: 700, color: "var(--tv-negative, #e5484d)" }}>−{currency2(t.amount)}</span>
          </div>
        ))}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- forms

function BudgetForm({ members, busy, run }) {
  const [memberId, setMemberId] = useState("");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
      <select className="form-select" style={{ flex: "1 1 130px" }} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
        <option value="">Whole family</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <input className="form-input" style={{ flex: "1 1 120px" }} placeholder="Category (or All)" value={category} onChange={(e) => setCategory(e.target.value)} />
      <input className="form-input" style={{ flex: "0 1 110px" }} placeholder="Limit $" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
      <button className="btn btn-secondary" disabled={busy || !category.trim() || !limit}
        onClick={() => run(async () => {
          await api.addFamilyBudget({ memberId: memberId || null, category: category.trim(), monthlyLimit: limit });
          setCategory(""); setLimit(""); setMemberId("");
        })}>
        <i className="ti ti-plus" /> Add budget
      </button>
    </div>
  );
}

function LinkCardForm({ members, linkable, busy, run }) {
  const [accountId, setAccountId] = useState("");
  const [memberId, setMemberId] = useState("");
  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: "var(--tv-surface-2, rgba(0,0,0,.03))" }}>
      {linkable.length === 0 ? (
        <div className="page-subtitle" style={{ fontSize: 12.5 }}>
          No connected cards found on your account. Link a bank on the Accounts page first, or add a manual card below.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="form-select" style={{ flex: "2 1 180px" }} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Pick one of your cards…</option>
            {linkable.map((c) => <option key={c.accountId} value={c.accountId}>{c.name}{c.mask ? ` ····${c.mask}` : ""}</option>)}
          </select>
          <select className="form-select" style={{ flex: "1 1 130px" }} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">For which child…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button className="btn btn-primary" disabled={busy || !accountId || !memberId}
            onClick={() => run(async () => { await api.linkFamilyCard(memberId, { linkedAccountId: accountId }); setAccountId(""); setMemberId(""); }, "Card linked.")}>
            Link
          </button>
        </div>
      )}
    </div>
  );
}

function ManualCardForm({ members, busy, run }) {
  const [memberId, setMemberId] = useState("");
  const [label, setLabel] = useState("");
  const [last4, setLast4] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
      <select className="form-select" style={{ flex: "1 1 120px" }} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
        <option value="">Child…</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <input className="form-input" style={{ flex: "2 1 140px" }} placeholder="Card label (e.g. Robin's debit)" value={label} onChange={(e) => setLabel(e.target.value)} />
      <input className="form-input" style={{ flex: "0 1 90px" }} placeholder="Last 4" value={last4} onChange={(e) => setLast4(e.target.value)} />
      <button className="btn btn-secondary" disabled={busy || !memberId || !label.trim()}
        onClick={() => run(async () => { await api.addFamilyManualCard(memberId, { label: label.trim(), last4: last4.trim() }); setLabel(""); setLast4(""); setMemberId(""); })}>
        <i className="ti ti-plus" /> Add manual card
      </button>
    </div>
  );
}

function LocationRuleForm({ members, busy, run }) {
  const [memberId, setMemberId] = useState("");
  const [locationMatch, setLocationMatch] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      <input className="form-input" style={{ flex: "2 1 160px" }} placeholder="Merchant or place (e.g. Bookstore)" value={locationMatch} onChange={(e) => setLocationMatch(e.target.value)} />
      <select className="form-select" style={{ flex: "1 1 120px" }} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
        <option value="">Count as…</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <button className="btn btn-secondary" disabled={busy || !memberId || !locationMatch.trim()}
        onClick={() => run(async () => { await api.addFamilyRule(memberId, { matchType: "LOCATION", locationMatch: locationMatch.trim(), bucket: "SPEND" }); setLocationMatch(""); setMemberId(""); })}>
        <i className="ti ti-plus" /> Add rule
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- bits

function Section({ title, sub, children }) {
  return (
    <div className="card" style={{ padding: 18, marginBottom: 14 }}>
      <div className="page-title" style={{ fontSize: 15, marginBottom: 2 }}>{title}</div>
      <div className="page-subtitle" style={{ margin: "0 0 12px", fontSize: 12 }}>{sub}</div>
      {children}
    </div>
  );
}

function ChartCard({ title, sub, children }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="page-title" style={{ fontSize: 15, marginBottom: 2 }}>{title}</div>
      <div className="page-subtitle" style={{ margin: "0 0 12px", fontSize: 12 }}>{sub}</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>{children}</div>
    </div>
  );
}

function Legend({ items }) {
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
      {items.filter((i) => i.value > 0).map((i) => (
        <div key={i.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: i.color, flex: "0 0 auto" }} />
          <span style={{ flex: 1, minWidth: 0 }}>{i.label}</span>
          <span style={{ fontWeight: 700 }}>{currency(i.value)}</span>
        </div>
      ))}
    </div>
  );
}

function Banner({ icon, tone, text }) {
  const bg = tone === "positive" ? "var(--tv-positive-bg)" : "var(--tv-negative-bg)";
  const bd = tone === "positive" ? "var(--tv-forest, #2f7a5b)" : "var(--tv-red, #c0392b)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 12, borderRadius: 10, background: bg, border: `1px solid ${bd}` }}>
      <i className={icon} style={{ color: bd }} />
      <span style={{ fontSize: 13.5 }}>{text}</span>
    </div>
  );
}
