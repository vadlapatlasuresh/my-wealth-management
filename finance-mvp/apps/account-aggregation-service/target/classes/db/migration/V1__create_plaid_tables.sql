CREATE TABLE plaid_items (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    plaid_item_id VARCHAR(255) NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    institution_id VARCHAR(255),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    plaid_account_id VARCHAR(255) NOT NULL UNIQUE,
    plaid_item_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    official_name VARCHAR(255),
    subtype VARCHAR(255) NOT NULL,
    type VARCHAR(255) NOT NULL,
    current_balance DECIMAL(19, 4) NOT NULL,
    available_balance DECIMAL(19, 4),
    currency VARCHAR(10) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    FOREIGN KEY (plaid_item_id) REFERENCES plaid_items (plaid_item_id) ON DELETE CASCADE
);

CREATE TABLE transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    account_id BIGINT NOT NULL,
    plaid_transaction_id VARCHAR(255) NOT NULL UNIQUE,
    plaid_account_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    amount DECIMAL(19, 4) NOT NULL,
    iso_currency_code VARCHAR(10) NOT NULL,
    date DATE NOT NULL,
    category VARCHAR(255),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
);
