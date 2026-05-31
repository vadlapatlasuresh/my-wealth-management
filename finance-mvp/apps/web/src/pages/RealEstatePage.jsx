import React, { useEffect, useState } from "react";
import { api } from "../api";
import { currency, formatDate } from "../utils/format";
import WireframeLayout from "../components/wireframes/WireframeLayout";

export default function RealEstatePage() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = await api.getRealEstate();
        if (mounted) setItems(res.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => (mounted = false);
  }, []);

  async function loadDetail(id) {
    setDetailLoading(true);
    try {
      const d = await api.getRealEstateDetail(id);
      setSelected(d);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <WireframeLayout title="Real estate" subtitle="Properties, valuations and loan summaries" actions={<button className="btn-primary">Add property</button>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 16 }}>
        <div>
          <div className="card wire-placeholder">
            <div className="card-head">
              <h3>Your properties</h3>
            </div>
            {loading && <p className="muted">Loading properties…</p>}
            {!loading && items.length === 0 && <p className="muted">No properties found.</p>}
            <ul className="simple-list">
              {items.map((it) => (
                <li key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{it.address}</strong>
                    <div className="muted">Units: {it.units} · Purchased {it.purchase_date}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div>{currency(it.current_value)}</div>
                    <div className="muted">Equity {currency((it.current_value || 0) - (it.loan_balance || 0))}</div>
                    <div style={{ marginTop: 8 }}>
                      <button className="btn-secondary btn-sm" onClick={() => loadDetail(it.id)}>View</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside>
          <div className="card wire-placeholder">
            <h3>Property details</h3>
            {detailLoading && <p className="muted">Loading…</p>}
            {!selected && !detailLoading && <p className="muted">Select a property to view details.</p>}
            {selected && (
              <div>
                <h4>{selected.address}</h4>
                <p className="muted">Last valuation: {formatDate(selected.last_valuation)}</p>
                <dl className="review-list">
                  <dt>Purchase price</dt><dd>{currency(selected.purchase_price)}</dd>
                  <dt>Loan balance</dt><dd>{currency(selected.loan_balance)}</dd>
                  <dt>Current value</dt><dd>{currency(selected.current_value)}</dd>
                  <dt>Equity</dt><dd>{currency((selected.current_value || 0) - (selected.loan_balance || 0))}</dd>
                  <dt>Monthly payment</dt><dd>{currency(selected.monthly_payment)}</dd>
                  <dt>Gross rent</dt><dd>{currency(selected.gross_rent || 0)}</dd>
                  <dt>Expenses</dt><dd>{currency(selected.expenses || 0)}</dd>
                  <dt>Cap rate</dt><dd>{(selected.cap_rate || 0) * 100}%</dd>
                </dl>
                <p className="muted">{selected.notes}</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </WireframeLayout>
  );
}
