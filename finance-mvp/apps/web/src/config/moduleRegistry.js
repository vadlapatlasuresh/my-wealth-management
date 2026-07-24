import React from 'react';
import { isFlagEnabled, FLAGS } from './featureFlags';

/* moduleRegistry.js
   Single source of truth mapping each module `id` -> React page component +
   default metadata. Components are React.lazy so each module code-splits.

   The remote config service may reorder/enable/disable/hide modules, but it can
   only reference ids that exist here. Anything the remote config asks for that
   we don't know about is ignored; if the remote config is unavailable we fall
   back to DEFAULT_SECTIONS + DEFAULT_MODULES (the current hardcoded nav).
*/

// Lazy page components (code-split per module).
const TodayPage       = React.lazy(() => import('../pages/TodayPage'));
const RecurringPage   = React.lazy(() => import('../pages/RecurringPage'));
const HealthScorePage = React.lazy(() => import('../pages/HealthScorePage'));
const CashFlowPage    = React.lazy(() => import('../pages/CashFlowPage'));
const AlertsPage      = React.lazy(() => import('../pages/AlertsPage'));
const SpendingPage    = React.lazy(() => import('../pages/SpendingInsightsPage'));
const YearInReviewPage = React.lazy(() => import('../pages/YearInReviewPage'));
const BillOptimizerPage = React.lazy(() => import('../pages/BillOptimizerPage'));
const InvestmentInsightsPage = React.lazy(() => import('../pages/InvestmentInsightsPage'));
const CreditScorePage = React.lazy(() => import('../pages/CreditScorePage'));
const VisualizationStudioPage = React.lazy(() => import('../pages/VisualizationStudioPage'));
const GoalScenariosPage = React.lazy(() => import('../pages/GoalScenariosPage'));
const EmergencyFundPage = React.lazy(() => import('../pages/EmergencyFundPage'));
const CoachPage       = React.lazy(() => import('../pages/CoachPage'));
const HouseholdPage   = React.lazy(() => import('../pages/HouseholdPage'));
const SharedMoneyPage = React.lazy(() => import('../pages/SharedMoneyPage'));
const HomePage        = React.lazy(() => import('../pages/HomePage'));
const AccountsPage    = React.lazy(() => import('../pages/AccountsPage'));
const TransactionsPage = React.lazy(() => import('../pages/TransactionsPage'));
const PlanPage        = React.lazy(() => import('../pages/PlanPage'));
const MakePaymentPage = React.lazy(() => import('../pages/MakePaymentPage'));
const InvestPage      = React.lazy(() => import('../pages/InvestPage'));
const MyBusinessPage  = React.lazy(() => import('../pages/MyBusinessPage'));
const CalculatorsPage = React.lazy(() => import('../pages/CalculatorsPage'));
const GoalsPage       = React.lazy(() => import('../pages/GoalsPage'));
const TaxPage         = React.lazy(() => import('../pages/TaxPage'));
const CpaMarketplacePage = React.lazy(() => import('../pages/CpaMarketplacePage'));
const AdminDashboardPage = React.lazy(() => import('../pages/AdminDashboardPage'));
const AIAssistantPage = React.lazy(() => import('../pages/AIAssistantPage'));
const RealEstatePage  = React.lazy(() => import('../pages/RealEstatePage'));
const DealRoomPage    = React.lazy(() => import('../pages/DealRoomPage'));
const FractionalLLCPage = React.lazy(() => import('../pages/FractionalLLCPage'));
const SecurityPage    = React.lazy(() => import('../pages/SecurityPage'));
const MessagesPage    = React.lazy(() => import('../pages/MessagesPage'));
const SettingsPage    = React.lazy(() => import('../pages/SettingsPage'));
const LearnPage       = React.lazy(() => import('../pages/LearnPage'));
const GuidePage       = React.lazy(() => import('../pages/GuidePage'));
const StyleGuidePage  = React.lazy(() => import('../pages/StyleGuidePage'));
const UIFlowMapPage   = React.lazy(() => import('../pages/UIFlowMapPage'));
const ProfilePage     = React.lazy(() => import('../pages/ProfilePage'));
const DocumentCenterPage = React.lazy(() => import('../pages/DocumentCenterPage'));
const SubscriptionPage = React.lazy(() => import('../pages/SubscriptionPage'));
const PlanTierPage    = React.lazy(() => import('../pages/PlanTierPage'));

/* Section ids used to group modules in the sidebar.
   Mirrors the server config (platform-config-service V7). SECTION_FINANCE is retained
   as a legacy id so any stored per-user/remote config still resolves, but no module
   defaults into it anymore. */
