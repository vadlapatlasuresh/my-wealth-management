import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { currency0 } from "../utils/format";
import {
  BUCKETS, CADENCES, ageLabel, annualizedAllowance, nextAllowanceDate,
  savingsProjection, splitAmounts, summarizeBalances, summarizeChores, validateSplit,
} from "../utils/family";

/* FamilyPage — family / kids mode (Phase 5, backlog B3). feature_key: individual.family (Premium).

   The guardian view: each child's spend / save / give buckets, their allowance and what it costs
   over a year, chores with rewards, and the ledger behind every number.

   Children are records the household owns, NOT user accounts — see V18__family_mode.sql. So this
   page is a guardian's tool, and every figure on it is folded from the append-only ledger the
   backend keeps, never a stored balance. */

const currency2 = (v) =>
  `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EMPTY_FORM = {
  name: "", birthYear: "", allowanceAmount: "", allowanceCadence: "WEEKLY", allowanceDay: 6,
  splitSpendPct: 50, splitSavePct: 30, splitGivePct: 20,
};

function Header() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="page-title">Family</div>
      <div className="page-subtitle">
        Allowance, chores and a spend / save / give jar for each child — with a ledger behind
        every number, so nobody has to remember who paid what.
      </div>
    </div>
  );
}

/** Add / edit a child. Split validation mirrors the server rule exactly. */
function MemberForm({ initial, busy, onCancel, onSave }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const split = {
    spend: Number(form.splitSpendPct),
    save: Number(form.splitSavePct),
    give: Number(form.splitGivePct),
  };
  const splitCheck = validateSplit(split);
  const preview = splitAmounts(form.allowanceAmount, split);
  const yearly = annualizedAllowance(form.allowanceAmount, form.allowanceCadence);
  const weekly = form.allowanceCadence !== "MONTHLY";

  return (
    <div className="card" style={{ padding: 18, marginBottom: 18 }}>
      <div className="page-title" style={{ fontSize: 16, marginBottom: 12 }}>
        {initial ? "Edit child" : "Add a child"}
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <label>
          <div className="page-subtitle" style={{ margin: "0 0 4px", fontSize: 11.5 }}>Name</div>
          <input className="form-input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Robin" />
        </label>
        <label>
          <div className="page-subtitle" style={{ margin: "0 0 4px", fontSize: 11.5 }}>Birth year (optional)</div>
          <input className="form-input" value={form.birthYear} onChange={(e) => set("birthYear", e.target.value)} placeholder="2015" />
        </label>
        <label>
          <div className="page-subtitle" style={{ margin: "0 0 4px", fontSize: 11.5 }}>Allowance</div>
          <input className="form-input" value={form.allowanceAmount} onChange={(e) => set("allowanceAmount", e.target.value)} placeholder="10.00" />
        </label>
        <label>
          <div className="page-subtitle" style={{ margin: "0 0 4px", fontSize: 11.5 }}>How often</div>
          <select className="form-select" value={form.allowanceCadence} onChange={(e) => set("allowanceCadence", e.target.value)}>
            {CADENCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label>
          <div className="page-subtitle" style={{ margin: "0 0 4px", fontSize: 11.5 }}>
            {weekly ? "Day of week" : "Day of month"}
          </div>
          <input className="form-input" value={form.allowanceDay} onChange={(e) => set("allowanceDay", e.target.value)}
            placeholder={weekly ? "6 (Saturday)" : "1"} />
        </label>
      </div>

      <div className="page-subtitle" style={{ margin: "14px 0 6px", fontSize: 12 }}>
        Split each payment · spend / save / give
      </div>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
        {[["splitSpendPct", "Spend"], ["splitSavePct", "Save"], ["splitGivePct", "Give"]].map(([k, label]) => (
          <label key={k}>
            <div className="page-subtitle" style={{ margin: "0 0 4px", fontSize: 11.5 }}>{label} %</div>
            <input className="form-input" value={form[k]} onChange={(e) => set(k, e.target.value)} />
          </label>
        ))}
      </div>

      {!splitCheck.valid ? (
        <div className="page-subtitle" style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--tv-negative)" }}>
          <i className="ti ti-alert-circle" /> {splitCheck.error}
        </div>
      ) : preview.total > 0 && (
        <div className="page-subtitle" style={{ margin: "10px 0 0", fontSize: 12.5 }}>
          Each payment lands as {currency2(preview.SPEND)} spend · {currency2(preview.SAVE)} save
          · {currency2(preview.GIVE)} give — about <strong>{currency0(yearly)} a year</strong>.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="btn btn-primary" disabled={busy || !splitCheck.valid || !form.name.trim()}
          onClick={() => onSave(form)}>
          {busy ? "Saving…" : initial ? "Save changes" : "Add child"}
        </button>
        <button className="btn btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function BucketRow({ row }) {
  return (
    <div style={{ flex: "1 1 120px", minWidth: 120 }}>
      <div className="page-subtitle" style={{ margin: 0, fontSize: 11.5 }}>
        <i className={row.icon} /> {row.label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{currency2(row.amount)}</div>
      <div className="page-subtitle" style={{ margin: 0, fontSize: 11 }}>{row.help}</div>
    </div>
  );
}

function MemberCard({ member, onPay, onEdit, onArchive, busy }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null); // { entries, chores }
  const [choreTitle, setChoreTitle] = useState("");
  const [choreReward, setChoreReward] = useState("");

  const balances = summarizeBalances(member.balances);
  const nextPay = nextAllowanceDate(member.allowanceCadence, member.allowanceDay);
  const age = ageLabel(member.birthYear);
  const chores = summarizeChores(detail?.chores);
  const saveRow = balances.rows.find((r) => r.key === "SAVE");
  const perPeriodSave = splitAmounts(member.allowanceAmount, {
    spend: member.split?.spend ?? 100, save: member.split?.save ?? 0, give: member.split?.give ?? 0,
  }).SAVE;
  const projection = savingsProjection(saveRow?.amount, perPeriodSave, member.allowanceCadence, 12);

  const loadDetail = useCallback(async () => {
    // Both calls are re-authorized server-side against this member's household, so a failure
    // here is a genuine error rather than a permission subtlety — show the empty state and let
    // the page-level error surface anything the guardian can act on.
    const [ledger, choreRes] = await Promise.all([
      api.getFamilyLedger(member.id).catch(() => ({ entries: [] })),
      api.getFamilyChores(member.id).catch(() => ({ chores: [] })),
    ]);
    setDetail({ entries: ledger?.entries || [], chores: choreRes?.chores || [] });
  }, [member.id]);

  useEffect(() => { if (open && !detail) loadDetail(); }, [open, detail, loadDetail]);

  return (
    <div className="card" style={{ padding: 18, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <span style={{
          display: "inline-flex", width: 42, height: 42, borderRadius: "50%",
          alignItems: "center", justifyContent: "center",
          background: "var(--tv-forest)", color: "var(--tv-on-accent, #fff)",
          fontWeight: 700, flex: "0 0 auto",
        }}>{member.name.slice(0, 1).toUpperCase()}</span>

        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="page-title" style={{ fontSize: 16, margin: 0 }}>{member.name}</div>
          <div className="page-subtitle" style={{ margin: "2px 0 0", fontSize: 12.5 }}>
            {age ? `${age} · ` : ""}
            {currency2(member.allowanceAmount)} {(CADENCES.find((c) => c.value === member.allowanceCadence)?.label || "").toLowerCase()}
            {nextPay ? ` · next ${nextPay.toLocaleDateString()}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onPay(member)}>
            <i className="ti ti-coin" /> Pay allowance
          </button>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onEdit(member)}>Edit</button>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onArchive(member)}>Archive</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 16 }}>
        {balances.rows.map((row) => <BucketRow key={row.key} row={row} />)}
        <div style={{ flex: "1 1 120px", minWidth: 120 }}>
          <div className="page-subtitle" style={{ margin: 0, fontSize: 11.5 }}><i className="ti ti-sum" /> Total</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{currency2(balances.total)}</div>
          {perPeriodSave > 0 && (
            <div className="page-subtitle" style={{ margin: 0, fontSize: 11 }}>
              Saving reaches {currency0(projection.projected)} in a year
            </div>
          )}
        </div>
      </div>

      <button className="btn btn-secondary btn-sm" style={{ marginTop: 14 }} onClick={() => setOpen((o) => !o)}>
        <i className={open ? "ti ti-chevron-up" : "ti ti-chevron-down"} />
        {open ? " Hide" : " Chores & ledger"}
        {member.openChores > 0 ? ` (${member.openChores} chore${member.openChores === 1 ? "" : "s"})` : ""}
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          {/* Chores */}
          <div className="page-title" style={{ fontSize: 14, marginBottom: 8 }}>Chores</div>
          {chores.openCount === 0 && chores.done.length === 0 && (
            <div className="page-subtitle" style={{ fontSize: 12.5 }}>Nothing on the list yet.</div>
          )}
          {[...chores.open, ...chores.done].map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--tv-border-light)" }}>
              <i className={c.completedAt ? "ti ti-circle-check" : "ti ti-circle"}
                style={{ color: c.completedAt ? "var(--tv-positive)" : "var(--tv-text-muted)", fontSize: 18 }} />
              <div style={{ flex: 1, minWidth: 0, textDecoration: c.completedAt ? "line-through" : "none" }}>
                {c.title}
              </div>
              <span className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>{currency2(c.rewardAmount)}</span>
              {!c.completedAt && (
                <button className="btn btn-secondary btn-sm"
                  onClick={() => api.completeFamilyChore(member.id, c.id).then(loadDetail).catch(() => {})}>
                  Mark done
                </button>
              )}
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <input className="form-input" style={{ flex: "2 1 160px" }} placeholder="Add a chore"
              value={choreTitle} onChange={(e) => setChoreTitle(e.target.value)} />
            <input className="form-input" style={{ flex: "1 1 90px" }} placeholder="Reward"
              value={choreReward} onChange={(e) => setChoreReward(e.target.value)} />
            <button className="btn btn-secondary" disabled={!choreTitle.trim()}
              onClick={() => api.addFamilyChore(member.id, { title: choreTitle, rewardAmount: choreReward })
                .then(() => { setChoreTitle(""); setChoreReward(""); return loadDetail(); })
                .catch(() => {})}>
              Add
            </button>
          </div>

          {/* Ledger */}
          <div className="page-title" style={{ fontSize: 14, margin: "18px 0 8px" }}>Ledger</div>
          {(detail?.entries || []).length === 0 ? (
            <div className="page-subtitle" style={{ fontSize: 12.5 }}>No money has moved yet.</div>
          ) : detail.entries.slice(0, 12).map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--tv-border-light)" }}>
              <span className="page-subtitle" style={{ margin: 0, fontSize: 12, width: 92 }}>{e.occurredOn}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                {e.note || e.type} · <span className="page-subtitle" style={{ fontSize: 12 }}>{e.bucket}</span>
              </span>
              <span style={{ fontWeight: 700, color: Number(e.amount) < 0 ? "var(--tv-negative)" : "var(--tv-positive)" }}>
                {Number(e.amount) < 0 ? "−" : "+"}{currency2(Math.abs(Number(e.amount)))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FamilyPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // null | 'new' | member
  const [needsHousehold, setNeedsHousehold] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getFamily();
      setMembers(res?.members || []);
      setNeedsHousehold(false);
    } catch (e) {
      // 409 = "you're not in a household", which is a setup step, not an error.
      if (/household/i.test(e?.message || "")) setNeedsHousehold(true);
      else setError(e?.message || "Couldn't load your family.");
      setMembers([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (form) => {
    setBusy(true);
    setError("");
    const payload = {
      name: form.name,
      birthYear: form.birthYear || null,
      allowanceAmount: form.allowanceAmount || 0,
      allowanceCadence: form.allowanceCadence,
      allowanceDay: form.allowanceDay || null,
      splitSpendPct: Number(form.splitSpendPct),
      splitSavePct: Number(form.splitSavePct),
      splitGivePct: Number(form.splitGivePct),
    };
    try {
      if (editing && editing !== "new") await api.updateFamilyMember(editing.id, payload);
      else await api.addFamilyMember(payload);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e?.message || "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e?.message || "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const totals = useMemo(() => {
    const list = members || [];
    return {
      kids: list.length,
      held: list.reduce((s, m) => s + Number(m.balances?.TOTAL || 0), 0),
      yearly: list.reduce((s, m) => s + annualizedAllowance(m.allowanceAmount, m.allowanceCadence), 0),
    };
  }, [members]);

  if (members === null) {
    return (
      <div className="page active">
        <Header />
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <div className="page-subtitle">Loading…</div>
        </div>
      </div>
    );
  }

  if (needsHousehold) {
    return (
      <div className="page active">
        <Header />
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-home-heart" style={{ fontSize: 34, color: "var(--tv-forest-light)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>Family lives in a household</div>
          <div className="page-subtitle" style={{ marginBottom: 16 }}>
            Children are shared with everyone in your household, so both guardians see the same
            ledger. Create or join one first.
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/household")}>
            <i className="ti ti-arrow-right" /> Go to Household
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page active">
      <Header />

      {error && (
        <div className="card" style={{ padding: 12, marginBottom: 14, borderLeft: "3px solid var(--tv-negative)" }}>
          <span className="page-subtitle" style={{ margin: 0, fontSize: 13 }}>
            <i className="ti ti-alert-circle" /> {error}
          </span>
        </div>
      )}

      {members.length > 0 && (
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
          <div className="card" style={{ padding: 14 }}>
            <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>Children</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{totals.kids}</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>Held for them</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{currency0(totals.held)}</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>Allowance / year</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{currency0(totals.yearly)}</div>
          </div>
        </div>
      )}

      {editing ? (
        <MemberForm
          initial={editing === "new" ? null : {
            name: editing.name,
            birthYear: editing.birthYear ?? "",
            allowanceAmount: editing.allowanceAmount ?? "",
            allowanceCadence: editing.allowanceCadence ?? "WEEKLY",
            allowanceDay: editing.allowanceDay ?? 6,
            splitSpendPct: editing.split?.spend ?? 100,
            splitSavePct: editing.split?.save ?? 0,
            splitGivePct: editing.split?.give ?? 0,
          }}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      ) : (
        <button className="btn btn-primary" style={{ marginBottom: 18 }} onClick={() => setEditing("new")}>
          <i className="ti ti-plus" /> Add a child
        </button>
      )}

      {members.length === 0 && !editing ? (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-users-group" style={{ fontSize: 34, color: "var(--tv-forest-light)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>No children yet</div>
          <div className="page-subtitle">
            Add one to start tracking allowance, chores, and their spend / save / give jars.
          </div>
        </div>
      ) : (
        members.map((m) => (
          <MemberCard
            key={m.id}
            member={m}
            busy={busy}
            onPay={(member) => act(() => api.recordAllowancePayout(member.id, { type: "ALLOWANCE" }))}
            onEdit={setEditing}
            onArchive={(member) => act(() => api.removeFamilyMember(member.id))}
          />
        ))
      )}
    </div>
  );
}
