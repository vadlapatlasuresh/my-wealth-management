import React from 'react';

/* moduleRegistry.js
   Single source of truth mapping each module `id` -> React page component +
   default metadata. Components are React.lazy so each module code-splits.

   The remote config service may reorder/enable/disable/hide modules, but it can
   only reference ids that exist here. Anything the remote config asks for that
   we don't know about is ignored; if the remote config is unavailable we fall
   back to DEFAULT_SECTIONS + DEFAULT_MODULES (the current hardcoded nav).
*/

// Lazy page components (code-split per module).
const HomePage        = React.lazy(() => import('../pages/HomePage'));
const AccountsPage    = React.lazy(() => import('../pages/AccountsPage'));
const TransactionsPage = React.lazy(() => import('../pages/TransactionsPage'));
const PlanPage        = React.lazy(() => import('../pages/PlanPage'));
const BillPayPage     = React.lazy(() => import('../pages/BillPayPage'));
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

/* Section ids used to group modules in the sidebar. */
export const SECTION_FINANCE = 'finance';
export const SECTION_REALESTATE = 'realestate';
export const SECTION_SETTINGS = 'settings';

/* Default sidebar sections, in display order. */
export const DEFAULT_SECTIONS = [
  { id: SECTION_FINANCE,    label: 'Finance',     order: 1 },
  { id: SECTION_REALESTATE, label: 'Real Estate', order: 2 },
  { id: SECTION_SETTINGS,   label: 'Settings',    order: 3 },
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
  home: {
    id: 'home', title: 'Home', icon: 'ti ti-layout-dashboard',
    route: '/', section: SECTION_FINANCE, defaultOrder: 1,
    component: HomePage, inNavByDefault: true,
  },
  accounts: {
    id: 'accounts', title: 'Accounts', icon: 'ti ti-wallet',
    route: '/accounts', section: SECTION_FINANCE, defaultOrder: 2,
    component: AccountsPage, inNavByDefault: true,
  },
  transactions: {
    id: 'transactions', title: 'Transactions', icon: 'ti ti-arrows-exchange-2',
    route: '/transactions', section: SECTION_FINANCE, defaultOrder: 3,
    component: TransactionsPage, inNavByDefault: true,
  },
  budget: {
    id: 'budget', title: 'Budgets', icon: 'ti ti-chart-pie',
    route: '/budget', section: SECTION_FINANCE, defaultOrder: 4,
    component: PlanPage, inNavByDefault: true,
  },
  billpay: {
    id: 'billpay', title: 'Pay Bills', icon: 'ti ti-receipt',
    route: '/billpay', section: SECTION_FINANCE, defaultOrder: 5,
    component: BillPayPage, inNavByDefault: true, badge: 'billpay',
  },
  debt: {
    id: 'debt', title: 'Debt Lab', icon: 'ti ti-trending-down',
    route: '/debt', section: SECTION_FINANCE, defaultOrder: 6,
    component: PlanPage, inNavByDefault: true,
  },
  invest: {
    id: 'invest', title: 'Investments', icon: 'ti ti-chart-line',
    route: '/invest', section: SECTION_FINANCE, defaultOrder: 7,
    component: InvestPage, inNavByDefault: true,
  },
  mybusiness: {
    id: 'mybusiness', title: 'My Business', icon: 'ti ti-briefcase',
    route: '/mybusiness', section: SECTION_FINANCE, defaultOrder: 8,
    component: MyBusinessPage, inNavByDefault: true,
  },
  'ai-assistant': {
    id: 'ai-assistant', title: 'AI Assistant', icon: 'ti ti-sparkles',
    route: '/ai-assistant', section: SECTION_FINANCE, defaultOrder: 9,
    component: AIAssistantPage, inNavByDefault: true,
  },
  calculators: {
    id: 'calculators', title: 'Calculators', icon: 'ti ti-calculator',
    route: '/calculators', section: SECTION_FINANCE, defaultOrder: 10,
    component: CalculatorsPage, inNavByDefault: true,
  },
  goals: {
    id: 'goals', title: 'Goals', icon: 'ti ti-target',
    route: '/goals', section: SECTION_FINANCE, defaultOrder: 11,
    component: GoalsPage, inNavByDefault: true,
  },
  tax: {
    id: 'tax', title: 'Taxes', icon: 'ti ti-receipt-tax',
    route: '/tax', section: SECTION_FINANCE, defaultOrder: 12,
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
  flowmap: {
    id: 'flowmap', title: 'UI Flow Map', icon: 'ti ti-git-merge',
    route: '/flowmap', section: null, defaultOrder: 0,
    component: UIFlowMapPage, inNavByDefault: false,
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
  [SECTION_FINANCE]:    ['home', 'accounts', 'transactions', 'budget', 'billpay', 'debt', 'invest', 'mybusiness', 'ai-assistant', 'calculators', 'goals', 'tax'],
  [SECTION_REALESTATE]: ['realestate', 'dealroom', 'fractional'],
  [SECTION_SETTINGS]:   ['documents', 'security', 'messages', 'settings', 'subscription'],
};

/* Flat ordered list of every default-nav module id, in sidebar order. */
export const DEFAULT_MODULE_ORDER = [
  ...DEFAULT_MODULES[SECTION_FINANCE],
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
