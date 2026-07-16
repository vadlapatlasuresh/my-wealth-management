-- Subscription domain: plan catalog + per-plan feature flags + per-user subscription state.
--
-- The plan catalog (subscription_plan + plan_feature) is a CONFIG layer: prices, trial
-- length, billing options and the feature list are all rows here, so any of them can be
-- changed WITHOUT a code change or redeploy. The subscription-tier pages and the
-- feature-gating entitlements both read straight from these tables, so toggling a
-- plan_feature.enabled flag reflects across the app on the next fetch.

CREATE TABLE subscription_plan (
    plan_key          VARCHAR(50) PRIMARY KEY,     -- stable id, e.g. 'individual' | 'business'
    name              VARCHAR(120) NOT NULL,
    tagline           VARCHAR(255),
    tier              INT NOT NULL DEFAULT 0,       -- ordering + upgrade/downgrade comparison (higher = richer)
    monthly_price     DECIMAL(19, 4) NOT NULL,      -- price per month on the MONTHLY cycle
    annual_price      DECIMAL(19, 4),               -- price per YEAR on the ANNUAL cycle; NULL = derive from monthly
    annual_months     INT NOT NULL DEFAULT 10,      -- months charged on annual when annual_price is NULL (10 = "2 months free")
    currency          VARCHAR(10) NOT NULL DEFAULT 'USD',
    trial_days        INT NOT NULL DEFAULT 7,       -- free-trial length before any charge
    accent            VARCHAR(20),                  -- UI accent hint (forest | gold | ...)
    sort_order        INT NOT NULL DEFAULT 0,
    active            BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE plan_feature (
    id            BIGSERIAL PRIMARY KEY,
    plan_key      VARCHAR(50) NOT NULL,
    feature_key   VARCHAR(120) NOT NULL,            -- entitlement key checked by feature gating
    label         VARCHAR(255) NOT NULL,            -- what the tier page renders
    description   VARCHAR(500),
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,    -- toggle a feature on/off for a plan live
    sort_order    INT NOT NULL DEFAULT 0,
    CONSTRAINT uq_plan_feature UNIQUE (plan_key, feature_key),
    CONSTRAINT fk_plan_feature_plan FOREIGN KEY (plan_key)
        REFERENCES subscription_plan (plan_key) ON DELETE CASCADE
);

CREATE INDEX idx_plan_feature_plan ON plan_feature (plan_key);

CREATE TABLE user_subscription (
    id                    BIGSERIAL PRIMARY KEY,
    user_id               BIGINT NOT NULL,
    plan_key              VARCHAR(50) NOT NULL,
    status                VARCHAR(20) NOT NULL,     -- TRIALING | ACTIVE | PAST_DUE | CANCELED | EXPIRED
    billing_cycle         VARCHAR(20),              -- MONTHLY | ANNUAL (null while still trialing pre-checkout)
    trial_start           TIMESTAMP WITHOUT TIME ZONE,
    trial_end             TIMESTAMP WITHOUT TIME ZONE,
    current_period_start  TIMESTAMP WITHOUT TIME ZONE,
    current_period_end    TIMESTAMP WITHOUT TIME ZONE,
    canceled_at           TIMESTAMP WITHOUT TIME ZONE,
    cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,
    last_amount           DECIMAL(19, 4),
    provider_ref          VARCHAR(255),             -- payment provider reference from the last charge
    created_at            TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_subscription_user UNIQUE (user_id)  -- one active subscription record per user
);

CREATE INDEX idx_user_subscription_status ON user_subscription (status);
