-- Mortgage/debt payoff goals: a DEBT_PAYOFF goal can track paying down a real mortgage, sourced
-- from either a property (Properties tab — carries balance + APR + payment) or a linked loan
-- account (Plaid — balance only, so APR/payment are entered by the user).
--
-- Progress is "paid down since you started": we snapshot the balance at goal creation as
-- starting_balance, and progress = (starting_balance - current balance) / starting_balance.
ALTER TABLE goals ADD COLUMN property_id BIGINT;          -- linked property (real-estate service)
ALTER TABLE goals ADD COLUMN loan_account_id BIGINT;      -- linked Plaid loan/mortgage account
ALTER TABLE goals ADD COLUMN starting_balance DECIMAL(19, 4); -- baseline owed at goal start (for % paid off)
ALTER TABLE goals ADD COLUMN mortgage_apr DECIMAL(9, 4);  -- annual rate %, for the payoff projection
ALTER TABLE goals ADD COLUMN monthly_payment DECIMAL(19, 4); -- scheduled P&I payment
ALTER TABLE goals ADD COLUMN extra_payment DECIMAL(19, 4);   -- planned extra monthly payment (what-if)

CREATE INDEX idx_goals_property ON goals (property_id);
