import React, { useState } from 'react';
import { currency } from '../utils/format';

export default function AIAssistantPage({ user }) {
  const [includeBusinessData, setIncludeBusinessData] = useState(true);
  const [includeDebts, setIncludeDebts] = useState(true);
  const [includeInvestments, setIncludeInvestments] = useState(true);
  const [monthlyIncome, setMonthlyIncome] = useState(5000);
  const [monthlyExpenses, setMonthlyExpenses] = useState(3000);
  const [investmentGoals, setInvestmentGoals] = useState(100000);
  const [loading, setLoading] = useState(false);
  const [aiResults, setAiResults] = useState(null);

  const handleGenerateSuggestions = () => {
    setLoading(true);
    setAiResults(null); // Clear previous results
    // Simulate API call
    setTimeout(() => {
      setAiResults({
        debtStrategy: {
          priority: 'High',
          title: 'Accelerate High-Interest Debt Payoff',
          description: 'Focus an additional $200/month on your credit card with 18% APR. This could save you $1,248 in interest and make you debt-free 6 months sooner.',
          progress: 75, // Example progress
          link: '/debt'
        },
        investmentPlan: {
          priority: 'Medium',
          title: 'Diversify Investment Portfolio',
          description: 'Allocate 15% of your new monthly savings ($300) into a diversified low-cost index fund to reach your $100,000 goal faster.',
          progress: 40, // Example progress
          link: '/invest'
        },
        riskManagement: {
          priority: 'Medium',
          title: 'Build Emergency Fund',
          description: 'Increase your emergency fund by $500/month to cover 6 months of living expenses. You currently have 3 months covered.',
          progress: 50, // Example progress
          link: '#'
        }
      });
      setLoading(false);
    }, 2000); // Simulate 2-second loading
  };

  return (
    <div id="page-aiassistant" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">AI Assistant</div>
          <div className="page-subtitle">Your personalized financial planner</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={handleGenerateSuggestions} disabled={loading}>
            {loading ? 'Generating...' : <><i className="ti ti-sparkles"></i> Generate Suggestions</>}
          </button>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: '16px' }}>
        {/* Controls and Inputs */}
        <div className="card">
          <div className="section-title">Your Financial Profile</div>
          <div className="form-group">
            <label className="form-label">Monthly Income</label>
            <input
              type="number"
              className="form-input"
              value={monthlyIncome}
              onChange={(e) => setMonthlyIncome(Number(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Monthly Expenses</label>
            <input
              type="number"
              className="form-input"
              value={monthlyExpenses}
              onChange={(e) => setMonthlyExpenses(Number(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Investment Goals</label>
            <input
              type="number"
              className="form-input"
              value={investmentGoals}
              onChange={(e) => setInvestmentGoals(Number(e.target.value))}
            />
          </div>

          <hr className="divider" />

          <div className="section-title" style={{ marginBottom: '10px' }}>Data Inclusion</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <div className={`tv-checkbox ${includeBusinessData ? 'checked' : ''}`} onClick={() => setIncludeBusinessData(!includeBusinessData)}>
                {includeBusinessData && <i className="ti ti-check"></i>}
              </div>
              <span style={{ fontSize: '14px', color: 'var(--tv-text-secondary)' }}>Include business data</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <div className={`tv-checkbox ${includeDebts ? 'checked' : ''}`} onClick={() => setIncludeDebts(!includeDebts)}>
                {includeDebts && <i className="ti ti-check"></i>}
              </div>
              <span style={{ fontSize: '14px', color: 'var(--tv-text-secondary)' }}>Include debts</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <div className={`tv-checkbox ${includeInvestments ? 'checked' : ''}`} onClick={() => setIncludeInvestments(!includeInvestments)}>
                {includeInvestments && <i className="ti ti-check"></i>}
              </div>
              <span style={{ fontSize: '14px', color: 'var(--tv-text-secondary)' }}>Include investments</span>
            </label>
          </div>
        </div>

        {/* AI Results */}
        <div className="card">
          <div className="section-title">AI Suggestions</div>
          {loading && (
            <div className="empty-state">
              <i className="ti ti-loader ti-spin"></i>
              <p>Generating personalized insights...</p>
            </div>
          )}
          {!loading && !aiResults && (
            <div className="empty-state">
              <i className="ti ti-sparkles"></i>
              <p>Adjust your profile and click "Generate Suggestions" to get started.</p>
            </div>
          )}
          {!loading && aiResults && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Debt Strategy */}
              <div className="card" style={{ background: 'var(--tv-sage-pale)', borderLeft: '4px solid var(--tv-forest)' }}>
                <div className="section-header">
                  <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-trending-down" style={{ color: 'var(--tv-forest)' }}></i> Debt Strategy
                  </div>
                  <span className={`badge badge-${aiResults.debtStrategy.priority === 'High' ? 'red' : aiResults.debtStrategy.priority === 'Medium' ? 'amber' : 'green'}`}>{aiResults.debtStrategy.priority}</span>
                </div>
                <div style={{ fontSize: '13.5px', fontWeight: '600', marginBottom: '8px' }}>{aiResults.debtStrategy.title}</div>
                <p style={{ fontSize: '12.5px', color: 'var(--tv-text-secondary)', marginBottom: '10px' }}>{aiResults.debtStrategy.description}</p>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${aiResults.debtStrategy.progress}%`, background: 'var(--tv-forest)' }}></div>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)', marginTop: '4px' }}>{aiResults.debtStrategy.progress}% towards goal</div>
                <a href={aiResults.debtStrategy.link} style={{ fontSize: '12px', color: 'var(--tv-forest-light)', fontWeight: '500', cursor: 'pointer', display: 'block', marginTop: '10px' }}>View Debt Lab →</a>
              </div>

              {/* Investment Plan */}
              <div className="card" style={{ background: 'var(--tv-sage-pale)', borderLeft: '4px solid var(--tv-gold)' }}>
                <div className="section-header">
                  <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-chart-line" style={{ color: 'var(--tv-gold)' }}></i> Investment Plan
                  </div>
                  <span className={`badge badge-${aiResults.investmentPlan.priority === 'High' ? 'red' : aiResults.investmentPlan.priority === 'Medium' ? 'amber' : 'green'}`}>{aiResults.investmentPlan.priority}</span>
                </div>
                <div style={{ fontSize: '13.5px', fontWeight: '600', marginBottom: '8px' }}>{aiResults.investmentPlan.title}</div>
                <p style={{ fontSize: '12.5px', color: 'var(--tv-text-secondary)', marginBottom: '10px' }}>{aiResults.investmentPlan.description}</p>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${aiResults.investmentPlan.progress}%`, background: 'var(--tv-gold)' }}></div>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)', marginTop: '4px' }}>{aiResults.investmentPlan.progress}% towards goal</div>
                <a href={aiResults.investmentPlan.link} style={{ fontSize: '12px', color: 'var(--tv-forest-light)', fontWeight: '500', cursor: 'pointer', display: 'block', marginTop: '10px' }}>View Investments →</a>
              </div>

              {/* Risk Management */}
              <div className="card" style={{ background: 'var(--tv-sage-pale)', borderLeft: '4px solid var(--tv-positive)' }}>
                <div className="section-header">
                  <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-shield-lock" style={{ color: 'var(--tv-positive)' }}></i> Risk Management
                  </div>
                  <span className={`badge badge-${aiResults.riskManagement.priority === 'High' ? 'red' : aiResults.riskManagement.priority === 'Medium' ? 'amber' : 'green'}`}>{aiResults.riskManagement.priority}</span>
                </div>
                <div style={{ fontSize: '13.5px', fontWeight: '600', marginBottom: '8px' }}>{aiResults.riskManagement.title}</div>
                <p style={{ fontSize: '12.5px', color: 'var(--tv-text-secondary)', marginBottom: '10px' }}>{aiResults.riskManagement.description}</p>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${aiResults.riskManagement.progress}%`, background: 'var(--tv-positive)' }}></div>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)', marginTop: '4px' }}>{aiResults.riskManagement.progress}% towards goal</div>
                <a href={aiResults.riskManagement.link} style={{ fontSize: '12px', color: 'var(--tv-forest-light)', fontWeight: '500', cursor: 'pointer', display: 'block', marginTop: '10px' }}>Learn More →</a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Disclaimer Card */}
      <div className="card" style={{ background: 'var(--tv-warning-bg)', borderLeft: '4px solid var(--tv-warning)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: '24px', color: 'var(--tv-warning)', flexShrink: 0 }}></i>
          <p style={{ fontSize: '12.5px', color: 'var(--tv-warning)', lineHeight: '1.6' }}>
            This AI assistant provides general financial insights for informational purposes only. These suggestions do not constitute financial advice. Please conduct your own research or consult a certified financial advisor before making investment decisions.
          </p>
        </div>
      </div>
    </div>
  );
}