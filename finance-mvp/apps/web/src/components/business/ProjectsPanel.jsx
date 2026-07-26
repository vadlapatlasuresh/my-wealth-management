import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../api';

/**
 * Progress / milestone invoicing (order-to-cash Phase 1.4b). A project has a fixed contract
 * total; milestones bill as invoices that draw down against it. Self-contained: fetches its
 * own projects for the selected business and reports generated invoices up so they appear in
 * the invoices list.
 */
export default function ProjectsPanel({ businessId, customers = [], currency, formatDate, onInvoiceCreated, onError, onFlash }) {
  const [projects, setProjects] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const emptyForm = { customerId: '', customer: '', customerEmail: '', customerPhone: '', name: '', contractTotal: '' };
  const [form, setForm] = useState(emptyForm);
  const [msForm, setMsForm] = useState({ name: '', mode: 'PERCENT', value: '', dueDate: '' });

  const reload = useCallback(async () => {
    if (!businessId) { setProjects([]); return; }
    try {
      const list = await api.getBusinessProjects(businessId);
      setProjects(Array.isArray(list) ? list : []);
    } catch (err) { onError?.(err?.message || 'Could not load projects.'); }
  }, [businessId, onError]);

  useEffect(() => { reload(); }, [reload]);

  async function addProject(e) {
    e.preventDefault();
    const name = form.name.trim();
    const customer = form.customer.trim();
    if (!name || !customer) return;
    try {
      await api.createBusinessProject(businessId, {
        customerId: form.customerId || null,
        customer,
        customerEmail: form.customerEmail || null,
        customerPhone: form.customerPhone || null,
        name,
        contractTotal: form.contractTotal || 0,
      });
      setForm(emptyForm);
      setShowAdd(false);
      await reload();
      onFlash?.(`Project "${name}" created.`);
    } catch (err) { onError?.(err?.message || 'Could not create the project.'); }
  }

  async function addMilestone(projectId) {
    const name = msForm.name.trim();
    const value = Number(msForm.value) || 0;
    if (!name || !(value > 0)) return;
    try {
      const payload = { name, dueDate: msForm.dueDate || null };
      if (msForm.mode === 'PERCENT') payload.percent = value; else payload.amount = value;
      await api.addProjectMilestone(projectId, payload);
      setMsForm({ name: '', mode: 'PERCENT', value: '', dueDate: '' });
      await reload();
    } catch (err) { onError?.(err?.message || 'Could not add the milestone.'); }
  }

  async function billMilestone(m, projectName) {
    if (!window.confirm(`Bill "${m.name}" on ${projectName} for ${currency(Number(m.amount) || 0)}? This creates an invoice.`)) return;
    try {
      const inv = await api.billProjectMilestone(m.id);
      onInvoiceCreated?.(inv);
      await reload();
      onFlash?.('Milestone billed — a new invoice is ready to send.');
    } catch (err) { onError?.(err?.message || 'Could not bill the milestone.'); }
  }

  async function deleteMilestone(id) {
    if (!window.confirm('Delete this milestone?')) return;
    try { await api.deleteProjectMilestone(id); await reload(); }
    catch (err) { onError?.(err?.message || 'Could not delete the milestone.'); }
  }

  async function deleteProject(p) {
    if (!window.confirm(`Delete project "${p.name}"? Invoices already generated are kept.`)) return;
    try { await api.deleteBusinessProject(p.id); await reload(); onFlash?.('Project deleted.'); }
    catch (err) { onError?.(err?.message || 'Could not delete the project.'); }
  }

  const activeCustomers = customers.filter((c) => (c.status || 'ACTIVE') !== 'ARCHIVED');

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-header">
        <div className="section-title"><i className="ti ti-progress" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>Projects &amp; milestone billing</div>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd((v) => !v)} disabled={!businessId}>
          <i className={`ti ${showAdd ? 'ti-x' : 'ti-plus'}`}></i>{showAdd ? ' Cancel' : ' New project'}
        </button>
      </div>

      {showAdd && businessId && (
        <form onSubmit={addProject} style={{ marginBottom: 14 }}>
          {activeCustomers.length > 0 && (
            <div className="form-group">
              <label className="form-label">Saved customer</label>
              <select className="form-select" value={form.customerId}
                onChange={(e) => {
                  const c = customers.find((x) => String(x.id) === e.target.value);
                  setForm((p) => c
                    ? { ...p, customerId: String(c.id), customer: c.displayName, customerEmail: c.email || '', customerPhone: c.mobile || c.phone || '' }
                    : { ...p, customerId: '' });
                }}>
                <option value="">New / one-off customer…</option>
                {activeCustomers.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
              </select>
            </div>
          )}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Customer *</label>
              <input className="form-input" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value, customerId: '' })} placeholder="e.g. Acme Corp" />
            </div>
            <div className="form-group">
              <label className="form-label">Project name *</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Website build" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Contract total</label>
            <input className="form-input" type="number" min="0" step="0.01" value={form.contractTotal} onChange={(e) => setForm({ ...form, contractTotal: e.target.value })} placeholder="0.00" />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!form.name.trim() || !form.customer.trim()}>
            <i className="ti ti-plus"></i> Create project
          </button>
        </form>
      )}

      {projects.length === 0 ? (
        <div className="empty-state"><i className="ti ti-progress"></i><p>No projects yet. Track a fixed-price job and bill it in milestones (deposit, midpoint, completion).</p></div>
      ) : (
        projects.map((p) => {
          const contract = Number(p.contractTotal) || 0;
          const billed = Number(p.billedToDate) || 0;
          const pct = contract > 0 ? Math.min(100, (billed / contract) * 100) : 0;
          const open = expanded === p.id;
          return (
            <div key={p.id} style={{ borderTop: '1px solid var(--tv-border)', padding: '12px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => setExpanded(open ? null : p.id)}>
                <div>
                  <div style={{ fontWeight: 600 }}><i className={`ti ${open ? 'ti-chevron-down' : 'ti-chevron-right'}`} style={{ marginRight: 4 }}></i>{p.name}</div>
                  <div className="item-sub">{p.customer} · {currency(billed)} of {currency(contract)} billed</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`badge ${p.status === 'COMPLETED' ? 'badge-green' : 'badge-gray'}`}>{p.status}</span>
                  <button className="icon-btn" title="Delete project" onClick={(e) => { e.stopPropagation(); deleteProject(p); }}><i className="ti ti-trash"></i></button>
                </div>
              </div>
              <div className="progress-bar" style={{ marginTop: 8 }}><div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--tv-forest-light)' }}></div></div>
              <div className="item-sub" style={{ marginTop: 2 }}>{currency(Number(p.remaining) || (contract - billed))} remaining</div>

              {open && (
                <div style={{ marginTop: 10 }}>
                  {(p.milestones || []).length > 0 && (
                    <div className="table-scroll">
                      <table className="tv-table">
                        <thead><tr><th>Milestone</th><th style={{ textAlign: 'right' }}>Amount</th><th>Due</th><th>Status</th><th style={{ textAlign: 'right' }}></th></tr></thead>
                        <tbody>
                          {(p.milestones || []).map((m) => {
                            const invoiced = String(m.status).toUpperCase() === 'INVOICED';
                            return (
                              <tr key={m.id}>
                                <td>{m.name}{m.percent ? <span className="item-sub"> · {Number(m.percent)}%</span> : null}</td>
                                <td style={{ textAlign: 'right' }}><span className="item-amount">{currency(Number(m.amount) || 0)}</span></td>
                                <td style={{ color: 'var(--tv-text-muted)' }}>{m.dueDate ? formatDate(m.dueDate) : '—'}</td>
                                <td><span className={`badge ${invoiced ? 'badge-green' : 'badge-amber'}`}>{m.status}</span></td>
                                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                  {!invoiced ? (
                                    <button className="btn btn-primary btn-sm" title="Bill this milestone" onClick={() => billMilestone(m, p.name)}><i className="ti ti-file-invoice"></i> Bill</button>
                                  ) : <span className="item-sub" style={{ marginRight: 6 }}>Invoiced</span>}
                                  {!invoiced && <button className="icon-btn" style={{ marginLeft: 4 }} title="Delete milestone" onClick={() => deleteMilestone(m.id)}><i className="ti ti-trash"></i></button>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Add milestone (only meaningful before the project is fully billed) */}
                  <div className="grid-2" style={{ alignItems: 'end', marginTop: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Milestone</label>
                      <input className="form-input" value={msForm.name} onChange={(e) => setMsForm({ ...msForm, name: e.target.value })} placeholder="e.g. Deposit" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{msForm.mode === 'PERCENT' ? 'Percent of contract' : 'Amount'}</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <select className="form-select" style={{ maxWidth: 120 }} value={msForm.mode} onChange={(e) => setMsForm({ ...msForm, mode: e.target.value })}>
                          <option value="PERCENT">Percent %</option>
                          <option value="AMOUNT">Amount $</option>
                        </select>
                        <input className="form-input" type="number" min="0" step="0.01" value={msForm.value} onChange={(e) => setMsForm({ ...msForm, value: e.target.value })} placeholder={msForm.mode === 'PERCENT' ? '30' : '0.00'} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginTop: 8 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Due date</label>
                      <input className="form-input" type="date" value={msForm.dueDate} onChange={(e) => setMsForm({ ...msForm, dueDate: e.target.value })} />
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => addMilestone(p.id)} disabled={!msForm.name.trim() || !(Number(msForm.value) > 0)}>
                      <i className="ti ti-plus"></i> Add milestone
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
