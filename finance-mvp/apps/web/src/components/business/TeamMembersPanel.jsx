import React, { useEffect, useState } from 'react';
import { api } from '../../api';

const defaultForm = {
  memberUserId: '',
  role: 'VIEWER'
};

export default function TeamMembersPanel({ businessId, onError, onFlash }) {
  const [members, setMembers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [canManage, setCanManage] = useState(true);

  const loadMembers = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const list = await api.getBusinessTeamMembers(businessId);
      setMembers(Array.isArray(list) ? list : []);
      setCanManage(true);
    } catch (err) {
      setCanManage(false);
      onError?.(err?.message || 'Could not load team members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, [businessId]);

  async function addMember(e) {
    e.preventDefault();
    if (!businessId) return;
    const memberUserId = Number(form.memberUserId);
    if (!memberUserId) return;
    try {
      await api.createBusinessTeamMember(businessId, { memberUserId, role: form.role || 'VIEWER' });
      setForm(defaultForm);
      setShowAdd(false);
      await loadMembers();
      onFlash?.('Team member added.');
    } catch (err) {
      onError?.(err?.message || 'Could not add team member.');
    }
  }

  async function deleteMember(member) {
    try {
      await api.deleteBusinessTeamMember(businessId, member.id);
      await loadMembers();
      onFlash?.('Team member removed.');
    } catch (err) {
      onError?.(err?.message || 'Could not remove team member.');
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-header">
        <div className="section-title">
          <i className="ti ti-shield-check" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
          Team access
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd((v) => !v)} disabled={!businessId || !canManage}>
          <i className={`ti ${showAdd ? 'ti-x' : 'ti-plus'}`}></i>{showAdd ? ' Cancel' : ' Add member'}
        </button>
      </div>
      <p className="item-sub" style={{ margin: '-4px 0 12px' }}>Grant collaborators access to the business workspace with simple role-based permissions.</p>
      {!canManage && (
        <div className="item-sub" style={{ margin: '-4px 0 12px', color: 'var(--tv-warning)' }}><i className="ti ti-eye-off"></i> You currently have view-only access to this business workspace.</div>
      )}

      {showAdd && businessId && (
        <form onSubmit={addMember} style={{ marginBottom: 14 }}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Member user ID *</label>
              <input className="form-input" type="number" min="1" value={form.memberUserId} onChange={(e) => setForm((p) => ({ ...p, memberUserId: e.target.value }))} placeholder="e.g. 42" />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select className="form-select" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
                <option value="VIEWER">Viewer</option>
                <option value="EDITOR">Editor</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!form.memberUserId}><i className="ti ti-plus"></i> Add member</button>
        </form>
      )}

      {loading ? (
        <div className="empty-state"><i className="ti ti-loader-2 spin"></i><p>Loading team access…</p></div>
      ) : members.length === 0 ? (
        <div className="empty-state"><i className="ti ti-shield-check"></i><p>No team members yet. Add collaborators to start the RBAC foundation.</p></div>
      ) : (
        <div className="table-scroll">
          <table className="tv-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td style={{ fontWeight: 600 }}>{member.memberUserId}</td>
                  <td>{member.role || 'VIEWER'}</td>
                  <td><span className="badge badge-forest">{member.status || 'ACTIVE'}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => deleteMember(member)}><i className="ti ti-trash"></i></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
