-- Health-monitor alert log: one row per service UP<->DOWN transition. This is the
-- queryable audit trail of outages/recoveries that drives ops alerts.
CREATE TABLE system_health_event (
    id           BIGSERIAL PRIMARY KEY,
    service_name VARCHAR(60)  NOT NULL,
    status       VARCHAR(10)  NOT NULL,
    detail       VARCHAR(500),
    created_at   TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_system_health_event_created ON system_health_event (created_at DESC);
