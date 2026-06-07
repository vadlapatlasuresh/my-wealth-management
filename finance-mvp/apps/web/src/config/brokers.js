/* ==================================================================== *
 * Broker registry — CONFIG-DRIVEN
 * --------------------------------------------------------------------
 * HOW TO ADD A BROKER:
 *   Append a new object to the BROKERS array below — no code changes
 *   needed anywhere else. The Brokers tab in InvestPage.jsx renders the
 *   available-broker grid AND the connect flow entirely from this config.
 *
 * Each entry shape:
 *   {
 *     id:       string   unique slug (used as brokerId on connected accts)
 *     name:     string   display name
 *     color:    string   brand accent hex (tints the avatar/icon chip)
 *     icon:     string   Tabler icon class, e.g. "ti ti-building-bank"
 *     authType: "oauth" | "credentials"   drives which connect UI shows
 *     website:  string   (optional) marketing/login URL, shown in OAuth copy
 *
 *     // Only used when authType === "credentials": declares the login
 *     // fields so the form renders generically from config. Each field:
 *     //   { key, label, type: "text"|"password", required: boolean }
 *     fields?:  Array<{ key, label, type, required }>
 *   }
 *
 * NOTE: This is a demo. We NEVER persist entered credentials/passwords —
 * the connect flow only stores connected metadata (see InvestPage.jsx).
 * ==================================================================== */

export const BROKERS = [
  {
    id: 'fidelity',
    name: 'Fidelity',
    color: '#368727',
    icon: 'ti ti-building-bank',
    authType: 'oauth',
    website: 'https://www.fidelity.com'
  },
  {
    id: 'schwab',
    name: 'Charles Schwab',
    color: '#00a0df',
    icon: 'ti ti-building-bank',
    authType: 'oauth',
    website: 'https://www.schwab.com'
  },
  {
    id: 'robinhood',
    name: 'Robinhood',
    color: '#00c805',
    icon: 'ti ti-feather',
    authType: 'credentials',
    website: 'https://robinhood.com',
    fields: [
      { key: 'username', label: 'Email or username', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true }
    ]
  },
  {
    id: 'vanguard',
    name: 'Vanguard',
    color: '#96151d',
    icon: 'ti ti-shield-check',
    authType: 'oauth',
    website: 'https://www.vanguard.com'
  },
  {
    id: 'etrade',
    name: 'E*TRADE',
    color: '#6633cc',
    icon: 'ti ti-chart-candle',
    authType: 'credentials',
    website: 'https://www.etrade.com',
    fields: [
      { key: 'username', label: 'User ID', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true }
    ]
  },
  {
    id: 'ibkr',
    name: 'Interactive Brokers',
    color: '#d81222',
    icon: 'ti ti-world',
    authType: 'credentials',
    website: 'https://www.interactivebrokers.com',
    fields: [
      { key: 'username', label: 'Username', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true }
    ]
  },
  {
    id: 'merrill',
    name: 'Merrill',
    color: '#0073cf',
    icon: 'ti ti-building-bank',
    authType: 'oauth',
    website: 'https://www.merrilledge.com'
  },
  {
    id: 'webull',
    name: 'Webull',
    color: '#1565ff',
    icon: 'ti ti-trending-up',
    authType: 'credentials',
    website: 'https://www.webull.com',
    fields: [
      { key: 'username', label: 'Email or phone', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true }
    ]
  },
  /* Generic catch-all — lets users add any broker not listed above. */
  {
    id: 'other',
    name: 'Other broker',
    color: '#7a8a7a',
    icon: 'ti ti-circle-dot',
    authType: 'credentials',
    fields: [
      { key: 'name', label: 'Broker name', type: 'text', required: true },
      { key: 'username', label: 'Username', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true }
    ]
  }
];

/* Look up a broker config by id. Returns undefined if not found so callers
   can fall back to sensible defaults (e.g. for legacy seeded accounts). */
export function getBroker(id) {
  return BROKERS.find((b) => b.id === id);
}
