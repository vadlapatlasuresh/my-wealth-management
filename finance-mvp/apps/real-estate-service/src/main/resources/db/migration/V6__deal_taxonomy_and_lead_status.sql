-- Deal taxonomy + return structure.
ALTER TABLE deals ADD COLUMN subcategory VARCHAR(40);
ALTER TABLE deals ADD COLUMN return_type VARCHAR(20);
ALTER TABLE deals ADD COLUMN annual_return_min DECIMAL(9, 4);
ALTER TABLE deals ADD COLUMN annual_return_max DECIMAL(9, 4);
ALTER TABLE deals ADD COLUMN distribution_frequency VARCHAR(20);

-- Lead status as the sponsor works each interest.
ALTER TABLE deal_interests ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'NEW';
