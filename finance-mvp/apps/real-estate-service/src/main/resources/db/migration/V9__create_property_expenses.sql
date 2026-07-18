-- Actual, dated expenses logged against a property (one row = one expense).
-- Distinct from the monthly carrying-cost ESTIMATES on the properties row (V8):
-- these are real, categorized transactions used for per-property tracking and taxes.
-- Ownership is enforced app-side via user_id (same pattern as the properties table);
-- user_id is denormalized so we can authorize and purge without a join.
CREATE TABLE property_expenses (
    id              BIGSERIAL PRIMARY KEY,
    property_id     BIGINT NOT NULL,
    user_id         BIGINT NOT NULL,
    expense_date    DATE NOT NULL,
    category        VARCHAR(60) NOT NULL,
    vendor          VARCHAR(200),
    description     VARCHAR(500),
    amount          DECIMAL(19, 4) NOT NULL,
    payment_method  VARCHAR(40),
    receipt_ref     VARCHAR(120),          -- blank => "missing receipt" flag in the UI
    hours           DECIMAL(9, 2),         -- optional labor/time tracking
    hourly_rate     DECIMAL(19, 4),        -- optional; labor cost = hours * hourly_rate
    notes           VARCHAR(1000),
    created_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_property_expenses_property ON property_expenses (property_id);
CREATE INDEX idx_property_expenses_user ON property_expenses (user_id);
