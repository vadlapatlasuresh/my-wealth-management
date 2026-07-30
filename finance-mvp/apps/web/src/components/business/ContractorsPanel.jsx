import React, { useEffect, useState } from 'react';
import { api } from '../../api';

const defaultForm = {
  name: '',
  email: '',
  phone: '',
  taxForm: '1099',
  amount: '',
  paymentTerms: '',
  notes: ''
};

export default function ContractorsPanel({ businessId, currency, onError, onFlash }) {
  const [contractors, setContractors] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [canManage, setCanManage] = useState(true);
  const [payingId, setPayingId] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', paidAt: '', method: 'ACH', reference: '' });
  const [report, setReport] = useState(null);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());

  const loadContractors = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const list = await api.getBusinessContractors(businessId);
      setContractors(Array.isArray(list) ? list : []);
      setCanManage(true);
    } catch (err) {
      setCanManage(false);
      onError?.(err?.message || 'Could not load contractors.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContractors();
  }, [businessId]);

  function resetForm() {
    setForm(defaultForm);
    setEditingId(null);
    setShowAdd(false);
  }

  function startEdit(contractor) {
    setEditingId(contractor.id);
    setForm({
      name: contractor.name || '',
      email: contractor.email || '',
      phone: contractor.phone || '',
      taxForm: contractor.taxForm || '1099',
      amount: contractor.amount ?? '',
      paymentTerms: contractor.paymentTerms || '',
    });
    setShowAdd(true);
  }

  async function addContractor(e) {
    e.preventDefault();
    if (!businessId) return;
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      taxForm: form.taxForm || '1099',
      amount: form.amount ? Number(form.amount) : null,
      paymentTerms: form.paymentTerms.trim() || null,
      status: 'ACTIVE',
    };
    if (!payload.name) return;
    try {
      if (editingId) {
        await api.updateBusinessContractor(businessId, editingId, payload);
        onFlash?.(`Contractor ${payload.name} updated.`);
      } else {
        await api.createBusinessContractor(businessId, payload);
        onFlash?.(`Contractor ${payload.name} added.`);
      }
      resetForm();
      await loadContractors();
    } catch (err) {
      onError?.(err?.message || 'Could not save contractor.');
    }
  }

  async function deleteContractor(contractor) {
    try {
      await api.deleteBusinessContractor(businessId, contractor.id);
      await loadContractors();
      onFlash?.(`Contractor ${contractor.name} removed.`);
    } catch (err) {
      onError?.(err?.message || 'Could not delete contractor.');
    }
  }

  function startPay(contractor) {
    setPayingId(contractor.id);
    setPayForm({ amount: contractor.amount ?? '', paidAt: '', method: 'ACH', reference: '' });
  }

  async function submitPay(e, contractor) {
    e.preventDefault();
    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) return;
    try {
      await api.payBusinessContractor(businessId, {
        contractorId: contractor.id,
        amount,
        paidAt: payForm.paidAt || null,
        method: payForm.method || null,
        reference: payForm.reference.trim() || null,
      });
      setPayingId(null);
      onFlash?.(`Paid ${contractor.name} — recorded to the ledger.`);
      if (report) await load1099(reportYear);
    } catch (err) {
      onError?.(err?.message || 'Could not record payment.');
    }
  }

  async function load1099(year) {
    try {
      const r = await api.getBusiness1099Report(businessId, year);
      setReport(r);
      setReportYear(year);
    } catch (err) {
      onError?.(err?.message || 'Could not load the 1099 report.');
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-header">
        <div className="section-title">
          <i className="ti ti-users" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
          Contractors &amp; 1099s
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => (report ? setReport(null) : load1099(reportYear))} disabled={!businessId}>
            <i className="ti ti-file-dollar"></i>{report ? ' Hide 1099s' : ' 1099 report'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => (showAdd ? resetForm() : setShowAdd(true))} disabled={!businessId || !canManage}>
            <i className={`ti ${showAdd ? 'ti-x' : 'ti-plus'}`}></i>{showAdd ? ' Cancel' : ' New contractor'}
          </button>
        </div>
      </div>
      <p className="item-sub" style={{ margin: '-4px 0 12px' }}>Track contractors, record payments (posted to the ledger), and see year-end 1099 totals.</p>

      {report && (
        <div className="card" style={{ background: 'var(--tv-surface-2, rgba(0,0,0,0.03))', marginBottom: 14, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}><i className="ti ti-file-dollar"></i> 1099-NEC totals</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => load1099(reportYear - 1)}><i className="ti ti-chevron-left"></i></button>
              <span style={{ fontWeight: 600 }}>{report.year}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => load1099(reportYear + 1)} disabled={reportYear >= new Date().getFullYear()}><i className="ti ti-chevron-right"></i></button>
            </div>
          </div>
          <p className="item-sub" style={{ margin: '0 0 8px' }}>{report.reportableCount || 0} contractor(s) at or above the {currency(Number(report.threshold) || 600)} IRS reporting threshold · {currency(Number(report.grandTotal) || 0)} paid in {report.year}.</p>
          {(report.rows || []).length === 0 ? (
            <div className="item-sub">No contractor payments recorded for {report.year}.</div>
          ) : (
            <div className="table-scroll">
              <table className="tv-table">
                <thead><tr><th>Contractor</th><th>Tax form</th><th style={{ textAlign: 'right' }}>Paid {report.year}</th><th>1099?</th></tr></thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.contractorId}>
                      <td><div style={{ fontWeight: 600 }}>{r.name}</div>{r.email ? <div className="item-sub">{r.email}</div> : null}</td>
                      <td style={{ color: 'var(--tv-text-muted)' }}>{r.taxForm || '1099'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{currency(Number(r.total) || 0)}</td>
                      <td>{r.reportable ? <span className="badge badge-forest">Required</span> : <span className="badge">Under</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {!canManage && (
        <div className="item-sub" style={{ margin: '-4px 0 12px', color: 'var(--tv-warning)' }}><i className="ti ti-eye-off"></i> You currently have view-only access to this business workspace.</div>
      )}

      {showAdd && businessId && (
        <form onSubmit={addContractor} style={{ marginBottom: 14 }}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Jane Doe" />
            </div>
            <div className="form-group">
              <label className="form-label">Tax form</label>
              <select className="form-select" value={form.taxForm} onChange={(e) => setForm((p) => ({ ...p, taxForm: e.target.value }))}>
                <option value="1099">1099</option>
                <option value="W-9">W-9</option>
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="name@example.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="(555) 000-0000" />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Amount</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="form-group">
              <label className="form-label">Payment terms</label>
              <input className="form-input" value={form.paymentTerms} onChange={(e) => setForm((p) => ({ ...p, paymentTerms: e.target.value }))} placeholder="Net 15" />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!form.name.trim()}><i className={`ti ${editingId ? 'ti-device-floppy' : 'ti-plus'}`}></i> {editingId ? 'Save changes' : 'Add contractor'}</button>
        </form>
      )}

      {loading ? (
        <div className="empty-state"><i className="ti ti-loader-2 spin"></i><p>Loading contractors…</p></div>
      ) : contractors.length === 0 ? (
        <div className="empty-state"><i className="ti ti-users"></i><p>No contractors yet. Add a contractor to start the payroll/1099 foundation.</p></div>
      ) : (
        <div className="table-scroll">
          <table className="tv-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Tax form</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {contractors.map((contractor) => (
                <React.Fragment key={contractor.id}>
                <tr>
                  <td>
                    <div style={{ fontWeight: 600 }}>{contractor.name}</div>
                    {contractor.email ? <div className="item-sub">{contractor.email}</div> : null}
                  </td>
                  <td style={{ color: 'var(--tv-text-muted)' }}>{contractor.taxForm || '1099'}</td>
                  <td style={{ textAlign: 'right' }}>{currency(Number(contractor.amount) || 0)}</td>
                  <td><span className="badge badge-forest">{contractor.status || 'ACTIVE'}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => startPay(contractor)} disabled={!canManage} title="Record a payment"><i className="ti ti-cash"></i> Pay</button>
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => startEdit(contractor)}><i className="ti ti-pencil"></i></button>
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => deleteContractor(contractor)}><i className="ti ti-trash"></i></button>
                  </td>
                </tr>
                {payingId === contractor.id && (
                  <tr>
                    <td colSpan={5}>
                      <form onSubmit={(e) => submitPay(e, contractor)} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', padding: '6px 0' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label">Amount *</label>
                          <input className="form-input" type="number" min="0" step="0.01" value={payForm.amount} onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0.00" style={{ width: 120 }} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label">Date</label>
                          <input className="form-input" type="date" value={payForm.paidAt} onChange={(e) => setPayForm((p) => ({ ...p, paidAt: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label">Method</label>
                          <select className="form-select" value={payForm.method} onChange={(e) => setPayForm((p) => ({ ...p, method: e.target.value }))}>
                            <option>ACH</option><option>Check</option><option>Card</option><option>Cash</option><option>Wire</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 140 }}>
                          <label className="form-label">Reference</label>
                          <input className="form-input" value={payForm.reference} onChange={(e) => setPayForm((p) => ({ ...p, reference: e.target.value }))} placeholder="Invoice / memo" />
                        </div>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={!(Number(payForm.amount) > 0)}><i className="ti ti-check"></i> Record payment</button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPayingId(null)}><i className="ti ti-x"></i></button>
                      </form>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
