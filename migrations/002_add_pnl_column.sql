-- Add pnl column to transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pnl NUMERIC(20, 8) DEFAULT 0;

-- Update the type check constraint to include 'refund'
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check 
  CHECK (type IN ('deposit', 'withdrawal', 'buy', 'sell', 'refund'));


