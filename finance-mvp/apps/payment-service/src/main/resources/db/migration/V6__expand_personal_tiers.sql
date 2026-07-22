-- Personal-finance expansion: widen the plan ladder from 2 tiers (individual, business)
-- to 4 (free, individual/"Plus", premium, business), and register the new personal
-- feature_keys the expansion introduces. Everything here is CONFIG — rows the app reads
-- at runtime — so prices and feature toggles stay editable without a redeploy, exactly
-- like V4.
--
-- SAFETY: this migration is purely additive.
--   * Existing 'individual' and 'business' plans are untouched except for NEW feature rows.
--   * 'premium' is added active (a richer paid tier — safe to offer immediately).
--   * 'free' is added INACTIVE. Turning it on (active = TRUE) requires two code changes
--     first, tracked in the expansion roadmap:
--        1. entitlements resolver: map subscription status NONE -> the 'free' feature set
--           (today NONE means "never engaged" and is left fully un-gated),
--        2. checkout/trial flow: accept a $0 plan without attempting a charge.
--     Seeding it inactive lets the catalog/config exist now without exposing a broken
--     $0 checkout in production.

-- ---------------------------------------------------------------------------
-- New plans
-- ---------------------------------------------------------------------------

-- Free — $0, the acquisition floor. INACTIVE until the two code changes above land.
INSERT INTO subscription_plan
    (plan_key, name, tagline, tier, monthly_price, annual_price, annual_months, currency, trial_days, accent, sort_order, active)
VALUES
    ('free', 'Free', 'Your whole financial picture, free', 0, 0.00, 0.00, 12, 'USD', 0, 'slate', 0, FALSE);

-- Premium — $14.99/mo, sits between Plus (individual) and Business. 7-day trial,
-- annual = 10 months (2 months free) => $149.90/yr.
INSERT INTO subscription_plan
    (plan_key, name, tagline, tier, monthly_price, annual_price, annual_months, currency, trial_days, accent, sort_order, active)
VALUES
    ('premium', 'Premium', 'Get ahead — plan, share and optimize', 3, 14.99, 149.90, 10, 'USD', 7, 'violet', 3, TRUE);

-- Keep tier ordering coherent: business must rank above premium for upgrade/downgrade
-- comparisons. V4 seeded business.tier = 2; bump it to 4 now that premium takes rank 3.
UPDATE subscription_plan SET tier = 4, sort_order = 4 WHERE plan_key = 'business';

-- ---------------------------------------------------------------------------
-- Free-tier features (the acquisition floor: enough to be genuinely useful solo).
-- ---------------------------------------------------------------------------
INSERT INTO plan_feature (plan_key, feature_key, label, description, enabled, sort_order) VALUES
    ('free', 'individual.netWorth',        'Net-worth tracking',   'Live net worth across linked banks, cards, investments and property.', TRUE, 1),
    ('free', 'individual.netWorthTrends',  'Net-worth trends',     'See your net worth over time and what moved it.',                      TRUE, 2),
    ('free', 'individual.todayFeed',       'Today feed',           'A daily surface of what changed and what needs you.',                  TRUE, 3),
    ('free', 'individual.budgeting',       'Budgets',              'Monthly budgets with automatic category tracking.',                    TRUE, 4),
    ('free', 'individual.goals',           'Savings goals (up to 3)', 'Track up to three goals with linked-account auto-progress.',         TRUE, 5),
    ('free', 'individual.healthScore',     'Financial health score', 'A single 0-100 score with clear actions to improve it.',             TRUE, 6),
    ('free', 'individual.emergencyFund',   'Emergency-fund coach', 'A target based on your real expenses, with auto-progress.',            TRUE, 7),
    ('free', 'individual.spendInsights',   'Spending insights',    'Auto-categorized spending with trend callouts.',                       TRUE, 8),
    ('free', 'individual.yearInReview',    'Year in review',       'Your shareable year-end money recap.',                                 TRUE, 9),
    ('free', 'individual.export',          'Export your data',     'Export everything, anytime. Your data is yours — no lock-in.',         TRUE, 10);

