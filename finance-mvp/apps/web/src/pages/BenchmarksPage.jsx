import { useCallback, useEffect, useMemo, useState } from "react";
import { currency0 } from "../utils/format";
import {
  AGE_BANDS, INCOME_BANDS, REGIONS,
  buildBenchmarks, computeOwnMetrics, loadPeerBenchmarks,
} from "../utils/benchmarks";
import { isFlagEnabled, FLAGS } from "../config/featureFlags";
import { api } from "../api";

/* BenchmarksPage — "how do I compare?" (Phase 4, backlog B1). feature_key: individual.benchmarks.

   Two halves, and the split is the design:
     • YOUR NUMBERS  — always shown, always real, computed from your own linked data.
     • VS PEOPLE LIKE YOU — shown only when a real anonymized dataset answered for a cohort
       large enough to stay anonymous, and only after you explicitly opted in.

   There is no sample/demo peer curve in this app. When no dataset is connected the page says so
   plainly and still earns its place by showing your own figures. See utils/benchmarks.js. */

const fmt = (value, format) => {
  if (value == null) return "—";
  if (format === "currency") return currency0(value);
  if (format === "percent") return `${Math.round(value * 100)}%`;
  return `${value.toFixed(1)} mo`;
};

function Header() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="page-title">How you compare</div>
      <div className="page-subtitle">
        Your own numbers, and — if you want it — where they sit against people in a similar
        situation. Aggregate and anonymized, opt-in, and never sold.
      </div>
    </div>
  );
}

