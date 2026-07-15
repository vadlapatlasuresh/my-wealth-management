-- ============================================================================
-- Personal Document Center — the single source of truth for a user's documents.
--
-- Four tables:
--   doc_folders        user-created folders (optionally nested via parent_id)
--   documents          a file: uploaded (GCS), a link (LINK), or a reference to a
--                      file another service owns (EXTERNAL_REF). source_service /
--                      source_ref make the center the cross-app registry: any file
--                      created elsewhere is registered here and referenced back by
--                      its returned document id.
--   document_shares    a shareable grant (secure token link, optionally to a CPA),
--                      with scope (view/download), expiry, passcode and revocation.
--   share_access_log   every access to a shared document/folder (the owner's audit).
--
-- Column names avoid DB reserved words so the same SQL runs on Postgres (prod) and
-- H2 (dev). BIGSERIAL / TIMESTAMP WITHOUT TIME ZONE / NOW() are supported by both.
-- ============================================================================

CREATE TABLE doc_folders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,
    parent_id BIGINT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_doc_folders_user ON doc_folders (user_id);
CREATE INDEX idx_doc_folders_parent ON doc_folders (parent_id);

CREATE TABLE documents (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    folder_id BIGINT,
    label VARCHAR(200) NOT NULL,
    -- LINK (external url) | GCS (uploaded object) | EXTERNAL_REF (owned by another service)
    storage_type VARCHAR(16) NOT NULL DEFAULT 'LINK',
    url VARCHAR(1000),
    object_name VARCHAR(1024),
    content_type VARCHAR(255),
    size_bytes BIGINT,
    original_filename VARCHAR(400),
    -- Free-form tag: W2 | 1099 | TAX_RETURN | STATEMENT | ID | CONTRACT | RECEIPT | OTHER
    doc_type VARCHAR(40) NOT NULL DEFAULT 'OTHER',
    -- Cross-app registry: which service the file originated in (null = created here)
    source_service VARCHAR(60),
    source_ref VARCHAR(200),
    note VARCHAR(500),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_documents_user ON documents (user_id);
CREATE INDEX idx_documents_folder ON documents (folder_id);
-- One registry row per originating record, so re-registering an already-known file
-- updates rather than duplicates it.
CREATE UNIQUE INDEX ux_documents_source ON documents (user_id, source_service, source_ref);

CREATE TABLE document_shares (
    id BIGSERIAL PRIMARY KEY,
    owner_user_id BIGINT NOT NULL,
    target_kind VARCHAR(16) NOT NULL,     -- DOCUMENT | FOLDER
    document_id BIGINT,
    folder_id BIGINT,
    grantee_kind VARCHAR(16) NOT NULL DEFAULT 'LINK', -- LINK | CPA
    grantee_ref VARCHAR(200),             -- recipient email, or connected CPA identifier
    token VARCHAR(64) NOT NULL,
    scope VARCHAR(16) NOT NULL DEFAULT 'VIEW',  -- VIEW | DOWNLOAD
    passcode_hash VARCHAR(200),           -- BCrypt; null = no passcode
    share_message VARCHAR(500),
    expires_at TIMESTAMP WITHOUT TIME ZONE,
    revoked_at TIMESTAMP WITHOUT TIME ZONE,
    last_accessed_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ux_document_shares_token ON document_shares (token);
CREATE INDEX idx_document_shares_owner ON document_shares (owner_user_id);
CREATE INDEX idx_document_shares_document ON document_shares (document_id);
CREATE INDEX idx_document_shares_folder ON document_shares (folder_id);

CREATE TABLE share_access_log (
    id BIGSERIAL PRIMARY KEY,
    share_id BIGINT NOT NULL,
    accessed_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    ip VARCHAR(64),
    user_agent VARCHAR(400),
    access_action VARCHAR(40)             -- INFO | VIEW | DOWNLOAD | DENIED
);
CREATE INDEX idx_share_access_share ON share_access_log (share_id);
