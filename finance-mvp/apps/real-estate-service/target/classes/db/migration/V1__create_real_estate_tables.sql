CREATE TABLE properties (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    address VARCHAR(500) NOT NULL,
    property_type VARCHAR(50) NOT NULL, -- PRIMARY_RESIDENCE | RENTAL_PROPERTY | LAND
    purchase_price DECIMAL(19, 4) NOT NULL,
    purchase_date DATE,
    current_value DECIMAL(19, 4),
    mortgage_balance DECIMAL(19, 4),
    last_valued_at TIMESTAMP WITHOUT TIME ZONE
);