/** The percentile strip: published curve as ticks, with your position marked. */
function PercentileBar({ comparison, value, format }) {
  const points = Object.entries(comparison.percentiles || {})
    .map(([p, v]) => [Number(p), Number(v)])
    .sort((a, b) => a[0] - b[0]);
  const pct = Math.max(2, Math.min(98, comparison.percentile));

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ position: "relative", height: 10, borderRadius: 6, background: "var(--tv-chip)" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`,
          borderRadius: 6, background: "var(--tv-forest-light)", opacity: 0.55,
        }} />
        <div
          title={`You: ${fmt(value, format)}`}
          style={{
            position: "absolute", left: `${pct}%`, top: -4, width: 3, height: 18,
            marginLeft: -1.5, borderRadius: 2, background: "var(--tv-gold)",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {points.map(([p, v]) => (
          <span key={p} className="page-subtitle" style={{ margin: 0, fontSize: 10.5 }}>
            {p}th · {fmt(v, format)}
          </span>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ row }) {
  const { comparison } = row;
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div className="page-title" style={{ fontSize: 15, margin: 0 }}>{row.label}</div>
          <div className="page-subtitle" style={{ margin: "2px 0 0", fontSize: 12 }}>{row.help}</div>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{fmt(row.value, row.format)}</div>
      </div>

      {comparison ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <span style={{
              display: "inline-flex", padding: "3px 10px", borderRadius: 999,
              background: "var(--tv-sage-pale)", color: "var(--tv-forest-light)",
              fontSize: 12, fontWeight: 700,
            }}>
              {comparison.bounded === "above" ? `${comparison.percentile}th or above`
                : comparison.bounded === "below" ? `${comparison.percentile}th or below`
                : `${comparison.percentile}th percentile`}
            </span>
            <span className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>{comparison.label}</span>
            <span className="page-subtitle" style={{ margin: 0, fontSize: 12.5, marginLeft: "auto" }}>
              Median {fmt(comparison.median, row.format)}
            </span>
          </div>
          <PercentileBar comparison={comparison} value={row.value} format={row.format} />
          <div className="page-subtitle" style={{ margin: "10px 0 0", fontSize: 11.5 }}>
            {comparison.source} · {comparison.sampleSize.toLocaleString()} people
          </div>
        </>
      ) : (
        <div className="page-subtitle" style={{ margin: "10px 0 0", fontSize: 12.5 }}>
          <i className="ti ti-info-circle" /> {row.unavailableReason}
        </div>
      )}
    </div>
  );
}

export default function BenchmarksPage({ accounts = [], transactions = [], snapshot = null }) {
  const [peer, setPeer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cohort, setCohort] = useState({ ageBand: "", incomeBand: "", region: "" });

  const live = isFlagEnabled(FLAGS.BENCHMARKS_LIVE);

  const refresh = useCallback(async () => {
    const p = await loadPeerBenchmarks();
    setPeer(p);
    if (p?.cohort) {
      setCohort({
        ageBand: p.cohort.ageBand === "all" ? "" : p.cohort.ageBand || "",
        incomeBand: p.cohort.incomeBand === "all" ? "" : p.cohort.incomeBand || "",
        region: p.cohort.region === "all" ? "" : p.cohort.region || "",
      });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const own = useMemo(
    () => computeOwnMetrics({ accounts, transactions, snapshot }),
    [accounts, transactions, snapshot]
  );
  const model = useMemo(() => buildBenchmarks({ own, peer }), [own, peer]);

  const setOptIn = async (on) => {
    setBusy(true);
    setError("");
    try {
      if (on) await api.optInToBenchmarks(cohort);
      else await api.optOutOfBenchmarks();
      await refresh();
    } catch (e) {
      setError(e?.message || "Couldn't update your benchmarking preference.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page active">
      <Header />

      {/* Consent + cohort. Deliberately the first thing on the page: the comparison is
          something the user turns on, not something that is on and can be turned off. */}
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <i className="ti ti-users" style={{ fontSize: 22, color: "var(--tv-forest-light)" }} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="page-title" style={{ fontSize: 15, margin: 0 }}>
              Compare me to people like me
            </div>
            <div className="page-subtitle" style={{ margin: "3px 0 0", fontSize: 12.5 }}>
              Turning this on shows aggregate percentile curves next to your figures. It does
              <strong> not</strong> add your data to anyone else's comparison, and nothing here is
              ever sold or shared.
            </div>
          </div>
          {live ? (
            <button
              className={`btn ${model.optedIn ? "btn-secondary" : "btn-primary"}`}
              disabled={busy}
              onClick={() => setOptIn(!model.optedIn)}
            >
              {busy ? "Saving…" : model.optedIn ? "Turn off" : "Turn on"}
            </button>
          ) : (
            <span className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>
              Not connected yet
            </span>
          )}
        </div>

        {error && (
          <div className="page-subtitle" style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--tv-negative)" }}>
            <i className="ti ti-alert-circle" /> {error}
          </div>
        )}

        {live && model.optedIn && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            {[
              ["ageBand", AGE_BANDS, "Age"],
              ["incomeBand", INCOME_BANDS, "Income"],
              ["region", REGIONS, "Region"],
            ].map(([key, options, label]) => (
              <label key={key} style={{ flex: "1 1 160px" }}>
                <div className="page-subtitle" style={{ margin: "0 0 4px", fontSize: 11.5 }}>{label}</div>
                <select
                  className="form-select"
                  value={cohort[key]}
                  disabled={busy}
                  onChange={(e) => {
                    const next = { ...cohort, [key]: e.target.value };
                    setCohort(next);
                    setBusy(true);
                    api.optInToBenchmarks(next)
                      .then(refresh)
                      .catch((err) => setError(err?.message || "Couldn't update your cohort."))
                      .finally(() => setBusy(false));
                  }}
                >
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}

        {model.optedIn && !model.anyComparison && (
          <div className="page-subtitle" style={{ margin: "12px 0 0", fontSize: 12.5 }}>
            <i className="ti ti-database-off" /> No peer dataset is connected yet, so there is
            nothing honest to compare against. We'd rather show you nothing than invent a number.
            {model.minCohortSize ? ` (Cohorts also need at least ${model.minCohortSize} people to stay anonymous.)` : ""}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {model.rows.map((row) => <MetricCard key={row.key} row={row} />)}
      </div>

      <div className="page-subtitle" style={{ fontSize: 12, marginTop: 18 }}>
        Percentiles come from published, aggregate datasets — never from other TerraVest users'
        individual records. Educational information, not financial advice.
      </div>
    </div>
  );
}
