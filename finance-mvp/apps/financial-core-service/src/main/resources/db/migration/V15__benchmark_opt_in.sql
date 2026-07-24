-- Phase 4: net-worth / savings benchmarking — OPT-IN CONSENT ONLY.
--
-- What this table is: the record that a user explicitly asked to be shown how they compare,
-- plus the coarse cohort they chose to be compared against. That is all.
--
-- What this table is deliberately NOT:
--   * It stores NO financial values. The user's own figures stay where they already live
--     (net_worth_snapshots, the aggregation service); the comparison is computed per request
--     and never persisted alongside identity.
--   * It is NOT a contribution to a peer dataset. Consenting to SEE a comparison is not
--     consenting to BE in one — those are separate decisions, and this product only asks for
--     the first. The cross-cutting guardrail is explicit: no data-broker monetization; the
--     business model is subscriptions, because bank-linking requires that trust.
--
-- Cohort bands are coarse on purpose (decade age bands, wide income bands, census region).
-- Anything finer starts to identify people, which is exactly what the k-anonymity floor in
-- BenchmarkService guards against.

CREATE TABLE benchmark_consent (
    user_id        BIGINT PRIMARY KEY,
    opted_in       BOOLEAN NOT NULL DEFAULT FALSE,
    -- Coarse, self-declared cohort selectors. NULL = "don't narrow on this axis".
    age_band       VARCHAR(20),   -- e.g. '25_34', '35_44'
    income_band    VARCHAR(20),   -- e.g. '50_100k', '100_200k'
    region         VARCHAR(20),   -- e.g. 'US_WEST'
    consented_at   TIMESTAMP WITHOUT TIME ZONE,
    revoked_at     TIMESTAMP WITHOUT TIME ZONE,
    created_at     TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

-- Revoking is a common, deliberate action; make "who is currently opted in" cheap to answer.
CREATE INDEX idx_benchmark_consent_opted_in ON benchmark_consent (opted_in);
