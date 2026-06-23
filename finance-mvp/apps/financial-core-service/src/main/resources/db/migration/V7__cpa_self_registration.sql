-- CPA self-registration: CPAs can list their own practice (website, Google reviews, contact
-- details). New listings start PENDING and are invisible until an admin approves them, so the
-- directory stays trustworthy. Additive to V6 — existing seeded CPAs are flipped to APPROVED.

ALTER TABLE cpa_profile ADD COLUMN website_url         VARCHAR(500);
ALTER TABLE cpa_profile ADD COLUMN google_review_url   VARCHAR(500);
ALTER TABLE cpa_profile ADD COLUMN google_rating       NUMERIC(2,1);
ALTER TABLE cpa_profile ADD COLUMN contact_email       VARCHAR(200);
ALTER TABLE cpa_profile ADD COLUMN phone               VARCHAR(40);
ALTER TABLE cpa_profile ADD COLUMN status              VARCHAR(20) NOT NULL DEFAULT 'PENDING';
ALTER TABLE cpa_profile ADD COLUMN submitted_by_user_id BIGINT;
ALTER TABLE cpa_profile ADD COLUMN submitted_at        TIMESTAMP WITHOUT TIME ZONE;

-- Existing rows (the seeded sample CPAs) are already vetted — make them live.
UPDATE cpa_profile SET status = 'APPROVED' WHERE status = 'PENDING';

-- The directory and the moderation queue both filter on status.
CREATE INDEX idx_cpa_profile_status ON cpa_profile (status);
