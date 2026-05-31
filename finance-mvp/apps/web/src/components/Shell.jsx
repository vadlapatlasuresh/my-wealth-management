const NAV = [
  { id: "home", label: "Home" },
  { id: "cash", label: "Cash & cards" },
  { id: "invest", label: "Invest" },
  { id: "realestate", label: "Real estate" },
  { id: "plan", label: "Plan" },
  { id: "learn", label: "Learn" }
];

export default function Shell({
  page,
  onNavigate,
  onPayBill,
  userEmail,
  snapshotTime,
  onRefresh,
  onLogout,
  children,
  rail
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">TV</span>
          <div>
            <strong>TerraVest</strong>
            <small>Personal Finance</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <button type="button" className="btn-primary sidebar-cta" onClick={onPayBill}>
          Pay bill
        </button>

        <div className="sidebar-footer">
          <button type="button" className="nav-item" onClick={() => onNavigate("profile")}>
            Profile
          </button>
        </div>
      </aside>

      <div className="shell-body">
        <header className="topbar">
          <div className="topbar-left">
            <input className="search" placeholder="Search accounts, transactions…" />
          </div>
          <div className="topbar-right">
            {snapshotTime && (
              <span className="sync-pill">Updated {snapshotTime}</span>
            )}
            <span className="user-chip">{userEmail}</span>
            <button type="button" className="btn-secondary" onClick={onRefresh}>
              Refresh
            </button>
            <button type="button" className="btn-ghost" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>

        <div className="content-with-rail">
          <div className="main-content">{children}</div>
          {rail && <aside className="ai-rail">{rail}</aside>}
        </div>
      </div>
    </div>
  );
}
