import React from 'react';
import { currency, formatDate } from '../utils/format';

export default function TransactionsPage({ transactions = [] }) {
  return (
    <div id="page-transactions" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Transactions</div>
          <div className="page-subtitle">All activity across accounts</div>
        </div>
      </div>
      <div className="card">
        {transactions.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-arrows-exchange-2"></i>
            <p>No transactions found. Link an account to see your activity!</p>
          </div>
        ) : (
          <>
            <h3>Recent Transactions</h3>
            <ul className="tx-list">
              {transactions.map(tx => (
                <li key={tx.id}>
                  <div>
                    <strong>{tx.name}</strong>
                    <p>{formatDate(tx.date)} · {tx.category}</p>
                  </div>
                  <span className={tx.amount >= 0 ? "positive" : "negative"}>
                    {currency(tx.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
