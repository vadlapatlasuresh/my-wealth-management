import React from "react";
import { currency } from "../utils/format";
import { daysUntil } from "../utils/payees";

/**
 * The sectioned "Who are you paying?" list: one sticky-headed section per payment
 * category (Credit Cards, Mortgage, Student Loans, Auto / Car Loans, Other).
 *
 * Callers pass categories already filtered by `buildPayeeCategories`, which drops
 * empty ones — this component never renders an empty section.
 */

const mask4 = (p) => String(p?.mask || p?.id || "").slice(-4);

/** "Due in 4 days" / "2 days overdue" / "Due today", with the right emphasis colour. */
function dueMeta(iso, formatDate) {
  const days = daysUntil(iso);
  if (days == null) return { text: "", tone: "var(--tv-text-muted)", urgent: false };

  const overdue = days < 0;
  const soon = days >= 0 && days <= 7;
  const text =
    overdue
      ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
      : days === 0
        ? "Due today"
        : `Due in ${days} day${days === 1 ? "" : "s"}`;

  return {
    text: `${text} · ${formatDate(new Date(`${iso}T00:00:00`))}`,
    tone: overdue ? "var(--tv-negative)" : soon ? "#B7791F" : "var(--tv-text-muted)",
    urgent: overdue || soon,
  };
}

function PayeeRow({ payee, selected, onSelect, formatDate }) {
  const due = dueMeta(payee.nextPaymentDueDate, formatDate);
  const isCard = payee.categoryId === "credit_card";

  // Credit cards read as a balance owed; loans read as their next scheduled payment.
  const amountLabel = isCard ? "Balance due" : "Next payment";
  const amountValue = isCard
    ? payee.lastStatementBalance ?? payee.balance
    : payee.suggestedAmount ?? payee.balance;

  // Institution is the lender / servicer name; fall back to the subtype so the
  // secondary line is never blank.
  const secondary = [payee.institution || payee.subtype, due.text]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      className={`payee-row ${selected ? "selected" : ""}`}
      onClick={() => onSelect(payee)}
    >
      <div className={`item-icon ${payee.iconClass}`} style={{ width: 42, height: 42, fontSize: 20 }}>
        <i className={payee.icon}></i>
      </div>
      <div className="payee-row-main">
        <div className="payee-row-name">
          {payee.name}
          {mask4(payee) ? <span className="payee-row-mask"> ····{mask4(payee)}</span> : null}
        </div>
        <div
          className="payee-row-sub"
          style={{ color: due.tone, fontWeight: due.urgent ? 600 : 400 }}
        >
          {secondary}
        </div>
      </div>
      <div className="payee-row-amount">
        <div className="payee-row-amount-label">{amountLabel}</div>
        <div className="payee-row-amount-value">
          {amountValue != null ? currency(amountValue) : "—"}
        </div>
      </div>
      <i className="ti ti-chevron-right payee-row-chevron"></i>
    </button>
  );
}

export default function PayeeCategoryList({
  categories = [],
  selectedPayeeId = null,
  onSelect,
  formatDate,
}) {
  if (categories.length === 0) {
    return (
      <div className="empty-state">
        <i className="ti ti-credit-card-off"></i>
        <p>
          No payable accounts linked yet. Link a credit card, mortgage or loan account —
          or pay a biller that isn't linked.
        </p>
      </div>
    );
  }

  return (
    <div className="payee-sections">
      {categories.map((category) => (
        <section
          key={category.id}
          className="payee-section"
          id={`payee-section-${category.id}`}
        >
          <header className="payee-section-header">
            <i className={category.icon}></i>
            <span>{category.label}</span>
            <span className="payee-section-count">{category.payees.length}</span>
          </header>
          <div className="payee-section-body">
            {category.payees.map((payee) => (
              <PayeeRow
                key={payee.id}
                payee={{ ...payee, icon: category.icon, iconClass: category.iconClass }}
                selected={selectedPayeeId === payee.id}
                onSelect={onSelect}
                formatDate={formatDate}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
