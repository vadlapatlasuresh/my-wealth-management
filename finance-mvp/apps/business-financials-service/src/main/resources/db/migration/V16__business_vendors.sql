-- Per-business vendor metadata overlay: status, contract-renewal date, and notes,
-- keyed by (user, business, vendor_name). Vendor SPEND is computed from the ledger;
-- this table only stores the user's overlay. Backs the Vendors card on MyBusinessPage.
CREATE TABLE business_vendors (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    vendor_name VARCHAR(200) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    renewal_date DATE,
    notes VARCHAR(2000),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_vendor_user_biz_name UNIQUE (user_id, business_id, vendor_name)
);
CREATE INDEX idx_vendor_user_biz ON business_vendors (user_id, business_id);