-- ---------------------------------------------------------------------------
-- New personal feature_keys for the existing 'individual' (Plus) plan.
-- The V4 individual rows stay; these are the expansion additions.
-- ---------------------------------------------------------------------------
INSERT INTO plan_feature (plan_key, feature_key, label, description, enabled, sort_order) VALUES
    ('individual', 'individual.netWorthTrends', 'Net-worth trends',    'See your net worth over time and what moved it.',               TRUE, 20),
    ('individual', 'individual.todayFeed',      'Today feed',          'A daily surface of what changed and what needs you.',           TRUE, 21),
    ('individual', 'individual.healthScore',    'Financial health score', 'A single 0-100 score with clear actions to improve it.',      TRUE, 22),
    ('individual', 'individual.emergencyFund',  'Emergency-fund coach','A target based on your real expenses, with auto-progress.',      TRUE, 23),
    ('individual', 'individual.spendInsights',  'Spending insights',   'Auto-categorized spending with trend callouts.',                TRUE, 24),
    ('individual', 'individual.yearInReview',   'Year in review',      'Your shareable year-end money recap.',                          TRUE, 25),
    ('individual', 'individual.export',         'Export your data',    'Export everything, anytime. No lock-in.',                       TRUE, 26),
    ('individual', 'individual.recurring',      'Recurring radar',     'Detect recurring charges and price hikes; cancel what you forgot.', TRUE, 27),
    ('individual', 'individual.cashflow',       'Cash-flow view',      'Money in vs out over time, and a safe-to-spend number.',         TRUE, 28),
    ('individual', 'individual.smartAlerts',    'Smart alerts',        'Anomaly alerts: large charges, low balance, double charges.',    TRUE, 29),
    ('individual', 'individual.household',      'Shared household',    'Invite a partner; share accounts, goals and bills.',             TRUE, 30),
    ('individual', 'individual.sharedGoals',    'Shared goals & bills','Split goals, assign bills, track who paid what.',                TRUE, 31),
    ('individual', 'individual.aiProactive',    'Proactive AI',        'AI that recommends actions grounded in your real numbers.',      TRUE, 32);

-- ---------------------------------------------------------------------------
-- Premium — the full personal superset (everything Plus has, plus power features).
-- ---------------------------------------------------------------------------
INSERT INTO plan_feature (plan_key, feature_key, label, description, enabled, sort_order) VALUES
    ('premium', 'individual.netWorth',        'Net-worth tracking',   'Live net worth across linked banks, cards, investments and property.', TRUE, 1),
    ('premium', 'individual.netWorthTrends',  'Net-worth trends',     'See your net worth over time and what moved it.',                      TRUE, 2),
    ('premium', 'individual.todayFeed',       'Today feed',           'A daily surface of what changed and what needs you.',                  TRUE, 3),
    ('premium', 'individual.budgeting',       'Budgets',              'Monthly budgets with automatic category tracking.',                    TRUE, 4),
    ('premium', 'individual.billpay',         'Bill pay & reminders', 'Schedule payments and get tiered due-date reminders.',                 TRUE, 5),
    ('premium', 'individual.goals',           'Unlimited savings goals', 'Unlimited goals with linked-account auto-progress.',                TRUE, 6),
    ('premium', 'individual.debtLab',         'Debt payoff lab',      'Avalanche / snowball payoff planning.',                                TRUE, 7),
    ('premium', 'individual.documents',       'Personal document center', 'Store, organize and securely share your documents.',               TRUE, 8),
    ('premium', 'individual.aiInsights',      'AI insights',          'Personalized AI insights on your finances.',                           TRUE, 9),
    ('premium', 'individual.healthScore',     'Financial health score', 'A single 0-100 score with clear actions to improve it.',             TRUE, 10),
    ('premium', 'individual.emergencyFund',   'Emergency-fund coach', 'A target based on your real expenses, with auto-progress.',            TRUE, 11),
    ('premium', 'individual.spendInsights',   'Spending insights',    'Auto-categorized spending with trend callouts.',                       TRUE, 12),
    ('premium', 'individual.yearInReview',    'Year in review',       'Your shareable year-end money recap.',                                 TRUE, 13),
    ('premium', 'individual.export',          'Export your data',     'Export everything, anytime. No lock-in.',                              TRUE, 14),
    ('premium', 'individual.recurring',       'Recurring radar',      'Detect recurring charges and price hikes; cancel what you forgot.',    TRUE, 15),
    ('premium', 'individual.cashflow',        'Cash-flow view',       'Money in vs out over time, and a safe-to-spend number.',               TRUE, 16),
    ('premium', 'individual.smartAlerts',     'Smart alerts',         'Anomaly alerts: large charges, low balance, double charges.',          TRUE, 17),
    ('premium', 'individual.household',       'Shared household',     'Invite a partner; share accounts, goals and bills.',                   TRUE, 18),
    ('premium', 'individual.sharedGoals',     'Shared goals & bills', 'Split goals, assign bills, track who paid what.',                      TRUE, 19),
    ('premium', 'individual.aiProactive',     'Proactive AI',         'AI that recommends actions grounded in your real numbers.',            TRUE, 20),
    ('premium', 'individual.creditScore',     'Credit score & monitoring', 'Track your credit score and get change alerts.',                  TRUE, 21),
    ('premium', 'individual.billOptimizer',   'Bill due-date optimizer', 'Reorder due dates to smooth your cash flow.',                       TRUE, 22),
    ('premium', 'individual.investInsights',  'Investment insights',  'Allocation, fees you are paying, and drift alerts.',                   TRUE, 23),
    ('premium', 'individual.benchmarks',      'Benchmarking',         'See how your savings and net worth compare (anonymized, opt-in).',     TRUE, 24),
    ('premium', 'individual.goalScenarios',   'Goal scenarios',       'Model retire-at-X and what-if scenarios with sliders.',                TRUE, 25),
    ('premium', 'individual.family',          'Family mode',          'Allowance, teen accounts and a guardian view.',                        TRUE, 26);

