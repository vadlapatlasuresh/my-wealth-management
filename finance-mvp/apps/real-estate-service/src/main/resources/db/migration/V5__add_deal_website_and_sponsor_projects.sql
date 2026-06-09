-- Per-deal external link (project page / LLC website / data room).
ALTER TABLE deals ADD COLUMN website_url VARCHAR(500);

-- Sponsor track record: a user's previous projects, reusable across all their deals.
CREATE TABLE sponsor_projects (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,
    description VARCHAR(2000),
    url VARCHAR(500),
    location VARCHAR(200),
    project_year INTEGER,                  -- "year" is a reserved word in H2; use project_year
    outcome VARCHAR(200),                  -- e.g. "Sold 2023 · 21% IRR" or current status
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL
);

CREATE INDEX idx_sponsor_projects_user_id ON sponsor_projects (user_id);
