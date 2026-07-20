-- Link a K-1 to the actual file in the user's Document Center.
--
-- V13 gave the record a free-text document_url. Pointing at a documents-service document
-- instead means the file lives in the one place that already handles storage, download
-- authorisation and CPA sharing — so a user can hand their whole year of K-1s to their
-- accountant through the existing secure-link flow rather than emailing PDFs around.
--
-- document_url is kept for anyone who files their K-1s somewhere else entirely.

ALTER TABLE k1_records ADD COLUMN document_id BIGINT;
-- The label, cached so the ledger can name the file without calling documents-service.
-- Deliberately not a foreign key: documents-service owns its own database.
ALTER TABLE k1_records ADD COLUMN document_name VARCHAR(300);