-- ---------------------------------------------------------------------------
-- Business inherits the whole personal superset (it already carried the V4
-- individual features; add the new personal keys so Business stays the top set).
-- ---------------------------------------------------------------------------
INSERT INTO plan_feature (plan_key, feature_key, label, description, enabled, sort_order) VALUES
    ('business', 'individual.netWorthTrends', 'Net-worth trends',     'See your net worth over time and what moved it.',               TRUE, 20),
    ('business', 'individual.todayFeed',      'Today feed',           'A daily surface of what changed and what needs you.',           TRUE, 21),
    ('business', 'individual.healthScore',    'Financial health score', 'A single 0-100 score with clear actions to improve it.',      TRUE, 22),
    ('business', 'individual.emergencyFund',  'Emergency-fund coach', 'A target based on your real expenses, with auto-progress.',      TRUE, 23),
    ('business', 'individual.spendInsights',  'Spending insights',    'Auto-categorized spending with trend callouts.',                TRUE, 24),
    ('business', 'individual.yearInReview',   'Year in review',       'Your shareable year-end money recap.',                          TRUE, 25),
    ('business', 'individual.export',         'Export your data',     'Export everything, anytime. No lock-in.',                       TRUE, 26),
    ('business', 'individual.recurring',      'Recurring radar',      'Detect recurring charges and price hikes; cancel what you forgot.', TRUE, 27),
    ('business', 'individual.cashflow',       'Cash-flow view',       'Money in vs out over time, and a safe-to-spend number.',         TRUE, 28),
    ('business', 'individual.smartAlerts',    'Smart alerts',         'Anomaly alerts: large charges, low balance, double charges.',    TRUE, 29),
    ('business', 'individual.household',      'Shared household',     'Invite a partner; share accounts, goals and bills.',             TRUE, 30),
    ('business', 'individual.sharedGoals',    'Shared goals & bills', 'Split goals, assign bills, track who paid what.',                TRUE, 31),
    ('business', 'individual.aiProactive',    'Proactive AI',         'AI that recommends actions grounded in your real numbers.',      TRUE, 32),
    ('business', 'individual.creditScore',    'Credit score & monitoring', 'Track your credit score and get change alerts.',            TRUE, 33),
    ('business', 'individual.billOptimizer',  'Bill due-date optimizer', 'Reorder due dates to smooth your cash flow.',                 TRUE, 34),
    ('business', 'individual.investInsights', 'Investment insights',  'Allocation, fees you are paying, and drift alerts.',             TRUE, 35),
    ('business', 'individual.benchmarks',     'Benchmarking',         'See how your savings and net worth compare (anonymized, opt-in).', TRUE, 36),
    ('business', 'individual.goalScenarios',  'Goal scenarios',       'Model retire-at-X and what-if scenarios with sliders.',          TRUE, 37),
    ('business', 'individual.family',         'Family mode',          'Allowance, teen accounts and a guardian view.',                  TRUE, 38);