export const SECTION_DAILY = 'daily';
export const SECTION_MONEY = 'money';
export const SECTION_GROW = 'grow';
export const SECTION_SHARED = 'shared';
export const SECTION_BUSINESS = 'business';
export const SECTION_REALESTATE = 'realestate';
export const SECTION_SETTINGS = 'settings';
export const SECTION_FINANCE = 'finance'; // legacy — kept for backward-compatible resolution

/* Default sidebar sections, in display order. */
export const DEFAULT_SECTIONS = [
  { id: SECTION_DAILY,      label: 'Today',          order: 1 },
  { id: SECTION_MONEY,      label: 'Money',          order: 2 },
  { id: SECTION_GROW,       label: 'Grow',           order: 3 },
  { id: SECTION_SHARED,     label: 'Shared',         order: 4 },
  { id: SECTION_BUSINESS,   label: 'Business & Tax', order: 5 },
  { id: SECTION_REALESTATE, label: 'Real Estate',    order: 6 },
  { id: SECTION_SETTINGS,   label: 'More',           order: 7 },
];

/* Registry: one entry per module id.
   - id:           stable identifier (matches remote config module ids)
   - title:        nav label
   - icon:         tabler icon class
   - route:        router path
   - section:      which sidebar section it belongs to (null = route only, no nav)
   - defaultOrder: order within its section in the default nav
   - component:    lazy React component
   - badge:        optional badge key consumed by the Sidebar ('billpay' or a number)
   - inNavByDefault: whether it shows in the sidebar by default
*/
export const MODULE_REGISTRY = {
  // Today — the daily-open surface (Phase 1 of the personal-finance expansion).
  // feature_key: individual.todayFeed (Free tier). First item in the Finance section.
  today: {
    id: 'today', title: 'Today', icon: 'ti ti-sun',
    route: '/today', section: SECTION_DAILY, defaultOrder: 1,
    component: TodayPage, inNavByDefault: true,
  },
  // Smart alerts / anomaly detection (Phase 2). feature_key: individual.smartAlerts.
  alerts: {
    id: 'alerts', title: 'Alerts', icon: 'ti ti-bell',
    route: '/alerts', section: SECTION_DAILY, defaultOrder: 2,
    component: AlertsPage, inNavByDefault: true,
  },
  home: {
    id: 'home', title: 'Home', icon: 'ti ti-layout-dashboard',
    route: '/', section: SECTION_MONEY, defaultOrder: 1,
    component: HomePage, inNavByDefault: true,
  },
  accounts: {
    id: 'accounts', title: 'Accounts', icon: 'ti ti-wallet',
    route: '/accounts', section: SECTION_MONEY, defaultOrder: 2,
    component: AccountsPage, inNavByDefault: true,
  },
  transactions: {
    id: 'transactions', title: 'Transactions', icon: 'ti ti-arrows-exchange-2',
    route: '/transactions', section: SECTION_MONEY, defaultOrder: 3,
    component: TransactionsPage, inNavByDefault: true,
  },
  budget: {
    id: 'budget', title: 'Budgets', icon: 'ti ti-chart-pie',
    route: '/budget', section: SECTION_MONEY, defaultOrder: 4,
    component: PlanPage, inNavByDefault: true,
  },
  // Module id stays 'billpay' so saved per-user nav ordering/visibility keeps resolving;
  // only the user-facing title and route moved to "Make Payment".
  billpay: {
    id: 'billpay', title: 'Make Payment', icon: 'ti ti-receipt',
    route: '/make-payment', section: SECTION_MONEY, defaultOrder: 5,
    component: MakePaymentPage, inNavByDefault: true, badge: 'billpay',
  },
  // Recurring & subscriptions radar (Phase 2). feature_key: individual.recurring.
  recurring: {
    id: 'recurring', title: 'Recurring', icon: 'ti ti-repeat',
    route: '/recurring', section: SECTION_MONEY, defaultOrder: 6,
    component: RecurringPage, inNavByDefault: true,
  },
  // Spending insights: category breakdown + movers (Phase 2). feature_key: individual.spendInsights.
  spending: {
    id: 'spending', title: 'Spending', icon: 'ti ti-chart-donut',
    route: '/spending', section: SECTION_MONEY, defaultOrder: 8,
    component: SpendingPage, inNavByDefault: true,
  },
  // Cash-flow view: money in vs out + safe-to-spend (Phase 2). feature_key: individual.cashflow.
  cashflow: {
    id: 'cashflow', title: 'Cash Flow', icon: 'ti ti-arrows-exchange',
    route: '/cash-flow', section: SECTION_MONEY, defaultOrder: 7,
    component: CashFlowPage, inNavByDefault: true,
  },
  // Year-in-Review — "Wrapped for your money" (Phase 4). feature_key: individual.yearInReview.
  yearinreview: {
    id: 'yearinreview', title: 'Year in Review', icon: 'ti ti-confetti',
    route: '/year-in-review', section: SECTION_MONEY, defaultOrder: 9,
    component: YearInReviewPage, inNavByDefault: true,
  },
  // Bill due-date optimizer (Phase 4). feature_key: individual.billOptimizer.
  billoptimizer: {
    id: 'billoptimizer', title: 'Bill Timing', icon: 'ti ti-calendar-stats',
    route: '/bill-timing', section: SECTION_MONEY, defaultOrder: 10,
    component: BillOptimizerPage, inNavByDefault: true,
  },
  debt: {
    id: 'debt', title: 'Debt Lab', icon: 'ti ti-trending-down',
    route: '/debt', section: SECTION_GROW, defaultOrder: 2,
    component: PlanPage, inNavByDefault: true,
  },
  invest: {
    id: 'invest', title: 'Investments', icon: 'ti ti-chart-line',
    route: '/invest', section: SECTION_GROW, defaultOrder: 3,
    component: InvestPage, inNavByDefault: true,
  },
  // Investment insights: allocation, concentration, fees, drift (Phase 4). feature_key: individual.investInsights.
  investinsights: {
    id: 'investinsights', title: 'Invest Insights', icon: 'ti ti-chart-pie',
    route: '/investment-insights', section: SECTION_GROW, defaultOrder: 9,
    component: InvestmentInsightsPage, inNavByDefault: true,
  },
  // Goal scenarios — retirement projection w/ return bands (Phase 5). feature_key: individual.goalScenarios.
  goalscenarios: {
    id: 'goalscenarios', title: 'Scenarios', icon: 'ti ti-chart-histogram',
    route: '/goal-scenarios', section: SECTION_GROW, defaultOrder: 11,
    component: GoalScenariosPage, inNavByDefault: true,
  },
  // Credit monitoring (Phase 4) — behind FLAGS.CREDIT_MONITORING (off by default; added to the
  // default Grow nav only when the flag is enabled). Route is always registered so a direct
  // visit works for preview/QA. feature_key: individual.creditMonitoring.
  creditscore: {
    id: 'creditscore', title: 'Credit Score', icon: 'ti ti-gauge',
    route: '/credit', section: SECTION_GROW, defaultOrder: 10,
    component: CreditScorePage, inNavByDefault: isFlagEnabled(FLAGS.CREDIT_MONITORING),
  },
  mybusiness: {
    id: 'mybusiness', title: 'My Business', icon: 'ti ti-briefcase',
    route: '/mybusiness', section: SECTION_BUSINESS, defaultOrder: 1,
    component: MyBusinessPage, inNavByDefault: true,
  },
  'ai-assistant': {
    id: 'ai-assistant', title: 'AI Assistant', icon: 'ti ti-sparkles',
    route: '/ai-assistant', section: SECTION_GROW, defaultOrder: 5,
    component: AIAssistantPage, inNavByDefault: true,
  },
  // Money Coach — proactive next-best-actions (Phase 3). feature_key: individual.aiProactive.
  coach: {
    id: 'coach', title: 'Coach', icon: 'ti ti-compass',
    route: '/coach', section: SECTION_GROW, defaultOrder: 8,
    component: CoachPage, inNavByDefault: true,
  },
  // Shared household (Phase 3a). feature_key: individual.household (Plus; owner-pays).
  household: {
    id: 'household', title: 'Household', icon: 'ti ti-home-heart',
    route: '/household', section: SECTION_SHARED, defaultOrder: 1,
    component: HouseholdPage, inNavByDefault: true,
  },
  // Household-owned goals & bills (Phase 3b). feature_key: individual.sharedGoals.
  sharedmoney: {
    id: 'sharedmoney', title: 'Goals & Bills', icon: 'ti ti-users-group',
    route: '/shared-money', section: SECTION_SHARED, defaultOrder: 2,
    component: SharedMoneyPage, inNavByDefault: true,
  },
  // Emergency-fund coach (Phase 2). feature_key: individual.emergencyFund (Free floor).
  emergencyfund: {
    id: 'emergencyfund', title: 'Emergency Fund', icon: 'ti ti-umbrella',
    route: '/emergency-fund', section: SECTION_GROW, defaultOrder: 7,
    component: EmergencyFundPage, inNavByDefault: true,
  },
  // Financial health score (Phase 2). feature_key: individual.healthScore (Free floor).
  healthscore: {
    id: 'healthscore', title: 'Health Score', icon: 'ti ti-heartbeat',
    route: '/health-score', section: SECTION_GROW, defaultOrder: 6,
    component: HealthScorePage, inNavByDefault: true,
  },
  calculators: {
    id: 'calculators', title: 'Calculators', icon: 'ti ti-calculator',
    route: '/calculators', section: SECTION_GROW, defaultOrder: 4,
    component: CalculatorsPage, inNavByDefault: true,
  },
  goals: {
    id: 'goals', title: 'Goals', icon: 'ti ti-target',
    route: '/goals', section: SECTION_GROW, defaultOrder: 1,
    component: GoalsPage, inNavByDefault: true,
  },
  tax: {
    id: 'tax', title: 'Taxes', icon: 'ti ti-receipt-tax',
    route: '/tax', section: SECTION_BUSINESS, defaultOrder: 2,
    component: TaxPage, inNavByDefault: true,
  },
  // "Find a CPA" lives under Taxes now (surfaced prominently on the Tax page), so it's a
  // route-only module — reachable at /cpa but not a separate sidebar item, to reduce clutter.
  cpa: {
    id: 'cpa', title: 'Find a CPA', icon: 'ti ti-user-check',
    route: '/cpa', section: null, defaultOrder: 0,
    component: CpaMarketplacePage, inNavByDefault: false,
  },

  realestate: {
    id: 'realestate', title: 'Properties', icon: 'ti ti-building-estate',
    route: '/realestate', section: SECTION_REALESTATE, defaultOrder: 1,
    component: RealEstatePage, inNavByDefault: true,
  },
  dealroom: {
    id: 'dealroom', title: 'Deal Room', icon: 'ti ti-briefcase',
    route: '/dealroom', section: SECTION_REALESTATE, defaultOrder: 2,
    component: DealRoomPage, inNavByDefault: true,
  },
  fractional: {
    id: 'fractional', title: 'Fractional LLC', icon: 'ti ti-brand-stackshare',
    route: '/fractional', section: SECTION_REALESTATE, defaultOrder: 3,
    component: FractionalLLCPage, inNavByDefault: true,
  },

  documents: {
    id: 'documents', title: 'Documents', icon: 'ti ti-folders',
    route: '/documents', section: SECTION_SETTINGS, defaultOrder: 1,
    component: DocumentCenterPage, inNavByDefault: true,
  },
  security: {
    id: 'security', title: 'Security', icon: 'ti ti-shield-lock',
    route: '/security', section: SECTION_SETTINGS, defaultOrder: 2,
    component: SecurityPage, inNavByDefault: true,
  },
  messages: {
    id: 'messages', title: 'Messages', icon: 'ti ti-message-2',
    route: '/messages', section: SECTION_SETTINGS, defaultOrder: 3,
    component: MessagesPage, inNavByDefault: true, badge: 2,
  },
  settings: {
    id: 'settings', title: 'Settings', icon: 'ti ti-settings',
    route: '/settings', section: SECTION_SETTINGS, defaultOrder: 4,
    component: SettingsPage, inNavByDefault: true,
  },
  subscription: {
    id: 'subscription', title: 'Subscription', icon: 'ti ti-crown',
    route: '/subscription', section: SECTION_SETTINGS, defaultOrder: 5,
    component: SubscriptionPage, inNavByDefault: true,
  },
  // Per-tier feature page (route-only, parameterized): /plans/:planKey.
  plantier: {
    id: 'plantier', title: 'Plan details', icon: 'ti ti-crown',
    route: '/plans/:planKey', section: null, defaultOrder: 0,
    component: PlanTierPage, inNavByDefault: false,
  },

  // Routes that exist but are NOT in the sidebar by default. They stay as
  // always-available routes regardless of remote config (section: null).
  learn: {
    id: 'learn', title: 'How to use', icon: 'ti ti-help-circle',
    route: '/learn', section: null, defaultOrder: 0,
    component: LearnPage, inNavByDefault: false,
  },
  guide: {
    id: 'guide', title: 'How to use', icon: 'ti ti-book',
    route: '/guide', section: null, defaultOrder: 0,
    component: GuidePage, inNavByDefault: false,
  },
  styleguide: {
    id: 'styleguide', title: 'Style Guide', icon: 'ti ti-palette',
    route: '/styleguide', section: null, defaultOrder: 0,
    component: StyleGuidePage, inNavByDefault: false,
  },
  // Visualization Studio — the in-app design/mockup studio (ported from the standalone
  // assets/terravest-design-studio.html). Reachable at BOTH /flowmap and /visualization;
  // both show the same live in-app view (not an iframe) and appear in the More nav.
  flowmap: {
    id: 'flowmap', title: 'UI Flow Map', icon: 'ti ti-git-merge',
    route: '/flowmap', section: SECTION_SETTINGS, defaultOrder: 6,
    component: VisualizationStudioPage, inNavByDefault: true,
  },
  visualization: {
    id: 'visualization', title: 'Visualization', icon: 'ti ti-layout-dashboard',
    route: '/visualization', section: SECTION_SETTINGS, defaultOrder: 7,
    component: VisualizationStudioPage, inNavByDefault: true,
  },
  profile: {
    id: 'profile', title: 'Profile', icon: 'ti ti-user',
    route: '/profile', section: SECTION_SETTINGS, defaultOrder: 4,
    // Rendered as the sidebar footer user-card (avatar + name), so it's NOT a default
    // section nav item — otherwise resolveNav's union pass lists it under Settings too,
    // showing Profile twice. Reachable via the footer card and /profile route.
    component: ProfilePage, inNavByDefault: false,
  },
  admin: {
    id: 'admin', title: 'Admin · Analytics', icon: 'ti ti-chart-dots',
    route: '/admin', section: null, defaultOrder: 0, // route-only; linked from Profile for admins
    component: AdminDashboardPage, inNavByDefault: false,
  },
};

