-- Migration 004: Fix Critical Schema Issues
-- This migration addresses:
-- 1. Foreign key type mismatches
-- 2. Missing columns
-- 3. Incorrect table references
-- 4. Duplicate prevention

-- ============================================
-- FIX 1: Drop and recreate deposits table with correct foreign key
-- ============================================
DROP TABLE IF EXISTS deposits CASCADE;

CREATE TABLE deposits (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(44) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  amount DECIMAL(20, 9) NOT NULL,
  tx_signature TEXT NOT NULL UNIQUE,  -- UNIQUE constraint prevents double-spend
  from_address VARCHAR(44) NOT NULL,
  to_address VARCHAR(44) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deposits_user_id ON deposits(user_id);
CREATE INDEX idx_deposits_tx_signature ON deposits(tx_signature);
CREATE INDEX idx_deposits_status ON deposits(status);

-- ============================================
-- FIX 2: Drop and recreate withdrawals table with correct foreign key
-- ============================================
DROP TABLE IF EXISTS withdrawals CASCADE;

CREATE TABLE withdrawals (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(44) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  amount DECIMAL(20, 9) NOT NULL,
  tx_signature TEXT NOT NULL UNIQUE,
  from_address VARCHAR(44) NOT NULL,
  to_address VARCHAR(44) NOT NULL,
  status VARCHAR(20) DEFAULT 'confirmed',
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX idx_withdrawals_tx_signature ON withdrawals(tx_signature);

-- ============================================
-- FIX 3: Drop and recreate investment_swaps table with correct foreign key
-- ============================================
DROP TABLE IF EXISTS investment_swaps CASCADE;

CREATE TABLE investment_swaps (
  id SERIAL PRIMARY KEY,
  investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  token_mint VARCHAR(44) NOT NULL,
  actual_mint VARCHAR(44),  -- For devnet token substitution tracking
  token_symbol VARCHAR(20),
  token_name VARCHAR(100),
  weight DECIMAL(5, 2) NOT NULL,
  sol_amount DECIMAL(20, 9) NOT NULL,
  token_amount DECIMAL(30, 9),
  tx_signature TEXT,
  swap_type VARCHAR(10) NOT NULL CHECK (swap_type IN ('buy', 'sell')),
  is_devnet_mock BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_investment_swaps_investment_id ON investment_swaps(investment_id);
CREATE INDEX idx_investment_swaps_token_mint ON investment_swaps(token_mint);

-- ============================================
-- FIX 4: Add UNIQUE constraint to transactions.tx_hash to prevent double-spend
-- ============================================
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_tx_hash_unique;
ALTER TABLE transactions ADD CONSTRAINT transactions_tx_hash_unique UNIQUE (tx_hash);

-- ============================================
-- FIX 5: Ensure all required columns exist in users table
-- ============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS protocol_sol_balance NUMERIC(20, 8) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS protocol_wallet_address VARCHAR(44);

-- ============================================
-- FIX 6: Ensure all required columns exist in investments table
-- ============================================
ALTER TABLE investments ADD COLUMN IF NOT EXISTS is_sold BOOLEAN DEFAULT FALSE;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS sol_invested NUMERIC(20, 8) DEFAULT 0;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS purchase_mc NUMERIC(20, 2) DEFAULT 0;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS purchase_24h_change NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS tokens_purchased JSONB;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS sol_received NUMERIC(20, 8) DEFAULT 0;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS sell_mc NUMERIC(20, 2);
ALTER TABLE investments ADD COLUMN IF NOT EXISTS sold_at TIMESTAMP;

-- ============================================
-- FIX 7: Add total_volume to etf_listings (NOT 'etfs')
-- ============================================
ALTER TABLE etf_listings ADD COLUMN IF NOT EXISTS total_volume DECIMAL(20, 2) DEFAULT 0;

-- ============================================
-- FIX 8: Add metadata column for token swap details
-- ============================================
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS metadata JSONB;
CREATE INDEX IF NOT EXISTS idx_transactions_metadata ON transactions USING GIN (metadata);

-- ============================================
-- FIX 9: Update transactions type constraint to include all types
-- ============================================
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('deposit', 'withdrawal', 'buy', 'sell', 'refund', 'token_swap'));

-- ============================================
-- FIX 10: Add pnl column if not exists
-- ============================================
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pnl NUMERIC(20, 8) DEFAULT 0;
