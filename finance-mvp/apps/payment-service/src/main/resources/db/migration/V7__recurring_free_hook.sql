-- Phase 2: make the Recurring & subscriptions radar a FREE acquisition hook (the
-- "found $X/mo of subscriptions" moment converts best when it's free). Adds the
-- individual.recurring feature_key to the free floor so the entitlement config matches
-- the (ungated) page. Idempotent-safe: uq_plan_feature (plan_key, feature_key) prevents dupes.
INSERT INTO plan_feature (plan_key, feature_key, label, description, enabled, sort_order) VALUES
    ('free', 'individual.recurring', 'Recurring radar', 'Detect recurring charges and price hikes; cancel what you forgot.', TRUE, 11);
