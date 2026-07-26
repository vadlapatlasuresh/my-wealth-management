-- Order-to-Cash, Phase 1.9 — configurable dunning (automated payment reminders).
--
-- Per-business settings define WHEN to remind, as day offsets relative to an invoice's due
-- date (negative = before, 0 = on the due date, positive = overdue). A daily job emails/texts
-- the customer at each configured offset and logs it so a reminder never fires twice.
CREATE TABLE business_reminder_settings (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,       -- opt-in
    channel VARCHAR(8) NOT NULL DEFAULT 'AUTO',    -- AUTO | EMAIL | SMS
    -- Comma-separated day offsets vs. due date, e.g. "-3,0,7".
    offsets VARCHAR(120) NOT NULL DEFAULT '-3,0,7',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_biz_reminder_settings_business
        FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE,
    CONSTRAINT uq_biz_reminder_settings UNIQUE (business_id)
);
CREATE INDEX idx_biz_reminder_settings_enabled ON business_reminder_settings (enabled);

-- One row per (invoice, offset) actually sent — the idempotency guard + an audit trail.
CREATE TABLE business_invoice_reminders (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    offset_days INT NOT NULL,
    channel VARCHAR(8) NOT NULL,          -- EMAIL | SMS
    delivery_status VARCHAR(16),          -- SENT | NO_PROVIDER | FAILED | DISABLED
    sent_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_biz_invoice_reminder_invoice
        FOREIGN KEY (invoice_id) REFERENCES business_invoices (id) ON DELETE CASCADE,
    CONSTRAINT uq_biz_invoice_reminder UNIQUE (invoice_id, offset_days)
);
CREATE INDEX idx_biz_invoice_reminder_invoice ON business_invoice_reminders (invoice_id);
