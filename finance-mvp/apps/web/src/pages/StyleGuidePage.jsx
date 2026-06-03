import React from 'react';

export default function StyleGuidePage() {
  return (
    <div id="page-styleguide" className="page active">
      <div className="page-header">
        <div><div className="page-title">TerraVest Style Guide</div><div className="page-subtitle">Design tokens, typography, components</div></div>
      </div>

      {/* Color Palette */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="section-title">Color palette</div>

        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Brand</div>
          <div className="sg-swatch-row">
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#1A4D3B' }}></div><div className="sg-color-label">Forest<br />#1A4D3B</div></div>
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#2D6B52' }}></div><div className="sg-color-label">Forest Mid<br />#2D6B52</div></div>
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#3D8A68' }}></div><div className="sg-color-label">Forest Light<br />#3D8A68</div></div>
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#8AB89A' }}></div><div className="sg-color-label">Sage<br />#8AB89A</div></div>
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#C4DDD0' }}></div><div className="sg-color-label">Sage Light<br />#C4DDD0</div></div>
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#EAF3EE', border: '1px solid #DDE5E1' }}></div><div className="sg-color-label">Sage Pale<br />#EAF3EE</div></div>
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#C9973A' }}></div><div className="sg-color-label">Gold<br />#C9973A</div></div>
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#F0C878' }}></div><div className="sg-color-label">Gold Light<br />#F0C878</div></div>
          </div>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Semantic</div>
          <div className="sg-swatch-row">
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#1E7B4B' }}></div><div className="sg-color-label">Positive<br />#1E7B4B</div></div>
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#E6F4EC', border: '1px solid #DDE5E1' }}></div><div className="sg-color-label">Positive BG<br />#E6F4EC</div></div>
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#C0392B' }}></div><div className="sg-color-label">Negative<br />#C0392B</div></div>
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#FDECEA', border: '1px solid #DDE5E1' }}></div><div className="sg-color-label">Negative BG<br />#FDECEA</div></div>
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#B07D1C' }}></div><div className="sg-color-label">Warning<br />#B07D1C</div></div>
          </div>
        </div>

        <div>
          <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Neutrals</div>
          <div className="sg-swatch-row">
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#111D17' }}></div><div className="sg-color-label">Text Primary<br />#111D17</div></div>
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#4A5E54' }}></div><div className="sg-color-label">Text Secondary<br />#4A5E54</div></div>
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#7A9086' }}></div><div className="sg-color-label">Text Muted<br />#7A9086</div></div>
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#F4F6F5', border: '1px solid #DDE5E1' }}></div><div className="sg-color-label">Page BG<br />#F4F6F5</div></div>
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#FFFFFF', border: '1px solid #DDE5E1' }}></div><div className="sg-color-label">White<br />#FFFFFF</div></div>
            <div className="sg-swatch"><div className="sg-color-box" style={{ background: '#DDE5E1' }}></div><div className="sg-color-label">Border<br />#DDE5E1</div></div>
          </div>
        </div>
      </div>

      {/* Typography */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="section-title">Typography</div>
        <div className="sg-type-row">
          <div>
            <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>Display — DM Serif Display</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '36px', color: 'var(--tv-text-primary)' }}>Page Heading 36px</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', color: 'var(--tv-text-primary)' }}>Section Title 26px</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', color: 'var(--tv-forest)' }}>$263,820 — KPI value 22px</div>
          </div>
          <hr className="divider" />
          <div>
            <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>Body — DM Sans</div>
            <div style={{ fontSize: '16px', fontWeight: '400' }}>Body text 16px / 400 — Regular reading text used in descriptions and paragraphs.</div>
            <div style={{ fontSize: '14px', fontWeight: '500', marginTop: '6px' }}>UI label 14px / 500 — Used in table cells, form labels, list items.</div>
            <div style={{ fontSize: '13px', color: 'var(--tv-text-muted)', marginTop: '6px' }}>Subtext 13px / 400 — Secondary metadata, captions, helper text.</div>
            <div style={{ fontSize: '11.5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tv-text-muted)', marginTop: '6px' }}>CARD LABEL 11.5px / 600 UPPERCASE</div>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="section-title">Buttons</div>
        <div className="sg-component-row">
          <button className="btn btn-primary"><i className="ti ti-check"></i> Primary</button>
          <button className="btn btn-secondary"><i className="ti ti-edit"></i> Secondary</button>
          <button className="btn btn-gold"><i className="ti ti-star"></i> Gold accent</button>
          <button className="btn btn-danger"><i className="ti ti-trash"></i> Danger</button>
          <button className="btn btn-primary btn-sm">Small primary</button>
          <button className="btn btn-secondary btn-sm">Small secondary</button>
        </div>
      </div>

      {/* Badges */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="section-title">Badges &amp; Indicators</div>
        <div className="sg-component-row">
          <span className="badge badge-green"><i className="ti ti-check"></i> Positive</span>
          <span className="badge badge-red"><i className="ti ti-x"></i> Negative</span>
          <span className="badge badge-amber"><i className="ti ti-alert-triangle"></i> Warning</span>
          <span className="badge badge-forest">Core Plus</span>
          <span className="badge badge-gold"><i className="ti ti-star"></i> +125 pts</span>
          <span className="badge badge-gray">Neutral</span>
        </div>
      </div>

      {/* Form */}
      <div className="card" style={{ marginBottom: '20px', maxWidth: '480px' }}>
        <div className="section-title">Form elements</div>
        <div className="form-group">
          <label className="form-label">Account name</label>
          <input type="text" className="form-input" placeholder="Chase Checking ···· 9921" />
        </div>
        <div className="form-group">
          <label className="form-label">Category</label>
          <select className="form-select"><option>Groceries</option><option>Dining</option><option>Utilities</option></select>
        </div>
        <button className="btn btn-primary">Save Changes</button>
      </div>

      {/* Spacing & Shadows */}
      <div className="card">
        <div className="section-title">Spacing &amp; Radius tokens</div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px' }}>
          <div style={{ textAlign: 'center' }}><div style={{ width: '24px', height: '24px', background: 'var(--tv-sage)', borderRadius: '6px', margin: '0 auto 6px' }}></div>radius-sm: 6px</div>
          <div style={{ textAlign: 'center' }}><div style={{ width: '40px', height: '40px', background: 'var(--tv-sage)', borderRadius: '10px', margin: '0 auto 6px' }}></div>radius-md: 10px</div>
          <div style={{ textAlign: 'center' }}><div style={{ width: '60px', height: '40px', background: 'var(--tv-sage)', borderRadius: '16px', margin: '0 auto 6px' }}></div>radius-lg: 16px</div>
          <div style={{ textAlign: 'center' }}><div style={{ width: '80px', height: '40px', background: 'var(--tv-sage)', borderRadius: '24px', margin: '0 auto 6px' }}></div>radius-xl: 24px</div>
        </div>
      </div>
    </div>
  );
}
