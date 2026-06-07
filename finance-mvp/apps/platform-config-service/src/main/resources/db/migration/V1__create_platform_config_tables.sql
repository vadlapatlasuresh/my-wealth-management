CREATE TABLE app_section (
    id VARCHAR(100) PRIMARY KEY,
    label VARCHAR(255),
    sort_order INT
);

CREATE TABLE app_module (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(255),
    icon VARCHAR(255),
    route VARCHAR(255),
    section VARCHAR(100),
    sort_order INT,
    enabled BOOLEAN,
    platforms VARCHAR(255),       -- comma-separated list, e.g. "web,ios,android"
    required_flags VARCHAR(255),  -- comma-separated list of feature flag keys
    app_config_version VARCHAR(20) DEFAULT '1'
);

CREATE TABLE feature_flag (
    flag_key VARCHAR(200) PRIMARY KEY,
    enabled BOOLEAN
);

CREATE TABLE app_setting (
    setting_key VARCHAR(200) PRIMARY KEY,
    setting_value VARCHAR(4000)
);

CREATE TABLE disclaimer (
    id BIGSERIAL PRIMARY KEY,
    disclaimer_key VARCHAR(200) NOT NULL,
    version INT NOT NULL,
    locale VARCHAR(20) NOT NULL,
    title VARCHAR(255),
    body_markdown TEXT,
    requires_acceptance BOOLEAN,
    effective_at TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT uq_disclaimer_key_locale_version UNIQUE (disclaimer_key, locale, version)
);

CREATE TABLE disclaimer_acceptance (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    disclaimer_key VARCHAR(200) NOT NULL,
    version INT NOT NULL,
    accepted_at TIMESTAMP WITHOUT TIME ZONE NOT NULL
);
