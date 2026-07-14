-- Year-wise document organization. The document center now groups uploads by
-- tax/reporting year (and optionally month), so each business keeps its papers
-- filed per year exactly as an accountant would. Both columns are nullable so
-- existing documents (and undated links) remain valid.
ALTER TABLE business_documents ADD COLUMN period_year  INT;
ALTER TABLE business_documents ADD COLUMN period_month INT;

CREATE INDEX idx_biz_docs_year ON business_documents (business_id, user_id, period_year);
