const MODULES = [
  { title: "Understanding net worth", duration: "8 min", level: "Beginner" },
  { title: "Credit utilization basics", duration: "6 min", level: "Beginner" },
  { title: "Debt avalanche vs snowball", duration: "12 min", level: "Intermediate" },
  { title: "Land investing fundamentals", duration: "15 min", level: "Advanced" }
];

export default function LearnPage() {
  return (
    <>
      <header className="page-header">
        <h1>Learn</h1>
        <p className="muted">Financial education tailored to your goals</p>
      </header>
      <div className="learn-grid">
        {MODULES.map((m) => (
          <article key={m.title} className="card learn-card">
            <span className="level-pill">{m.level}</span>
            <h3>{m.title}</h3>
            <p className="muted">{m.duration}</p>
            <button type="button" className="btn-secondary btn-sm">
              Start module
            </button>
          </article>
        ))}
      </div>
    </>
  );
}
