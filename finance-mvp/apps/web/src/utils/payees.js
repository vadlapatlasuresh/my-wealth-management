/**
 * Groups linked accounts into the payment categories shown on the
 * "Who are you paying?" screen of Make Payment.
 *
 * Plaid gives us a coarse `type` (depository | credit | loan | investment) and a
 * granular `subtype` (checking | savings | credit card | mortgage | student | auto | …).
 * Everything a user can *pay* is either a credit account or a loan account; the
 * loan subtype is what separates a mortgage from a student loan from a car note.
 *
 * Liability detail fields (minimumPayment / nextPaymentDueDate / aprPercentage) are
 * shared across credit and loan accounts on AccountDto, so one normalizer covers all.
 */

export const CATEGORY_CREDIT_CARD = "credit_card";
export const CATEGORY_MORTGAGE = "mortgage";
export const CATEGORY_STUDENT_LOAN = "student_loan";
export const CATEGORY_AUTO_LOAN = "auto_loan";
export const CATEGORY_OTHER = "other";

/**
 * Ordered category definitions. `order` drives section order on screen; the list is
 * rendered in this sequence and empty categories are dropped by the caller.
 */
export const PAYMENT_CATEGORIES = [
  {
    id: CATEGORY_CREDIT_CARD,
    label: "Credit Cards",
    icon: "ti ti-credit-card",
    iconClass: "icon-blue",
    payeeType: "CREDIT_CARD",
  },
  {
    id: CATEGORY_MORTGAGE,
    label: "Mortgage",
    icon: "ti ti-home",
    iconClass: "icon-forest",
    payeeType: "LOAN",
  },
  {
    id: CATEGORY_STUDENT_LOAN,
    label: "Student Loans",
    icon: "ti ti-school",
    iconClass: "icon-gold",
    payeeType: "LOAN",
  },
  {
    id: CATEGORY_AUTO_LOAN,
    label: "Auto / Car Loans",
    icon: "ti ti-car",
    iconClass: "icon-red",
    payeeType: "LOAN",
  },
  {
    id: CATEGORY_OTHER,
    label: "Other Linked Accounts",
    icon: "ti ti-building-store",
    iconClass: "icon-gray",
    payeeType: "OTHER",
  },
];

export const categoryById = (id) =>
  PAYMENT_CATEGORIES.find((c) => c.id === id) || null;

const num = (v) => (v == null || v === "" ? null : Number(v));

/**
 * Maps a Plaid type/subtype pair to one of our payment categories, or null when the
 * account isn't payable at all (checking/savings fund payments, they don't receive them;
 * investment accounts aren't payable either).
 */
export function categoryForAccount(account) {
  const type = String(account?.type || "").toLowerCase();
  const subtype = String(account?.subtype || "").toLowerCase();

  if (type === "credit") return CATEGORY_CREDIT_CARD;

  if (type === "loan") {
    if (subtype.includes("mortgage") || subtype.includes("home equity")) {
      return CATEGORY_MORTGAGE;
    }
    if (subtype.includes("student")) return CATEGORY_STUDENT_LOAN;
    if (subtype.includes("auto") || subtype.includes("car")) return CATEGORY_AUTO_LOAN;
    // Any other loan (personal, consumer, commercial, line of credit…) is still payable.
    return CATEGORY_OTHER;
  }

  return null;
}

/**
 * Normalizes an AccountDto into the shape the payment screens read. Keeps the
 * camelCase field names the existing Bill Pay screens already used for credit cards
 * (balance / minPayment / creditLimit / lastStatementBalance / nextPaymentDueDate)
 * so nothing downstream has to change.
 */
export function toPayee(account) {
  const categoryId = categoryForAccount(account);
  if (!categoryId) return null;
  const category = categoryById(categoryId);

  const balance = Number(account.currentBalance) || 0;
  const minPayment = num(account.minimumPayment);
  const lastStatementBalance = num(account.lastStatementBalance);

  // The amount we pre-fill on the entry screen. Cards default to the minimum due
  // (falling back to the statement balance); loans default to their scheduled payment.
  const suggestedAmount =
    minPayment != null
      ? minPayment
      : lastStatementBalance != null
        ? lastStatementBalance
        : categoryId === CATEGORY_CREDIT_CARD
          ? balance
          : null;

  return {
    id: account.id,
    categoryId,
    payeeType: category.payeeType,
    name: account.name || "Account",
    // `officialName` is Plaid's full institution/product name — the lender or servicer.
    institution: account.officialName || "",
    mask: account.mask || "",
    subtype: account.subtype || "",
    balance,
    creditLimit: num(account.creditLimit),
    minPayment,
    lastStatementBalance,
    suggestedAmount,
    nextPaymentDueDate: account.nextPaymentDueDate || null,
    apr: num(account.aprPercentage),
  };
}

/**
 * Builds the sectioned list for "Who are you paying?".
 * Empty categories are omitted entirely (never rendered as empty sections).
 */
export function buildPayeeCategories(accounts = []) {
  const payees = accounts.map(toPayee).filter(Boolean);

  return PAYMENT_CATEGORIES.map((category) => ({
    ...category,
    payees: payees
      .filter((p) => p.categoryId === category.id)
      // Soonest due first, then largest balance — the most urgent payment leads.
      .sort((a, b) => {
        const da = a.nextPaymentDueDate || "9999-12-31";
        const db = b.nextPaymentDueDate || "9999-12-31";
        if (da !== db) return da < db ? -1 : 1;
        return b.balance - a.balance;
      }),
  })).filter((category) => category.payees.length > 0);
}

/** Days from today until `iso` (negative = overdue). Null when there's no date. */
export function daysUntil(iso) {
  if (!iso) return null;
  const due = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86400000);
}
