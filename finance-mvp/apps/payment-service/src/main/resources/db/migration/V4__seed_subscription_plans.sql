-- Bootstrap the two shipping plans. Everything here is editable in the DB afterwards
-- (price, trial length, feature toggles) without a code change.

-- Individual — $9.99/mo, 7-day free trial. Annual = 10 months (2 months free) => $99.90/yr.
INSERT INTO subscription_plan
    (plan_key, name, tagline, tier, monthly_price, annual_price, annual_months, currency, trial_days, accent, sort_order, active)
VALUES
    ('individual', 'Individual', 'Personal wealth, fully organized', 1, 9.99, 99.90, 10, 'USD', 7, 'forest', 1, TRUE);

-- Business — $29.99/mo, 7-day free trial. Annual = 10 months (2 months free) => $299.90/yr.
INSERT INTO subscription_plan
    (plan_key, name, tagline, tier, monthly_price, annual_price, annual_months, currency, trial_days, accent, sort_order, active)
VALUES
    ('business', 'Business', 'Run every entity from one place', 2, 29.99, 299.90, 10, 'USD', 7, 'gold', 2, TRUE);

-- Individual-tier features.
INSERT INTO plan_feature (plan_key, feature_key, label, description, enabled, sort_order) VALUES
    ('individual', 'individual.netWorth',   'Net-worth tracking',        'Live net worth across linked banks, cards, investments and property.', TRUE, 1),
    ('individual', 'individual.budgeting',  'Budgets & cash flow',       'Monthly budgets with automatic category tracking.',                    TRUE, 2),
    ('individual', 'individual.billpay',    'Bill pay & reminders',      'Schedule payments and get tiered due-date reminders.',                 TRUE, 3),
    ('individual', 'individual.goals',      'Savings goals',             'Track goals with linked-account auto-progress.',                       TRUE, 4),
    ('individual', 'individual.debtLab',    'Debt payoff lab',           'Avalanche / snowball payoff planning.',                                TRUE, 5),
    ('individual', 'individual.documents',  'Personal document center',  'Store, organize and securely share your documents.',                   TRUE, 6),
    ('individual', 'individual.aiInsights', 'AI insights',               'Personalized AI insights on your finances.',                           TRUE, 7);

-- Business-tier features = everything Individual PLUS the business toolset (so the Business
-- tier page and its entitlements are the full superset, purely from these rows).
INSERT INTO plan_feature (plan_key, feature_key, label, description, enabled, sort_order) VALUES
    ('business', 'individual.netWorth',    'Net-worth tracking',        'Live net worth across linked banks, cards, investments and property.', TRUE, 1),
    ('business', 'individual.budgeting',   'Budgets & cash flow',       'Monthly budgets with automatic category tracking.',                    TRUE, 2),
    ('business', 'individual.billpay',     'Bill pay & reminders',      'Schedule payments and get tiered due-date reminders.',                 TRUE, 3),
    ('business', 'individual.goals',       'Savings goals',             'Track goals with linked-account auto-progress.',                       TRUE, 4),
    ('business', 'individual.debtLab',     'Debt payoff lab',           'Avalanche / snowball payoff planning.',                                TRUE, 5),
    ('business', 'individual.documents',   'Personal document center',  'Store, organize and securely share your documents.',                   TRUE, 6),
    ('business', 'individual.aiInsights',  'AI insights',               'Personalized AI insights on your finances.',                           TRUE, 7),
    ('business', 'business.multiEntity',   'Multi-business dashboards', 'Per-entity dashboards with period-aware, ledger-derived KPIs.',        TRUE, 8),
    ('business', 'business.invoicing',     'Invoicing & payments',      'Send invoices by email/SMS and reconcile payments.',                   TRUE, 9),
    ('business', 'business.dealroom',      'Deal Room & marketplace',   'List and discover investment deals.',                                  TRUE, 10),
    ('business', 'business.fractional',    'Fractional LLC tools',      'Structure and track fractional-ownership entities.',                   TRUE, 11),
    ('business', 'business.cpaSharing',    'CPA secure sharing',        'Share business documents with your CPA via expiring links.',           TRUE, 12),
    ('business', 'business.prioritySupport', 'Priority support',        'Front-of-line customer support.',                                      TRUE, 13);
