-- Bank feeds & reconciliation, Phase 3b — link a bill to the bank transaction that paid it.
--
-- Invoices already carry linked_transaction_id (order-to-cash). Bills gain the same so
-- one-click reconciliation can match a bank withdrawal to the bill it settled, mark the bill
-- paid, and remember which transaction was used (so it isn't suggested again).
ALTER TABLE business_bills ADD COLUMN linked_transaction_id BIGINT;
