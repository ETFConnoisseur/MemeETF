-- Add token_swap type to transactions
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('deposit', 'withdrawal', 'buy', 'sell', 'token_swap', 'refund'));

-- Add metadata column to store swap details
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Create index on metadata for faster queries
CREATE INDEX IF NOT EXISTS idx_transactions_metadata ON transactions USING GIN (metadata);
