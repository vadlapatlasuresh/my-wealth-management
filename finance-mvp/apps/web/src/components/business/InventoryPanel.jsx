import React, { useEffect, useState } from 'react';
import { api } from '../../api';

const defaultForm = {
  name: '',
  sku: '',
  costPrice: '',
  sellPrice: '',
  reorderPoint: '',
  notes: ''
};

export default function InventoryPanel({ businessId, currency, onError, onFlash }) {
  const [items, setItems] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [canManage, setCanManage] = useState(true);

  const loadItems = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const list = await api.getBusinessInventory(businessId);
      setItems(Array.isArray(list) ? list : []);
      setCanManage(true);
    } catch (err) {
      setCanManage(false);
      onError?.(err?.message || 'Could not load inventory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [businessId]);

  function resetForm() {
    setForm(defaultForm);
    setEditingId(null);
    setShowAdd(false);
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      name: item.name || '',
      sku: item.sku || '',
      costPrice: item.costPrice ?? '',
      sellPrice: item.sellPrice ?? '',
      reorderPoint: item.reorderPoint ?? '',
      notes: item.notes || ''
    });
    setShowAdd(true);
  }

  async function addItem(e) {
    e.preventDefault();
    if (!businessId) return;
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      costPrice: form.costPrice ? Number(form.costPrice) : null,
      sellPrice: form.sellPrice ? Number(form.sellPrice) : null,
      reorderPoint: form.reorderPoint ? Number(form.reorderPoint) : null,
      notes: form.notes.trim() || null,
    };
    if (!payload.name) return;
    try {
      if (editingId) {
        await api.updateBusinessInventoryItem(businessId, editingId, payload);
        onFlash?.(`Inventory item ${payload.name} updated.`);
      } else {
        await api.createBusinessInventoryItem(businessId, payload);
        onFlash?.(`Inventory item ${payload.name} added.`);
      }
      resetForm();
      await loadItems();
    } catch (err) {
      onError?.(err?.message || 'Could not save inventory item.');
    }
  }

  async function deleteItem(item) {
    try {
      await api.deleteBusinessInventoryItem(businessId, item.id);
      await loadItems();
      onFlash?.(`Inventory item ${item.name} removed.`);
    } catch (err) {
      onError?.(err?.message || 'Could not delete inventory item.');
    }
  }

  async function adjustStock(item, delta) {
    try {
      // +stock is a receipt, −stock is a sale — the ledger posts COGS accordingly.
      const kind = delta > 0 ? 'RECEIVE' : 'SELL';
      await api.adjustBusinessInventoryItem(businessId, item.id, { delta, kind });
      await loadItems();
      onFlash?.(`Stock adjusted for ${item.name}.`);
    } catch (err) {
      onError?.(err?.message || 'Could not adjust stock.');
    }
  }

  function isLow(item) {
    return item.reorderPoint != null && (item.onHand ?? 0) <= item.reorderPoint;
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-header">
        <div className="section-title">
          <i className="ti ti-package" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
          Inventory &amp; COGS
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => (showAdd ? resetForm() : setShowAdd(true))} disabled={!businessId || !canManage}>
          <i className={`ti ${showAdd ? 'ti-x' : 'ti-plus'}`}></i>{showAdd ? ' Cancel' : ' New item'}
        </button>
      </div>
      <p className="item-sub" style={{ margin: '-4px 0 12px' }}>Track stock on hand and basic cost/sell values for the next inventory and COGS slice.</p>
      {!canManage && (
        <div className="item-sub" style={{ margin: '-4px 0 12px', color: 'var(--tv-warning)' }}><i className="ti ti-eye-off"></i> You currently have view-only access to this business workspace.</div>
      )}

      {showAdd && businessId && (
        <form onSubmit={addItem} style={{ marginBottom: 14 }}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Item name *</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Office chairs" />
            </div>
            <div className="form-group">
              <label className="form-label">SKU</label>
              <input className="form-input" value={form.sku} onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value }))} placeholder="SKU-001" />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Cost price</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => setForm((p) => ({ ...p, costPrice: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="form-group">
              <label className="form-label">Sell price</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.sellPrice} onChange={(e) => setForm((p) => ({ ...p, sellPrice: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Reorder point</label>
              <input className="form-input" type="number" min="0" step="1" value={form.reorderPoint} onChange={(e) => setForm((p) => ({ ...p, reorderPoint: e.target.value }))} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <input className="form-input" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!form.name.trim()}><i className={`ti ${editingId ? 'ti-device-floppy' : 'ti-plus'}`}></i> {editingId ? 'Save changes' : 'Add item'}</button>
        </form>
      )}

      {loading ? (
        <div className="empty-state"><i className="ti ti-loader-2 spin"></i><p>Loading inventory…</p></div>
      ) : items.length === 0 ? (
        <div className="empty-state"><i className="ti ti-package"></i><p>No inventory items yet. Add one to start the COGS foundation.</p></div>
      ) : (
        <div className="table-scroll">
          <table className="tv-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>SKU</th>
                <th style={{ textAlign: 'right' }}>On hand</th>
                <th style={{ textAlign: 'right' }}>Cost</th>
                <th style={{ textAlign: 'right' }}>Sell</th>
                <th style={{ textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    {item.notes ? <div className="item-sub">{item.notes}</div> : null}
                  </td>
                  <td style={{ color: 'var(--tv-text-muted)' }}>{item.sku || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {item.onHand ?? 0}
                    {isLow(item) ? <span className="badge badge-warning" style={{ marginLeft: 6 }} title={`At or below reorder point (${item.reorderPoint})`}><i className="ti ti-alert-triangle"></i> Low</span> : null}
                  </td>
                  <td style={{ textAlign: 'right' }}>{currency(Number(item.costPrice) || 0)}</td>
                  <td style={{ textAlign: 'right' }}>{currency(Number(item.sellPrice) || 0)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => startEdit(item)}><i className="ti ti-pencil"></i></button>
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => deleteItem(item)}><i className="ti ti-trash"></i></button>
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => adjustStock(item, -1)}><i className="ti ti-minus"></i> -1</button>
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => adjustStock(item, 1)}><i className="ti ti-plus"></i> +1</button>
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
