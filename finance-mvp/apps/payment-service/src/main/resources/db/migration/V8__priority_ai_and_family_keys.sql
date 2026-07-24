-- Phase 5 (backlog B3 + B4): register the two remaining premium feature_keys as CONFIG rows,
-- so access is a DB toggle rather than a deploy — same as every other entitlement here.
--
--   individual.priorityAi — faster/deeper assistant routing (ai-insights-service checks this
--                           key directly via PriorityEntitlementClient).
--   individual.family     — family / kids mode. V6 already granted this to premium + business;
--                           this migration only adds the missing pieces, so the two plans that
--                           already have it are untouched (uq_plan_feature would reject a dupe).
--
-- Deliberately NOT granted to 'free' or 'individual' (Plus): these are the two features the
-- Premium tier is meant to justify. Priority AI in particular costs real money per turn, so
-- giving it away would make the tier ladder incoherent AND the unit economics wrong.

INSERT INTO plan_feature (plan_key, feature_key, label, description, enabled, sort_order) VALUES
    ('premium',  'individual.priorityAi', 'Priority AI',
     'A faster, deeper assistant — your questions always go to the strongest model.', TRUE, 27),
    ('business', 'individual.priorityAi', 'Priority AI',
     'A faster, deeper assistant — your questions always go to the strongest model.', TRUE, 39);
