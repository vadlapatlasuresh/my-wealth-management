import { useEffect, useState } from "react";
import { api } from "../api";

/* ---------------------------------------------------------------------------
   Public invoice page (no login).
   A customer opens the link the business owner sent (/invoice/:token) to view
   the invoice and how to pay. Token-scoped, read-only; rendered by App.jsx
   BEFORE the auth gate so the customer never needs a TerraVest account.
--------------------------------------------------------------------------- */

function tokenFromPath() {
  const m = window.location.pathname.match(/\/invoice\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

const money = (n) =>
  n == null ? "—" : Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

const fmtDate = (d) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return String(d); }
};

export default function PublicInvoicePage() {
  const token = tokenFromPath();
  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setError("This invoice link is not valid."); setLoading(false); return; }
    (async () => {
      try { setInv(await api.getPublicInvoice(token)); }
      catch (e) { setError(e?.message || "This invoice link is not valid."); }
      finally { setLoading(false); }
    })();
  }, [token]);

  const wrap = {
    minHeight: "100vh", background: "var(--tv-bg, #f5f6f4)", color: "var(--tv-text, #1a2420)",
    display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 16px",
  };
  const paid = inv && String(inv.status).toUpperCase() === "PAID";

  return (
    <div style={wrap}>
      <div style={{ width: "100%", maxWidth: 560 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <i className="ti ti-leaf" style={{ fontSize: 26, color: "var(--tv-forest, #2d5a3d)" }}></i>
          <strong style={{ fontSize: 20 }}>TerraVest</strong>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--tv-text-muted, #64726b)" }}>Invoice</span>
        </div>

        {loading ? (
          <div className="card" style={{ textAlign: "center", padding: 40 }}>
            <i className="ti ti-loader spin" style={{ fontSize: 24 }}></i>
            <p style={{ color: "var(--tv-text-muted)" }}>Loading invoice…</p>
          </div>
        ) : error ? (
          <div className="card" style={{ padding: 32, textAlign: "center" }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 30, color: "var(--tv-negative, #c0392b)" }}></i>
            <h2 style={{ margin: "10px 0 4px" }}>Invoice unavailable</h2>
            <p style={{ color: "var(--tv-text-muted)", fontSize: 14 }}>{error}</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, color: "var(--tv-text-muted)" }}>From</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{inv.businessName || "—"}</div>
              </div>
              <span className="badge" style={{
                background: paid ? "rgba(45,90,61,.14)" : "var(--tv-gold-pale)",
                color: paid ? "var(--tv-forest)" : "var(--tv-gold, #b8860b)", fontWeight: 600,
              }}>{paid ? "Paid" : "Due"}</span>
            </div>

            {inv.invoiceNumber && (
              <div style={{ fontSize: 13, color: "var(--tv-text-muted)" }}>Invoice #{inv.invoiceNumber}</div>
            )}

            <div style={{ margin: "18px 0", padding: "18px 0", borderTop: "1px solid var(--tv-border, rgba(0,0,0,.1))", borderBottom: "1px solid var(--tv-border, rgba(0,0,0,.1))" }}>
              <div style={{ fontSize: 13, color: "var(--tv-text-muted)" }}>Amount {paid ? "paid" : "due"}</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: "var(--tv-forest)" }}>{money(paid ? (inv.paidAmount ?? inv.amount) : inv.amount)}</div>
              <div style={{ fontSize: 13, color: "var(--tv-text-muted)", marginTop: 4 }}>
                Billed to {inv.customer || "—"}
                {inv.dueDate ? ` · Due ${fmtDate(inv.dueDate)}` : ""}
                {paid && inv.paidAt ? ` · Paid ${fmtDate(inv.paidAt)}` : ""}
              </div>
            </div>

            {inv.notes && <p style={{ fontSize: 14, margin: "0 0 14px" }}>{inv.notes}</p>}

            {!paid && inv.payInstructions && (
              <div className="card" style={{ padding: 14, margin: 0, background: "var(--tv-forest-tint, rgba(45,90,61,.06))" }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}><i className="ti ti-cash"></i> How to pay</div>
                <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{inv.payInstructions}</div>
              </div>
            )}

            {paid ? (
              <p style={{ fontSize: 13, color: "var(--tv-forest)", marginTop: 16 }}>
                <i className="ti ti-circle-check"></i> This invoice has been paid. Thank you!
              </p>
            ) : (
              <p style={{ fontSize: 12, color: "var(--tv-text-muted)", marginTop: 16 }}>
                <i className="ti ti-shield-check"></i> Please follow the payment instructions above. Contact the business directly with any questions.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
