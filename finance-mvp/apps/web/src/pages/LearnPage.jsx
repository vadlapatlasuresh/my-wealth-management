import React, { useState } from 'react';

/* Course catalog for the Learn page. Each module carries its own topic icon,
   icon color class, level, category and a short description. */
const MODULES = [
  {
    title: 'Understanding net worth',
    duration: '8 min',
    level: 'Beginner',
    category: 'Foundations',
    icon: 'ti ti-scale',
    iconCls: 'icon-forest',
    description: 'Learn what net worth is, how to calculate it, and why it is the single best snapshot of your financial health.',
  },
  {
    title: 'Credit utilization basics',
    duration: '6 min',
    level: 'Beginner',
    category: 'Credit',
    icon: 'ti ti-credit-card',
    iconCls: 'icon-blue',
    description: 'Discover how the balance-to-limit ratio shapes your credit score and simple tactics to keep it healthy.',
  },
  {
    title: 'Debt avalanche vs snowball',
    duration: '12 min',
    level: 'Intermediate',
    category: 'Debt',
    icon: 'ti ti-stack-2',
    iconCls: 'icon-amber',
    description: 'Compare the two most popular payoff strategies and find out which one fits your money and your mindset.',
  },
  {
    title: 'Land investing fundamentals',
    duration: '15 min',
    level: 'Advanced',
    category: 'Real Estate',
    icon: 'ti ti-map-2',
    iconCls: 'icon-green',
    description: 'Understand how to evaluate raw land, zoning, and carrying costs before you commit capital to a parcel.',
  },
  {
    title: 'Building an emergency fund',
    duration: '7 min',
    level: 'Beginner',
    category: 'Savings',
    icon: 'ti ti-umbrella',
    iconCls: 'icon-purple',
    description: 'Set the right target, choose where to park the cash, and automate your way to a real safety net.',
  },
  {
    title: 'Tax-advantaged accounts explained',
    duration: '14 min',
    level: 'Intermediate',
    category: 'Investing',
    icon: 'ti ti-receipt-tax',
    iconCls: 'icon-red',
    description: 'Make sense of 401(k)s, IRAs, and HSAs so you can keep more of what you earn and grow it faster.',
  },
];

/* Map a module level to its badge color class. */
function levelBadge(level) {
  if (level === 'Beginner') return 'badge-green';
  if (level === 'Intermediate') return 'badge-amber';
  return 'badge-red';
}

export default function LearnPage() {
  const [trackProgress, setTrackProgress] = useState(40);
  const startModule = (i) => setProgress((p) => ({ ...p, [i]: Math.max(p[i] || 0, 15) }));

  /* Tracks per-module progress (%) once a learner starts a module. */
  const [progress, setProgress] = useState({});

  /* Start or advance a module. First click jumps to a deterministic % based
     on the module index; subsequent clicks bump it toward 100%. */
  function advanceModule(index) {
    setProgress((prev) => {
      const current = prev[index];
      const next = current == null ? 20 + ((index * 13) % 50) : Math.min(100, current + 20);
      return { ...prev, [index]: next };
    });
  }

  return (
    <div id="page-learn" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Learn</div>
          <div className="page-subtitle">Financial education tailored to your goals</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" title="Start the first course" onClick={() => startModule(0)}>
            <i className="ti ti-books"></i> All courses
          </button>
        </div>
      </div>

      {/* Snapshot of the learner's progress */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label"><i className="ti ti-book-2" style={{ color: 'var(--tv-forest-light)' }}></i> Modules</div>
          <div className="kpi-value">{MODULES.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><i className="ti ti-clock" style={{ color: 'var(--tv-gold)' }}></i> Total Time</div>
          <div className="kpi-value">62 min</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><i className="ti ti-flame" style={{ color: 'var(--tv-warning)' }}></i> Day Streak</div>
          <div className="kpi-value">5</div>
        </div>
      </div>

      {/* Continue-learning featured card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">Continue Learning</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="item-icon icon-forest" style={{ width: 48, height: 48, fontSize: 24 }}>
            <i className="ti ti-route"></i>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="section-title" style={{ marginBottom: 4 }}>Personal Finance Essentials</div>
            <div style={{ fontSize: 13, color: 'var(--tv-text-muted)' }}>
              You are {trackProgress}% through this track — 2 of 5 lessons complete.
            </div>
            <div className="progress-bar" style={{ marginTop: 10 }}>
              <div
                className="progress-fill"
                style={{ width: `${trackProgress}%`, background: 'var(--tv-forest)' }}
              ></div>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={() => setTrackProgress((p) => Math.min(100, p + 20))}>
            <i className="ti ti-player-play"></i> {trackProgress >= 100 ? "Completed" : "Resume"}
          </button>
        </div>
      </div>

      <div className="section-header">
        <div className="section-title" style={{ marginBottom: 0 }}>Course Catalog</div>
      </div>

      {/* Lesson cards */}
      <div className="card-grid">
        {MODULES.map((m, index) => (
          <article key={m.title} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <div className={`item-icon ${m.iconCls}`} style={{ width: 44, height: 44, fontSize: 22 }}>
                <i className={m.icon}></i>
              </div>
              <span className={`badge ${levelBadge(m.level)}`}>{m.level}</span>
            </div>

            <div className="section-title" style={{ marginBottom: 6 }}>{m.title}</div>
            <p style={{ fontSize: 13, color: 'var(--tv-text-muted)', lineHeight: 1.5, flex: 1 }}>
              {m.description}
            </p>

            <hr className="divider" />

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--tv-text-muted)', marginBottom: 14 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <i className="ti ti-clock"></i> {m.duration}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <i className="ti ti-tag"></i> {m.category}
              </span>
            </div>

            {progress[index] != null ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="badge badge-amber"><i className="ti ti-progress"></i> In progress</span>
                  <span className="num" style={{ fontWeight: 600, fontSize: 12 }}>{progress[index]}%</span>
                </div>
                <div className="progress-bar" style={{ marginBottom: 12 }}>
                  <div className="progress-fill" style={{ width: `${progress[index]}%`, background: 'var(--tv-forest)' }}></div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => advanceModule(index)}
                >
                  <i className="ti ti-player-play"></i> Continue
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => advanceModule(index)}
              >
                <i className="ti ti-player-play"></i> Start module
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
