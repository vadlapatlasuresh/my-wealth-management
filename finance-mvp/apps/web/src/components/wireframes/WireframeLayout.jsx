import React from "react";

export default function WireframeLayout({ title, subtitle, children, actions }) {
  return (
    <div className="wireframe-layout">
      <div className="wireframe-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <div className="muted">{subtitle}</div>}
        </div>
        {actions && <div className="wireframe-actions">{actions}</div>}
      </div>
      <div className="wireframe-body">{children}</div>
    </div>
  );
}

