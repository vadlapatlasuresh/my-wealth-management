-- Property photos become real uploads instead of pasted URLs.
--
-- V10 gave listings an `image_urls` column holding hosted links the poster typed in.
-- Posters upload files now, so the bytes live in object storage and this table holds
-- the pointer plus the metadata needed to serve them back.

CREATE TABLE deal_images (
    id BIGSERIAL PRIMARY KEY,
    deal_id BIGINT NOT NULL,
    owner_user_id BIGINT NOT NULL,
    object_name VARCHAR(500) NOT NULL,      -- object-storage key; never exposed to clients
    content_type VARCHAR(255),
    size_bytes BIGINT,
    sort_order INTEGER NOT NULL DEFAULT 0,  -- display order, so the lead photo is deliberate
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT fk_deal_images_deal FOREIGN KEY (deal_id) REFERENCES deals (id) ON DELETE CASCADE
);
CREATE INDEX idx_deal_images_deal_id ON deal_images (deal_id);

-- The typed-in URLs have no upload behind them and cannot be migrated into storage.
ALTER TABLE deals DROP COLUMN image_urls;
