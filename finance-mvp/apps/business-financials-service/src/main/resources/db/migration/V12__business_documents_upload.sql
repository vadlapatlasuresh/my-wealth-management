-- Uploaded files (not just links). A business_document can now either be a LINK
-- (its url points wherever the user hosts it, the original behaviour) or a GCS
-- object uploaded through the app and stored in Google Cloud Storage.
--
-- For GCS documents the bytes live in the bucket under object_name; the file is
-- streamed back via an authenticated download endpoint, so url is optional now.
ALTER TABLE business_documents ALTER COLUMN url DROP NOT NULL;

ALTER TABLE business_documents ADD COLUMN storage_type VARCHAR(16) NOT NULL DEFAULT 'LINK';
ALTER TABLE business_documents ADD COLUMN object_name VARCHAR(1024);
ALTER TABLE business_documents ADD COLUMN content_type VARCHAR(255);
ALTER TABLE business_documents ADD COLUMN size_bytes BIGINT;
ALTER TABLE business_documents ADD COLUMN original_filename VARCHAR(400);
