-- Multi-file share sets: a single share/link over several chosen documents.
-- A share with target_kind='SET' has its member documents listed here (one row
-- per document). DOCUMENT and FOLDER shares don't use this table.
CREATE TABLE share_documents (
    id BIGSERIAL PRIMARY KEY,
    share_id BIGINT NOT NULL,
    document_id BIGINT NOT NULL
);
CREATE INDEX idx_share_documents_share ON share_documents (share_id);
CREATE INDEX idx_share_documents_document ON share_documents (document_id);
