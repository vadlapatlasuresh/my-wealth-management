CREATE TABLE deal_interests (
    id BIGSERIAL PRIMARY KEY,
    deal_id BIGINT NOT NULL,
    owner_user_id BIGINT NOT NULL,
    interested_user_id BIGINT,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(320) NOT NULL,
    phone VARCHAR(40),
    message VARCHAR(2000),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL
);

CREATE INDEX idx_deal_interests_deal_id ON deal_interests (deal_id);
CREATE INDEX idx_deal_interests_owner ON deal_interests (owner_user_id);
