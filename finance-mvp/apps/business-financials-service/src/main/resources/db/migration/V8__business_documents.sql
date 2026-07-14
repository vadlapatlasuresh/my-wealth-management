-- Per-business document center. Link-based (mirrors real-estate deal_documents):
-- the file lives wherever the user hosts it (Drive, Dropbox, a data room, an
-- e-invoice link) and we store its URL, a label and a type. A document may
-- optionally be bound to a specific invoice (invoice_id) so invoices can carry
-- their PDF / receipt alongside them. No object storage required.
CREATE TABLE business_documents (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    invoice_id BIGINT,
    label VARCHAR(200) NOT NULL,
    url VARCHAR(1000) NOT NULL,
    -- Free-form type tag: INVOICE | RECEIPT | CONTRACT | TAX | STATEMENT | LICENSE | OTHER.
    doc_type VARCHAR(40) NOT NULL DEFAULT 'OTHER',
    note VARCHAR(500),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_biz_docs_business ON business_documents (business_id, user_id);
CREATE INDEX idx_biz_docs_invoice ON business_documents (invoice_id);
