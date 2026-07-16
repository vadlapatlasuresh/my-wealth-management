-- Ops RBAC: roles are DB-editable bundles of fine-grained permissions.
--
-- Phase 1 gated the ops surface on coarse roles checked by URL path matchers. That cannot express
-- "an agent may open a customer record but not unmask their SSN", which is exactly the kind of
-- rule this portal needs. Permissions are now the unit of enforcement (@PreAuthorize per endpoint)
-- and a role is just a named bundle of them — retunable here without a deploy.
--
-- NOTE: column is `permission_key`/`role_key`, never `key` — KEY is a reserved word in H2, which
-- dev/test run in Postgres-compat mode against these same migrations.

-- The catalog. Seeded from the OpsPermission enum, which stays the source of truth: a row here
-- without a matching enum constant gates nothing, because no endpoint checks it.
CREATE TABLE ops_permissions (
    permission_key VARCHAR(64) PRIMARY KEY,
    category       VARCHAR(32)  NOT NULL,   -- CUSTOMER | OVERSIGHT | PLATFORM
    description    VARCHAR(255) NOT NULL
);

CREATE TABLE ops_roles (
    role_key    VARCHAR(64) PRIMARY KEY,
    name        VARCHAR(64) NOT NULL,
    description VARCHAR(255),
    -- Built-in roles ship with the product and cannot be deleted (their permissions CAN be
    -- retuned). Custom roles created by an ops admin are builtin=false.
    builtin     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE ops_role_permissions (
    role_key       VARCHAR(64) NOT NULL,
    permission_key VARCHAR(64) NOT NULL,
    PRIMARY KEY (role_key, permission_key),
    FOREIGN KEY (role_key)       REFERENCES ops_roles (role_key)             ON DELETE CASCADE,
    FOREIGN KEY (permission_key) REFERENCES ops_permissions (permission_key) ON DELETE CASCADE
);

-- V7 named this column `roles` (the JPA @ElementCollection default) but it holds exactly one role
-- key per row. Rename for clarity and add the FK, so a user can never be assigned a role that
-- doesn't exist.
ALTER TABLE ops_user_roles RENAME COLUMN roles TO role_key;

-- ---- Seed: the permission catalog -------------------------------------------------------
INSERT INTO ops_permissions (permission_key, category, description) VALUES
  ('customer.search',     'CUSTOMER',  'Search for customers by name, email, phone or id'),
  ('customer.view',       'CUSTOMER',  'Open a customer record: profile, activity timeline and issues'),
  ('customer.data.view',  'CUSTOMER',  'Read a customer''s financial data read-only: accounts, transactions, payments, deals'),
  ('customer.pii.reveal', 'CUSTOMER',  'Unmask a customer''s SSN/EIN last-4 and full phone number. Requires a reason; always audited'),
  ('audit.query',         'OVERSIGHT', 'Query the audit trail across customers, including who accessed whom'),
  ('ops.analytics.view',  'OVERSIGHT', 'View operator analytics and the system health/alert feed'),
  ('cpa.moderate',        'PLATFORM',  'Approve, reject or verify CPA marketplace listings'),
  ('ops.user.manage',     'PLATFORM',  'Create and deactivate ops accounts and assign their roles');

-- ---- Seed: the built-in roles ------------------------------------------------------------
INSERT INTO ops_roles (role_key, name, description, builtin) VALUES
  ('OPS_AGENT',      'Support Agent', 'Front-line support: find a customer and read their record. No PII unmasking, no oversight tools.', TRUE),
  ('OPS_SUPERVISOR', 'Supervisor',    'Agent, plus PII reveal, the audit trail and operator analytics. Approves money movements in Phase 5.', TRUE),
  ('OPS_FINANCE',    'Finance Ops',   'Customer records today; the ledger, refunds/credits/adjustments and disputes land in Phase 5.', TRUE),
  ('OPS_COMPLIANCE', 'Compliance',    'Read-only oversight: sees everything including the audit trail, changes nothing.', TRUE),
  ('OPS_ADMIN',      'Ops Admin',     'Everything, including managing ops accounts and their roles.', TRUE);

-- ---- Seed: who gets what (the access matrix) ---------------------------------------------
-- Front-line agents: find and read. Deliberately NOT customer.pii.reveal — the common case
-- (a caller asking about a failed payment) never needs an SSN, so unmasking is a supervisor
-- action that leaves a reason behind rather than an ambient capability.
INSERT INTO ops_role_permissions (role_key, permission_key) VALUES
  ('OPS_AGENT', 'customer.search'),
  ('OPS_AGENT', 'customer.view'),
  ('OPS_AGENT', 'customer.data.view');

INSERT INTO ops_role_permissions (role_key, permission_key) VALUES
  ('OPS_SUPERVISOR', 'customer.search'),
  ('OPS_SUPERVISOR', 'customer.view'),
  ('OPS_SUPERVISOR', 'customer.data.view'),
  ('OPS_SUPERVISOR', 'customer.pii.reveal'),
  ('OPS_SUPERVISOR', 'audit.query'),
  ('OPS_SUPERVISOR', 'ops.analytics.view'),
  ('OPS_SUPERVISOR', 'cpa.moderate');

-- Finance ops looks thin today because there is no money surface to gate yet. That is honest:
-- Phase 5 adds finance.ledger.view / finance.adjustment.create / finance.dispute.manage here,
-- and deliberately NOT finance.adjustment.approve — the maker cannot be the checker.
INSERT INTO ops_role_permissions (role_key, permission_key) VALUES
  ('OPS_FINANCE', 'customer.search'),
  ('OPS_FINANCE', 'customer.view'),
  ('OPS_FINANCE', 'customer.data.view');

-- Compliance is read-only by construction: it holds no *.write / *.manage / *.moderate key.
INSERT INTO ops_role_permissions (role_key, permission_key) VALUES
  ('OPS_COMPLIANCE', 'customer.search'),
  ('OPS_COMPLIANCE', 'customer.view'),
  ('OPS_COMPLIANCE', 'customer.data.view'),
  ('OPS_COMPLIANCE', 'customer.pii.reveal'),
  ('OPS_COMPLIANCE', 'audit.query'),
  ('OPS_COMPLIANCE', 'ops.analytics.view');

INSERT INTO ops_role_permissions (role_key, permission_key) VALUES
  ('OPS_ADMIN', 'customer.search'),
  ('OPS_ADMIN', 'customer.view'),
  ('OPS_ADMIN', 'customer.data.view'),
  ('OPS_ADMIN', 'customer.pii.reveal'),
  ('OPS_ADMIN', 'audit.query'),
  ('OPS_ADMIN', 'ops.analytics.view'),
  ('OPS_ADMIN', 'cpa.moderate'),
  ('OPS_ADMIN', 'ops.user.manage');

-- Referential integrity for role assignment. Safe because every value written so far is a
-- built-in key seeded above (OpsBootstrap only ever assigns OPS_ADMIN).
ALTER TABLE ops_user_roles
    ADD CONSTRAINT fk_ops_user_roles_role FOREIGN KEY (role_key) REFERENCES ops_roles (role_key);
