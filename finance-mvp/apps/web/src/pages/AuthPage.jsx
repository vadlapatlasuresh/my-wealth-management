export default function AuthPage({ authMode, setAuthMode, authForm, setAuthForm, error, onSubmit }) {
  return (
    <div className="auth-wrap">
      <div className="auth-brand">
        <span className="brand-mark lg">TV</span>
        <h1>TerraVest</h1>
        <p>Your finances, investments, and plan — in one place.</p>
      </div>
      <div className="card auth-card">
        <h2>{authMode === "login" ? "Sign in" : "Create account"}</h2>
        <p className="auth-hint">Demo: demo@finance.app / Demo@1234</p>
        {error && <p className="error">{error}</p>}
        <form onSubmit={onSubmit} className="form">
          <label>
            Email
            <input
              type="email"
              value={authForm.email}
              onChange={(e) => setAuthForm((p) => ({ ...p, email: e.target.value }))}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={authForm.password}
              onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))}
              required
            />
          </label>
          <button type="submit" className="btn-primary">
            {authMode === "login" ? "Sign in" : "Register"}
          </button>
        </form>
        <button
          type="button"
          className="link-button"
          onClick={() => setAuthMode((prev) => (prev === "login" ? "register" : "login"))}
        >
          {authMode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
