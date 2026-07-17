-- The finance.* permission keys, arriving WITH the endpoints that honour them (payment-service V5).
--
-- V9 deliberately shipped no finance keys: a permission that gates nothing reads as a control on an
-- access review while granting everyone the same access. Now there is a money surface to gate.

INSERT INTO ops_permissions (permission_key, category, description) VALUES
  ('finance.ledger.view',        'MONEY', 'Read a customer''s money history: charges, refunds, credits, adjustments, disputes'),
  ('finance.adjustment.create',  'MONEY', 'Propose a refund, credit, goodwill payment or manual adjustment. Requires a reason code and note'),
  ('finance.adjustment.approve', 'MONEY', 'Approve or reject someone else''s proposed money movement. Never your own'),
  ('finance.dispute.manage',     'MONEY', 'Work disputes and chargebacks: place holds, release them, accept liability'),
  ('finance.anomaly.review',     'MONEY', 'Review and decide flagged financial anomalies');

-- Finance ops: the MAKER. Creates money movements, works disputes — and cannot approve.
INSERT INTO ops_role_permissions (role_key, permission_key) VALUES
  ('OPS_FINANCE', 'finance.ledger.view'),
  ('OPS_FINANCE', 'finance.adjustment.create'),
  ('OPS_FINANCE', 'finance.dispute.manage');

-- Supervisor: the CHECKER. Approves money movements and reviews anomalies — and cannot create.
-- Splitting these across roles is the point: one compromised agent cannot move money alone.
INSERT INTO ops_role_permissions (role_key, permission_key) VALUES
  ('OPS_SUPERVISOR', 'finance.ledger.view'),
  ('OPS_SUPERVISOR', 'finance.adjustment.approve'),
  ('OPS_SUPERVISOR', 'finance.anomaly.review');

-- Compliance stays read-only by construction: the money history, and nothing that moves it.
INSERT INTO ops_role_permissions (role_key, permission_key) VALUES
  ('OPS_COMPLIANCE', 'finance.ledger.view');

-- Ops admin holds both create and approve. That is NOT a hole in four-eyes: the constraint is
-- per-adjustment (decided_by <> requested_by, enforced in the DB), so an admin still cannot approve
-- their own request — another admin has to. It keeps a two-admin team able to operate without
-- inventing a role that exists only to click approve.
INSERT INTO ops_role_permissions (role_key, permission_key) VALUES
  ('OPS_ADMIN', 'finance.ledger.view'),
  ('OPS_ADMIN', 'finance.adjustment.create'),
  ('OPS_ADMIN', 'finance.adjustment.approve'),
  ('OPS_ADMIN', 'finance.dispute.manage'),
  ('OPS_ADMIN', 'finance.anomaly.review');

-- OPS_AGENT gets nothing here. Front-line support does not move money; they escalate to finance.
