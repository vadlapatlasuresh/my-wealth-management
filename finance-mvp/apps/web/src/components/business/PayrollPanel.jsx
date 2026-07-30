import React, { useEffect, useState } from 'react';
import { api } from '../../api';

const defaultEmployee = {
  name: '',
  email: '',
  payType: 'SALARY',
  payRate: '',
  fedWhPct: '12',
  stateWhPct: '4',
  ficaPct: '7.65',
};

/**
 * Employees + payroll runs (Phase 5). Runs compute gross → estimated withholdings → net and
 * post to the GL (DR Payroll Expense / CR Payroll Liabilities + Cash). Withholding percentages
 * are owner-set estimates, NOT IRS tax tables — labelled as such in the UI.
 */
export default function PayrollPanel({ businessId, currency, onError, onFlash }) {
  const [employees, setEmployees] = useState([]);
  const [runs, setRuns] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultEmployee);
  const [runningId, setRunningId] = useState(null);
  const [runForm, setRunForm] = useState({ gross: '', hours: '', periodsPerYear: '26', periodStart: '', periodEnd: '', paidAt: '' });
  const [loading, setLoading] = useState(false);
  const [canManage, setCanManage] = useState(true);

  const load = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [emps, payrollRuns] = await Promise.all([
        api.getBusinessEmployees(businessId),
        api.getBusinessPayrollRuns(businessId),
      ]);
      setEmployees(Array.isArray(emps) ? emps : []);
      setRuns(Array.isArray(payrollRuns) ? payrollRuns : []);
      setCanManage(true);
    } catch (err) {
      setCanManage(false);
      onError?.(err?.message || 'Could not load payroll.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [businessId]);

  function resetForm() {
    setForm(defaultEmployee);
    setEditingId(null);
    setShowAdd(false);
  }

  function startEdit(emp) {
    setEditingId(emp.id);
    setForm({
      name: emp.name || '',
      email: emp.email || '',
      payType: emp.payType || 'SALARY',
      payRate: emp.payRate ?? '',
      fedWhPct: emp.fedWhPct ?? '12',
      stateWhPct: emp.stateWhPct ?? '4',
      ficaPct: emp.ficaPct ?? '7.65',
    });
    setShowAdd(true);
  }

  async function saveEmployee(e) {
    e.preventDefault();
    if (!businessId) return;
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      payType: form.payType,
      payRate: form.payRate ? Number(form.payRate) : 0,
      fedWhPct: form.fedWhPct ? Number(form.fedWhPct) : 0,
      stateWhPct: form.stateWhPct ? Number(form.stateWhPct) : 0,
      ficaPct: form.ficaPct ? Number(form.ficaPct) : 0,
    };
    if (!payload.name) return;
    try {
      if (editingId) {
        await api.updateBusinessEmployee(businessId, editingId, payload);
        onFlash?.(`Employee ${payload.name} updated.`);
      } else {
        await api.createBusinessEmployee(businessId, payload);
        onFlash?.(`Employee ${payload.name} added.`);
      }
      resetForm();
      await load();
    } catch (err) {
      onError?.(err?.message || 'Could not save employee.');
    }
  }

  async function deleteEmployee(emp) {
    try {
      await api.deleteBusinessEmployee(businessId, emp.id);
      await load();
      onFlash?.(`Employee ${emp.name} removed.`);
    } catch (err) {
      onError?.(err?.message || 'Could not delete employee.');
    }
  }

  function startRun(emp) {
    setRunningId(emp.id);
    setRunForm({ gross: '', hours: '', periodsPerYear: '26', periodStart: '', periodEnd: '', paidAt: '' });
  }

  async function submitRun(e, emp) {
    e.preventDefault();
    const hourly = emp.payType === 'HOURLY';
    const payload = {
      employeeId: emp.id,
      gross: runForm.gross ? Number(runForm.gross) : null,
      hours: hourly && runForm.hours ? Number(runForm.hours) : null,
      periodsPerYear: runForm.periodsPerYear ? Number(runForm.periodsPerYear) : null,
      periodStart: runForm.periodStart || null,
      periodEnd: runForm.periodEnd || null,
      paidAt: runForm.paidAt || null,
    };
    try {
      const run = await api.runBusinessPayroll(businessId, payload);
      setRunningId(null);
      onFlash?.(`Payroll run for ${emp.name}: net ${currency(Number(run.net) || 0)} — posted to the ledger.`);
      await load();
    } catch (err) {
      onError?.(err?.message || 'Could not run payroll.');
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-header">
        <div className="section-title">
          <i className="ti ti-user-dollar" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
          Employees &amp; Payroll
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => (showAdd ? resetForm() : setShowAdd(true))} disabled={!businessId || !canManage}>
          <i className={`ti ${showAdd ? 'ti-x' : 'ti-plus'}`}></i>{showAdd ? ' Cancel' : ' New employee'}
        </button>
      </div>
      <p className="item-sub" style={{ margin: '-4px 0 12px' }}>Run payroll for W-2 employees — gross, estimated withholdings and net, posted to the ledger. Withholding rates are estimates, not IRS tax tables.</p>
      {!canManage && (
        <div className="item-sub" style={{ margin: '-4px 0 12px', color: 'var(--tv-warning)' }}><i className="ti ti-eye-off"></i> You currently have view-only access to this business workspace.</div>
      )}

      {showAdd && businessId && (
        <form onSubmit={saveEmployee} style={{ marginBottom: 14 }}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Sam Rivera" />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="name@example.com" />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Pay type</label>
              <select className="form-select" value={form.payType} onChange={(e) => setForm((p) => ({ ...p, payType: e.target.value }))}>
                <option value="SALARY">Salary (annual)</option>
                <option value="HOURLY">Hourly</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{form.payType === 'HOURLY' ? 'Hourly rate' : 'Annual salary'}</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.payRate} onChange={(e) => setForm((p) => ({ ...p, payRate: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Fed withholding %</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.fedWhPct} onChange={(e) => setForm((p) => ({ ...p, fedWhPct: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">State withholding %</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.stateWhPct} onChange={(e) => setForm((p) => ({ ...p, stateWhPct: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">FICA %</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.ficaPct} onChange={(e) => setForm((p) => ({ ...p, ficaPct: e.target.value }))} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!form.name.trim()}><i className={`ti ${editingId ? 'ti-device-floppy' : 'ti-plus'}`}></i> {editingId ? 'Save changes' : 'Add employee'}</button>
        </form>
      )}

      {loading ? (
        <div className="empty-state"><i className="ti ti-loader-2 spin"></i><p>Loading payroll…</p></div>
      ) : employees.length === 0 ? (
        <div className="empty-state"><i className="ti ti-user-dollar"></i><p>No employees yet. Add one to run payroll.</p></div>
      ) : (
        <div className="table-scroll">
          <table className="tv-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Pay</th>
                <th style={{ textAlign: 'right' }}>Est. withholding</th>
                <th style={{ textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <React.Fragment key={emp.id}>
                <tr>
                  <td>
                    <div style={{ fontWeight: 600 }}>{emp.name}</div>
                    {emp.email ? <div className="item-sub">{emp.email}</div> : null}
                  </td>
                  <td style={{ color: 'var(--tv-text-muted)' }}>
                    {emp.payType === 'HOURLY' ? `${currency(Number(emp.payRate) || 0)}/hr` : `${currency(Number(emp.payRate) || 0)}/yr`}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--tv-text-muted)' }}>
                    {Number(emp.fedWhPct || 0) + Number(emp.stateWhPct || 0) + Number(emp.ficaPct || 0)}%
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => startRun(emp)} disabled={!canManage}><i className="ti ti-player-play"></i> Run payroll</button>
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => startEdit(emp)}><i className="ti ti-pencil"></i></button>
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => deleteEmployee(emp)}><i className="ti ti-trash"></i></button>
                  </td>
                </tr>
                {runningId === emp.id && (
                  <tr>
                    <td colSpan={4}>
                      <form onSubmit={(e) => submitRun(e, emp)} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', padding: '6px 0' }}>
                        {emp.payType === 'HOURLY' ? (
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Hours *</label>
                            <input className="form-input" type="number" min="0" step="0.25" value={runForm.hours} onChange={(e) => setRunForm((p) => ({ ...p, hours: e.target.value }))} style={{ width: 100 }} />
                          </div>
                        ) : (
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Periods / yr</label>
                            <input className="form-input" type="number" min="1" step="1" value={runForm.periodsPerYear} onChange={(e) => setRunForm((p) => ({ ...p, periodsPerYear: e.target.value }))} style={{ width: 100 }} />
                          </div>
                        )}
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label">Gross override</label>
                          <input className="form-input" type="number" min="0" step="0.01" value={runForm.gross} onChange={(e) => setRunForm((p) => ({ ...p, gross: e.target.value }))} placeholder="auto" style={{ width: 110 }} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label">Paid date</label>
                          <input className="form-input" type="date" value={runForm.paidAt} onChange={(e) => setRunForm((p) => ({ ...p, paidAt: e.target.value }))} />
                        </div>
                        <button type="submit" className="btn btn-primary btn-sm"><i className="ti ti-check"></i> Process</button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRunningId(null)}><i className="ti ti-x"></i></button>
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

      {runs.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}><i className="ti ti-receipt"></i> Recent payroll runs</div>
          <div className="table-scroll">
            <table className="tv-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Paid</th>
                  <th style={{ textAlign: 'right' }}>Gross</th>
                  <th style={{ textAlign: 'right' }}>Withheld</th>
                  <th style={{ textAlign: 'right' }}>Net</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 12).map((r) => (
                  <tr key={r.id}>
                    <td>{r.employeeName || `#${r.employeeId}`}</td>
                    <td style={{ color: 'var(--tv-text-muted)' }}>{r.paidAt || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{currency(Number(r.gross) || 0)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--tv-text-muted)' }}>{currency((Number(r.fedWh) || 0) + (Number(r.stateWh) || 0) + (Number(r.fica) || 0))}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{currency(Number(r.net) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
