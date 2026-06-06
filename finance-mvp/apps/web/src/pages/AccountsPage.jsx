import React from 'react';
import { currency } from '../utils/format';
import PlaidLinkButton from '../components/PlaidLinkButton'; // Import the new button

export default function AccountsPage({ accounts = [], loadAll }) {
  return (
    <div id="page-accounts" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Accounts</div>
          <div className="page-subtitle">All linked financial accounts</div>
        </div>
        {/* Integrate PlaidLinkButton */}
        <PlaidLinkButton onLinkSuccess={loadAll}>
          <i className="ti ti-plus"></i> Link Account
        </PlaidLinkButton>
      </div>
      <div className="card">
        {accounts.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-wallet"></i>
            <p>No accounts linked yet. Click "Link Account" to get started!</p>
          </div>
        ) : (
          <>
            <h3>Your Linked Accounts</h3>
            <ul className="simple-list">
              {accounts.map(account => (
                <li key={account.id}>
                  <div>
                    <strong>{account.name}</strong>
                    <p>{account.officialName || account.subtype} ({account.type})</p>
                  </div>
                  <span>{currency(account.currentBalance)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
