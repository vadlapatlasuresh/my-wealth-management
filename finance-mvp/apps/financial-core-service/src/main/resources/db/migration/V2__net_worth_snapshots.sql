-- Daily net-worth history so the chart series and 30-day change are computed
-- from REAL persisted values instead of a synthetic curve. One row per user/day.
CREATE TABLE net_worth_snapshots (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    snapshot_date DATE NOT NULL,
    total DECIMAL(19, 4) NOT NULL,
    cash DECIMAL(19, 4) NOT NULL DEFAULT 0,
    investments DECIMAL(19, 4) NOT NULL DEFAULT 0,
    credit_cards DECIMAL(19, 4) NOT NULL DEFAULT 0,
    loans DECIMAL(19, 4) NOT NULL DEFAULT 0,
    real_estate_value DECIMAL(19, 4) NOT NULL DEFAULT 0,
    real_estate_equity DECIMAL(19, 4) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, snapshot_date)
);

CREATE INDEX idx_nws_user_date ON net_worth_snapshots (user_id, snapshot_date);