/* DEFAULT_MODULES: ordered list of ids that appear in the sidebar today,
   grouped by section. Used to build the bundled fallback config. */
export const DEFAULT_MODULES = {
  [SECTION_DAILY]:      ['today', 'alerts'],
  [SECTION_MONEY]:      ['home', 'accounts', 'transactions', 'budget', 'billpay', 'recurring', 'cashflow', 'spending', 'yearinreview', 'billoptimizer'],
  [SECTION_GROW]:       ['goals', 'goalscenarios', 'debt', 'invest', 'investinsights', 'calculators', 'ai-assistant', 'healthscore', 'emergencyfund', 'coach',
                          ...(isFlagEnabled(FLAGS.CREDIT_MONITORING) ? ['creditscore'] : [])],
  [SECTION_SHARED]:     ['household', 'sharedmoney'],
  [SECTION_BUSINESS]:   ['mybusiness', 'tax'],
  [SECTION_REALESTATE]: ['realestate', 'dealroom', 'fractional'],
  [SECTION_SETTINGS]:   ['documents', 'security', 'messages', 'subscription', 'settings', 'flowmap', 'visualization'],
};

/* Flat ordered list of every default-nav module id, in sidebar order. */
export const DEFAULT_MODULE_ORDER = [
  ...DEFAULT_MODULES[SECTION_DAILY],
  ...DEFAULT_MODULES[SECTION_MONEY],
  ...DEFAULT_MODULES[SECTION_GROW],
  ...DEFAULT_MODULES[SECTION_SHARED],
  ...DEFAULT_MODULES[SECTION_BUSINESS],
  ...DEFAULT_MODULES[SECTION_REALESTATE],
  ...DEFAULT_MODULES[SECTION_SETTINGS],
];

/* Build the bundled DEFAULT remote-config-shaped object from the registry.
   Mirrors the shape the gateway returns so the resolver treats default and
   remote configs identically. */
export function buildDefaultConfig() {
  const modules = [];
  for (const section of DEFAULT_SECTIONS) {
    const ids = DEFAULT_MODULES[section.id] || [];
    ids.forEach((id, idx) => {
      const reg = MODULE_REGISTRY[id];
      if (!reg) return;
      modules.push({
        id,
        title: reg.title,
        icon: reg.icon,
        route: reg.route,
        section: section.id,
        order: idx + 1,
        enabled: true,
        platforms: ['web'],
        requiredFlags: [],
      });
    });
  }
  return {
    theme: null,            // null = leave the user's local theme untouched
    version: 'default',
    sections: DEFAULT_SECTIONS.map((s) => ({ id: s.id, label: s.label, order: s.order })),
    modules,
    dashboardLayout: [],
  };
}

export const DEFAULT_CONFIG = buildDefaultConfig();
