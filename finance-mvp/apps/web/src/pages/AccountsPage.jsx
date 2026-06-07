import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { currency } from '../utils/format';
import PlaidLinkButton from '../components/PlaidLinkButton';
import LastRefreshed from '../components/LastRefreshed';

/* Maps a Plaid account `type` to display metadata. Plaid types are lowercase:
   depository | credit | loan | investment | other. */
const CATEGORY_META = {
  depository: { label: 'Cash & Banking', icon: 'ti ti-building-bank', iconClass: 'icon-forest', liability: false },
  investment: { label: 'Investments', icon: 'ti ti-chart-line', iconClass: 'icon-purple', liability: false },
  credit: { label: 'Credit Cards', icon: 'ti ti-credit-card', iconClass: 'icon-red', liability: true },
  loan: { label: 'Loans', icon: 'ti ti-businessplan', iconClass: 'icon-amber', liability: true },
  other: { label: 'Other Accounts', icon: 'ti ti-wallet', iconClass: 'icon-blue', liability: false },
};

const CATEGORY_ORDER = ['depository', 'investment', 'credit', 'loan', 'other'];

function metaFor(type) {
  return CATEGORY_META[(type || 'other').toLowerCase()] || CATEGORY_META.other;
}

/* A subtype like "credit card" -> "Credit Card" for the per-account badge. */
function titleCase(text) {
  if (!text) return '';
  return text.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function InfoTip({ text }) {
  return (
    <span className="info-tip" tabIndex={0} role="img" aria-label={text} title={text}>
      <i className="ti ti-info-circle"></i>
    </span>
  );
}

export default function AccountsPage({ accounts = [], loadAll }) {
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!loadAll) return;
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  };

  const { groups, totals } = useMemo(() => {
    const grouped = {};
    let assets = 0;
    let cash = 0;
    let investments = 0;
    let debt = 0;

    for (const account of accounts) {
      const key = (account.type || 'other').toLowerCase();
      const bucket = CATEGORY_META[key] ? key : 'other';
      (grouped[bucket] = grouped[bucket] || []).push(account);

      const balance = Number(account.currentBalance) || 0;
      if (metaFor(bucket).liability) {
        debt += balance;
      } else {
        assets += balance;
        if (bucket === 'depository') cash += balance;
        if (bucket === 'investment') investments += balance;
      }
    }

    const orderedGroups = CATEGORY_ORDER
      .filter((key) => grouped[key]?.length)
      .map((key) => {
        const items = grouped[key];
        const subtotal = items.reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);
        return { key, meta: metaFor(key), items, subtotal };
      });

    return {
      groups: orderedGroups,
      totals: { assets, cash, investments, debt, net: assets - debt, count: accounts.length },
    };
  }, [accounts]);

  return (
    <div id="page-accounts" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Accounts</div>
          <div className="page-subtitle">All linked financial accounts in one place</div>
        </div>
        <div className="page-actions" style={{ alignItems: 'center' }}>
          <LastRefreshed />
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Re-sync balances from your institutions"
          >
            <i className={`ti ti-refresh ${refreshing ? 'spin' : ''}`}></i>
            {refreshing ? 'Syncing…' : 'Refresh'}
          </button>
          <PlaidLinkButton onLinkSuccess={loadAll}>
            <i className="ti ti-plus"></i> Link Account
          </PlaidLinkButton>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-scale" style={{ fontSize: '13px', color: 'var(--tv-forest-light)' }}></i> Net Position
            <InfoTip text="Total assets minus total debt across all linked accounts." />
          </div>
          <div className="kpi-value">{currency(totals.net)}</div>
          <div className={`kpi-delta ${totals.net >= 0 ? 'pos' : 'neg'}`}>
            <i className="ti ti-wallet"></i> {totals.count} account{totals.count === 1 ? '' : 's'} linked
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-coins" style={{ fontSize: '13px', color: 'var(--tv-forest-light)' }}></i> Total Assets
            <InfoTip text="Sum of all cash, banking, and investment balances." />
          </div>
          <div className="kpi-value">{currency(totals.assets)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-building-bank" style={{ fontSize: '13px', color: '#1E5FAD' }}></i> Cash
            <InfoTip text="Balances held in checking and savings accounts." />
          </div>
          <div className="kpi-value">{currency(totals.cash)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-chart-line" style={{ fontSize: '13px', color: '#6B46C1' }}></i> Investments
            <InfoTip text="Balances in brokerage and retirement accounts." />
          </div>
          <div className="kpi-value">{currency(totals.investments)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-credit-card" style={{ fontSize: '13px', color: 'var(--tv-negative)' }}></i> Total Debt
            <InfoTip text="Outstanding balances on credit cards and loans." />
          </div>
          <div className="kpi-value">{currency(totals.debt)}</div>
        </div>
      </div>

      {totals.count === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-wallet"></i>
            <p style={{ fontWeight: 600, color: 'var(--tv-text-primary)', marginBottom: 4 }}>
              No accounts linked yet
            </p>
            <p style={{ marginBottom: 18 }}>
              Securely connect your bank, credit cards, and investments with Plaid to see
              everything in one place.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <PlaidLinkButton onLinkSuccess={loadAll}>
                <i className="ti ti-plus"></i> Link your first account
              </PlaidLinkButton>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groups.map((group) => (
            <div className="card" key={group.key}>
              <div className="section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className={`item-icon ${group.meta.iconClass}`}>
                    <i className={group.meta.icon}></i>
                  </div>
                  <div>
                    <div className="section-title" style={{ marginBottom: 0 }}>{group.meta.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--tv-text-muted)' }}>
                      {group.items.length} account{group.items.length === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    className="item-amount"
                    style={{ color: group.meta.liability ? 'var(--tv-negative)' : 'var(--tv-text-primary)' }}
                  >
                    {group.meta.liability ? '−' : ''}{currency(group.subtotal)}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--tv-text-muted)' }}>
                    {group.meta.liability ? 'Owed' : 'Balance'}
                  </div>
                </div>
              </div>

              <div>
                {group.items.map((account) => {
                  const available = account.availableBalance != null ? Number(account.availableBalance) : null;
                  const cur = account.currency || 'USD';
                  return (
                    <div className="list-item account-row" key={account.id}>
                      <div className={`item-icon ${group.meta.iconClass}`}>
                        <i className={group.meta.icon}></i>
                      </div>
                      <div className="item-main">
                        <div className="item-name">{account.name || 'Account'}</div>
                        <div className="item-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {account.officialName && <span>{account.officialName}</span>}
                          {account.subtype && (
                            <span className={`badge ${group.meta.liability ? 'badge-red' : 'badge-forest'}`}>
                              {titleCase(account.subtype)}
                            </span>
                          )}
                          <span className="badge badge-gray">
                            <i className="ti ti-lock" style={{ fontSize: 10 }}></i> Plaid
                          </span>
                        </div>
                      </div>
                      <div className="item-right">
                        <div
                          className="item-amount"
                          style={{ color: group.meta.liability ? 'var(--tv-negative)' : 'var(--tv-text-primary)' }}
                        >
                          {group.meta.liability ? '−' : ''}{currency(account.currentBalance)}
                        </div>
                        <div className="item-meta">
                          {available != null
                            ? `${currency(available)} ${group.meta.liability ? 'available credit' : 'available'}`
                            : cur}
                        </div>
                      </div>
                      <button
                        className="icon-btn account-action"
                        title={`View ${account.name || 'account'} transactions`}
                        onClick={() => navigate('/transactions')}
                      >
                        <i className="ti ti-chevron-right"></i>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--tv-text-muted)', padding: '4px 0 8px' }}>
            <i className="ti ti-shield-check" style={{ color: 'var(--tv-forest-light)' }}></i>{' '}
            Connections are read-only and secured by Plaid. We never store your bank credentials.
          </div>
        </div>
      )}
    </div>
  );
}
