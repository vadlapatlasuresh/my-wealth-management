-- Extend bill pay intents to support scheduling, memos, confirmation numbers,
-- the account being paid, and idempotency (prevents accidental double payments).
ALTER TABLE bill_pay_intents ADD COLUMN to_account VARCHAR(255);
ALTER TABLE bill_pay_intents ADD COLUMN payee_type VARCHAR(50);
ALTER TABLE bill_pay_intents ADD COLUMN scheduled_date DATE;
ALTER TABLE bill_pay_intents ADD COLUMN memo VARCHAR(500);
ALTER TABLE bill_pay_intents ADD COLUMN confirmation_number VARCHAR(50);
ALTER TABLE bill_pay_intents ADD COLUMN idempotency_key VARCHAR(100);

CREATE INDEX idx_billpay_user_idem ON bill_pay_intents (user_id, idempotency_key);
