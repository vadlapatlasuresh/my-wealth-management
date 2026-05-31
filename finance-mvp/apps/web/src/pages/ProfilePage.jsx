export default function ProfilePage({ user, accounts, onLogout }) {
  return (
    <>
      <header className="page-header">
        <h1>Profile</h1>
        <p className="muted">Account and security settings</p>
      </header>
      <div className="card">
        <h3>Account</h3>
        <p>
          <strong>Email</strong> {user?.email}
        </p>
        <p>
          <strong>Linked accounts</strong> {accounts.length}
        </p>
      </div>
      <div className="card">
        <h3>Security</h3>
        <p className="muted">MFA and session management coming in a future release.</p>
        <button type="button" className="btn-danger" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </>
  );
}
