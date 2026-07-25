-- Per-property document vault: links files in the user's Document Center (documents-service)
-- to a property, and optionally to a specific expense. The file itself lives in
-- documents-service (the single source of truth for storage, download auth and CPA
-- sharing) — here we only store the pointer (document_id) plus a cached name/type so the
-- vault can render and the tax export can reference each file without a second call.
--
-- expense_id is nullable: a null row is a property-level document (1098, insurance, HOA,
-- tax assessment); a set row is a receipt/image attached to one expense.
-- Ownership is enforced app-side via user_id (same pattern as property_expenses).
-- Deliberately no FK to documents-service — it owns its own database.
CREATE TABLE property_documents (
    id              BIGSERIAL PRIMARY KEY,
    property_id     BIGINT NOT NULL,
    user_id         BIGINT NOT NULL,
    expense_id      BIGINT,                 -- null => property-level doc; set => expense receipt
    document_id     BIGINT NOT NULL,        -- documents-service document id
    document_name   VARCHAR(300),           -- cached label so the vault names the file offline
    doc_type        VARCHAR(40),            -- RECEIPT | FORM_1098 | INSURANCE | HOA | TAX_ASSESSMENT | MORTGAGE | OTHER
    note            VARCHAR(500),
    created_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_property_documents_property ON property_documents (property_id);
CREATE INDEX idx_property_documents_user ON property_documents (user_id);
CREATE INDEX idx_property_documents_expense ON property_documents (expense_id);
