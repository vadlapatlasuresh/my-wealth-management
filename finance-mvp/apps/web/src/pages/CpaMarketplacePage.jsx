import { useEffect, useState } from "react";
import { api } from "../api";

const specialtiesOf = (c) => {
  const s = c?.specialtyList ?? c?.specialties;
  if (Array.isArray(s)) return s;
  if (typeof s === "string") return s.split(",").map((x) => x.trim()).filter(Boolean);
  return [];
};

function Stars({ value }) {
  const v = Math.round(Number(value || 0));
  return (
    <span style={{ color: "var(--tv-gold)", letterSpacing: 1 }} aria-label={`${value || 0} stars`}>
      {"★★★★★".slice(0, v)}<span style={{ color: "var(--tv-border)" }}>{"★★★★★".slice(v)}</span>
    </span>
  );
}

/** CPA marketplace — find a verified CPA, view their profile + reviews, and connect. */
export default function CpaMarketplacePage() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null); // selected cpa detail { profile, reviews }

  const load = async () => {
    setLoading(true);
    try { setList((await api.getCpas(specialty, q)) || []); }
    catch { setList([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const specialties = [...new Set(list.flatMap(specialtiesOf))].sort();

  return (
    <div id="page-cpa" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Find a CPA</div>
          <div className="page-subtitle">Connect with a verified tax professional</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div className="topbar-search" style={{ flex: 1, minWidth: 220 }}>
          <i className="ti ti-search"></i>
          <input type="text" placeholder="Search by name or specialty…" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        </div>
        <select className="form-select" style={{ maxWidth: 220 }} value={specialty}
          onChange={(e) => { setSpecialty(e.target.value); }}>
          <option value="">All specialties</option>
          {specialties.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={load}>Search</button>
      </div>

      {loading ? (
        <div className="card empty-state" style={{ padding: 40, textAlign: "center" }}>
          <i className="ti ti-loader spin"></i><p>Loading CPAs…</p>
        </div>
      ) : list.length === 0 ? (
        <div className="card empty-state" style={{ padding: 40, textAlign: "center" }}>
          <i className="ti ti-user-search" style={{ fontSize: 32, color: "var(--tv-text-muted)" }}></i>
          <p>No CPAs match your search yet.</p>
        </div>
      ) : (
        <div className="card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {list.map((c) => (
            <div key={c.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div className="user-avatar" style={{ width: 44, height: 44, fontSize: 17, background: "var(--tv-forest)" }}>
                  {(c.name || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="item-name" style={{ fontSize: 15 }}>{c.name}</div>
                  <div className="item-sub">{c.credentials}{c.firm ? ` · ${c.firm}` : ""}</div>
                </div>
                {c.licenseVerified && (
                  <span className="badge badge-forest" title={`License verified (${c.licenseState})`}>
                    <i className="ti ti-rosette-discount-check"></i> Verified
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <Stars value={c.ratingAvg} />
                <span className="item-sub">{c.ratingAvg ? Number(c.ratingAvg).toFixed(1) : "New"} ({c.reviewCount || 0})</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {specialtiesOf(c).slice(0, 3).map((s) => (
                  <span key={s} className="badge" style={{ fontSize: 10.5, background: "var(--tv-sage-pale)", color: "var(--tv-forest)" }}>{s}</span>
                ))}
              </div>
              <div className="item-sub" style={{ fontSize: 12 }}>
                <i className="ti ti-map-pin"></i> {c.location || "—"} · {c.yearsExperience || 0} yrs · {c.feeModel || "Contact for fees"}
              </div>
              <button className="btn btn-secondary btn-sm" style={{ marginTop: "auto" }}
                onClick={async () => setOpen(await api.getCpa(c.id))}>
                View profile
              </button>
            </div>
          ))}
        </div>
      )}

      {open && <CpaModal data={open} onClose={() => setOpen(null)} onChanged={async (id) => setOpen(await api.getCpa(id))} />}
    </div>
  );
}

function CpaModal({ data, onClose, onChanged }) {
  const c = data.profile;
  const reviews = data.reviews || [];
  const [connected, setConnected] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState("");

  const connect = async () => {
    try { await api.connectCpa(c.id); setConnected(true); setMsg("Connected — they'll be in touch. You can now leave a review."); }
    catch { setMsg("Could not connect. Try again."); }
  };
  const submitReview = async () => {
    setMsg("");
    try { await api.reviewCpa(c.id, rating, comment); setComment(""); onChanged(c.id); setMsg("Thanks — your review was posted."); }
    catch (e) { setMsg(e?.message || "You can review a CPA after connecting with them."); }
  };

  const overlay = { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(17,29,23,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
  return (
    <div style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" style={{ width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto", padding: 24 }} role="dialog" aria-modal="true">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <h2 className="page-title" style={{ fontSize: 20, margin: 0 }}>{c.name}</h2>
            <div className="item-sub">{c.credentials}{c.firm ? ` · ${c.firm}` : ""}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>

        {c.licenseVerified && (
          <div className="badge badge-forest" style={{ marginBottom: 10 }}>
            <i className="ti ti-rosette-discount-check"></i> License verified — {c.licenseState} #{c.licenseNumber}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Stars value={c.ratingAvg} />
          <span className="item-sub">{c.ratingAvg ? Number(c.ratingAvg).toFixed(1) : "New"} · {c.reviewCount || 0} reviews</span>
        </div>
        <p className="item-sub" style={{ fontSize: 13 }}>{c.bio}</p>
        <div className="item-sub" style={{ fontSize: 12, margin: "8px 0" }}>
          <i className="ti ti-map-pin"></i> {c.location} · {c.yearsExperience} yrs experience · {c.feeModel}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {specialtiesOf(c).map((s) => <span key={s} className="badge" style={{ background: "var(--tv-sage-pale)", color: "var(--tv-forest)" }}>{s}</span>)}
        </div>

        <button className="btn btn-primary" onClick={connect} disabled={connected} style={{ width: "100%", marginBottom: 8 }}>
          {connected ? "Connected ✓" : "Connect with this CPA"}
        </button>
        {msg && <p className="item-sub" style={{ fontSize: 12, color: "var(--tv-forest)" }}>{msg}</p>}

        {/* Reviews */}
        <div className="card-title" style={{ marginTop: 16 }}>Reviews</div>
        {reviews.length === 0 ? (
          <p className="item-sub" style={{ fontSize: 12.5 }}>No reviews yet.</p>
        ) : reviews.map((r, i) => (
          <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--tv-border-light)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Stars value={r.rating} />
              {r.verified && <span className="badge badge-forest" style={{ fontSize: 9.5 }}><i className="ti ti-check"></i> Verified client</span>}
            </div>
            <div className="item-sub" style={{ fontSize: 12.5 }}>{r.comment}</div>
          </div>
        ))}

        {/* Leave a review (gated on connection by the backend) */}
        <div style={{ marginTop: 14 }}>
          <label className="form-label">Leave a review</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <select className="form-select" style={{ maxWidth: 90 }} value={rating} onChange={(e) => setRating(Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
            </select>
            <input className="form-input" placeholder="Your experience…" value={comment} onChange={(e) => setComment(e.target.value)} />
            <button className="btn btn-secondary btn-sm" onClick={submitReview}>Post</button>
          </div>
          <div className="item-sub" style={{ fontSize: 11 }}>You can review a CPA after you connect with them.</div>
        </div>
      </div>
    </div>
  );
}
