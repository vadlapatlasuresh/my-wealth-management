import React from "react";

/**
 * Top-level error boundary: catches render/runtime errors anywhere below it and shows a
 * friendly recovery screen instead of a blank white page. Logs to the console (and to
 * Sentry once that's wired). Styles are inline so the fallback renders even if app CSS
 * failed to load.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, stack: "", copied: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    const stack = (info && info.componentStack) || "";
    this.setState({ error, stack });
    // eslint-disable-next-line no-console
    console.error("Unhandled UI error:", error, stack);
    // window.Sentry && window.Sentry.captureException && window.Sentry.captureException(error);
  }

  details() {
    const e = this.state.error;
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    return [
      `Page: ${path}`,
      `Error: ${(e && (e.message || String(e))) || "unknown"}`,
      e && e.stack ? `\n${e.stack}` : "",
      this.state.stack ? `\nComponent stack:${this.state.stack}` : "",
    ].join("\n");
  }

  handleCopy = () => {
    try {
      navigator.clipboard.writeText(this.details());
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch { /* clipboard unavailable */ }
  };

  handleReload = () => {
    this.setState({ hasError: false, error: null, stack: "" });
    window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#1f2937",
          background: "#f9fafb",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Something went wrong</h1>
        <p style={{ margin: 0, maxWidth: "28rem", color: "#4b5563" }}>
          An unexpected error occurred. Your data is safe — please reload and try again.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
          <button
            onClick={this.handleReload}
            style={{ padding: "0.6rem 1.25rem", border: "none", borderRadius: "0.5rem", background: "#047857", color: "#fff", fontSize: "1rem", cursor: "pointer" }}
          >
            Reload
          </button>
          <button
            onClick={this.handleCopy}
            style={{ padding: "0.6rem 1.25rem", border: "1px solid #d1d5db", borderRadius: "0.5rem", background: "#fff", color: "#374151", fontSize: "1rem", cursor: "pointer" }}
          >
            {this.state.copied ? "Copied ✓" : "Copy error details"}
          </button>
        </div>
        {this.state.error && (
          <details style={{ maxWidth: "40rem", width: "100%", marginTop: "0.5rem", textAlign: "left" }}>
            <summary style={{ cursor: "pointer", color: "#6b7280", fontSize: "0.85rem" }}>Technical details (for support)</summary>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.72rem", color: "#6b7280", background: "#f3f4f6", padding: "0.75rem", borderRadius: "0.4rem", marginTop: "0.5rem", maxHeight: "16rem", overflow: "auto" }}>
              {this.details()}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
