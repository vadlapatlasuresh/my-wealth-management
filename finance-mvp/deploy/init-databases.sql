-- Runs once on first init of the self-hosted Postgres container (mounted into
-- /docker-entrypoint-initdb.d). Creates one database per service — db-per-service,
-- so each service owns its own Flyway history and there are no cross-service
-- migration/table collisions. Owned by POSTGRES_USER (the connecting superuser).
CREATE DATABASE authdb;
CREATE DATABASE aggdb;
CREATE DATABASE coredb;
CREATE DATABASE redb;
CREATE DATABASE bizdb;
CREATE DATABASE aidb;
CREATE DATABASE paydb;
CREATE DATABASE notifdb;
CREATE DATABASE configdb;
CREATE DATABASE auditdb;
CREATE DATABASE documentsdb;
CREATE DATABASE secretsdb;
