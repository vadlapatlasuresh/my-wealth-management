-- ============================================================
--  db-init.sql — create one schema per service in a Postgres database.
--  Run ONCE per environment (per Neon branch) BEFORE the first deploy.
--  The compose .env.prod points each service at its schema via
--  ?currentSchema=<schema>; Flyway then creates its tables inside it.
--
--  Neon: open the branch's SQL editor (or psql) and run this whole file.
--  psql:  psql "$DATABASE_URL" -f deploy/db-init.sql
--
--  If you prefer a DB-per-service instead of schema-per-service, skip this
--  and create separate databases; point each *_DATABASE_URL at its own DB.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS aggregation;
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS real_estate;
CREATE SCHEMA IF NOT EXISTS business;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS payments;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE SCHEMA IF NOT EXISTS platform_config;
CREATE SCHEMA IF NOT EXISTS audit;

-- Optional: a least-privilege app role (recommended over the Neon owner role).
-- Replace 'CHANGE_ME' and grant on each schema.
-- CREATE ROLE wealth_app LOGIN PASSWORD 'CHANGE_ME';
-- GRANT USAGE, CREATE ON SCHEMA
--   auth, aggregation, core, real_estate, business, ai, payments, notifications, platform_config, audit
--   TO wealth_app;
