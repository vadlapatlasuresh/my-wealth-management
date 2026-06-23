-- CPA license verification: track when/how a license was confirmed (NASBA CPAVerify or mock).
-- Additive to V6/V7. The "Verified" badge is driven by license_verified; these columns record
-- the provenance shown to staff and members.

ALTER TABLE cpa_profile ADD COLUMN license_verified_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE cpa_profile ADD COLUMN verification_source VARCHAR(40);

-- Existing seeded CPAs were vetted by hand — record that provenance.
UPDATE cpa_profile
   SET verification_source = 'MANUAL',
       license_verified_at = NOW()
 WHERE license_verified = TRUE AND verification_source IS NULL;
