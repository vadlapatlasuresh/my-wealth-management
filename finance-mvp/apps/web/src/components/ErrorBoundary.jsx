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
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Unhandled UI error:", error, info && info.componentStack);
    // window.Sentry && window.Sentry.captureException && window.Sentry.captureException(error);
  }

  handleReload = () => {
    this.setState({ hasError: false });
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
        <button
          onClick={this.handleReload}
          style={{
            marginTop: "0.5rem",
            padding: "0.6rem 1.25rem",
            border: "none",
            borderRadius: "0.5rem",
            background: "#047857",
            color: "#fff",
            fontSize: "1rem",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
