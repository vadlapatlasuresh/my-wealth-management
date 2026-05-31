export default function AIRail({ insights = [] }) {
  const mapCls = (s) => {
    if (s === "actionable") return "actionable";
    if (s === "warning") return "warning";
    return "informational";
  };

  return (
    <>
      <div className="rail-header">
        <h3>AI Coach</h3>
        <span className="rail-sub">{insights.length} priorities today</span>
      </div>

      <div className="rail-insights">
        {insights.slice(0, 3).map((item) => (
          <article key={item.id} className="insight-card">
            <span className={`badge ${mapCls(item.severity)}`}>{item.severity}</span>
            <h4>{item.title}</h4>
            <p>{item.reason}</p>
            <small>{item.suggestedAction || item.suggested_action}</small>
            <div style={{ marginTop: 8 }}>
              <button className="btn-primary btn-sm" style={{ marginRight: 8 }}>{item.actionLabel || 'Take action'}</button>
              <button className="btn-ghost btn-sm">Dismiss</button>
            </div>
          </article>
        ))}
        {insights.length === 0 && (
          <p className="muted">Link accounts to unlock personalized insights.</p>
        )}
      </div>

      <div className="rail-chat">
        <p className="chat-label">Ask TerraVest</p>
        <div className="chat-bubble user">How can I lower card utilization this month?</div>
        <div className="chat-bubble assistant">
          Based on your May transactions, paying $600 to your Amex card before the 10th would
          bring utilization under 15%.
          <span className="citation">Based on May transactions</span>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <button className="btn-ghost">View all insights</button>
      </div>

      <p className="disclaimer">
        Educational guidance only — not individualized financial advice.
      </p>
    </>
  );
}
