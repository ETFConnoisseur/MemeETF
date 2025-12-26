-- Migration: Custodial Wallet System
-- Description: Add protocol wallets, deposit/withdraw, and proper ETF position tracking

-- Add protocol wallet balance to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS protocol_sol_balance DECIMAL(20, 9) DEFAULT 0 NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS protocol_wallet_address TEXT;

-- Create deposits table
CREATE TABLE IF NOT EXISTS deposits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(20, 9) NOT NULL,
  tx_signature TEXT NOT NULL UNIQUE,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, confirmed, failed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_tx_signature ON deposits(tx_signature);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);

-- Create withdrawals table
CREATE TABLE IF NOT EXISTS withdrawals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(20, 9) NOT NULL,
  tx_signature TEXT UNIQUE,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, confirmed, failed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

-- Update investments table to track ETF positions properly
ALTER TABLE investments ADD COLUMN IF NOT EXISTS sol_invested DECIMAL(20, 9);
ALTER TABLE investments ADD COLUMN IF NOT EXISTS tokens_purchased JSONB; -- Stores actual token amounts received
ALTER TABLE investments ADD COLUMN IF NOT EXISTS purchase_mc DECIMAL(20, 2); -- Total MC at purchase time
ALTER TABLE investments ADD COLUMN IF NOT EXISTS purchase_24h_change DECIMAL(10, 4); -- 24h % at purchase
ALTER TABLE investments ADD COLUMN IF NOT EXISTS is_sold BOOLEAN DEFAULT FALSE;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS sold_at TIMESTAMP;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS sol_received DECIMAL(20, 9); -- SOL received on sell
ALTER TABLE investments ADD COLUMN IF NOT EXISTS sell_mc DECIMAL(20, 2); -- Total MC at sell time

-- Add swap tracking to investments
CREATE TABLE IF NOT EXISTS investment_swaps (
  id SERIAL PRIMARY KEY,
  investment_id INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  weight DECIMAL(5, 2) NOT NULL, -- Percentage weight
  sol_amount DECIMAL(20, 9) NOT NULL, -- SOL used for this token
  token_amount DECIMAL(30, 9), -- Tokens received
  tx_signature TEXT,
  swap_type TEXT NOT NULL, -- 'buy' or 'sell'
  is_devnet_mock BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_investment_swaps_investment_id ON investment_swaps(investment_id);
CREATE INDEX IF NOT EXISTS idx_investment_swaps_token_mint ON investment_swaps(token_mint);

-- Add ETF performance tracking
ALTER TABLE etfs ADD COLUMN IF NOT EXISTS total_volume DECIMAL(20, 2) DEFAULT 0;
ALTER TABLE etfs ADD COLUMN IF NOT EXISTS total_investors INTEGER DEFAULT 0;
ALTER TABLE etfs ADD COLUMN IF NOT EXISTS performance_24h DECIMAL(10, 4); -- Updated periodically
ALTER TABLE etfs ADD COLUMN IF NOT EXISTS performance_7d DECIMAL(10, 4);
ALTER TABLE etfs ADD COLUMN IF NOT EXISTS performance_30d DECIMAL(10, 4);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_etfs_total_volume ON etfs(total_volume DESC);
CREATE INDEX IF NOT EXISTS idx_etfs_total_investors ON etfs(total_investors DESC);
CREATE INDEX IF NOT EXISTS idx_etfs_performance_24h ON etfs(performance_24h DESC);

-- Comments for documentation
COMMENT ON COLUMN users.protocol_sol_balance IS 'User SOL balance in protocol wallet (custodial)';
COMMENT ON COLUMN users.protocol_wallet_address IS 'Protocol-managed wallet address for this user';
COMMENT ON TABLE deposits IS 'User deposits from personal wallet to protocol wallet';
COMMENT ON TABLE withdrawals IS 'User withdrawals from protocol wallet to personal wallet';
COMMENT ON TABLE investment_swaps IS 'Individual token swaps executed for each ETF investment';
COMMENT ON COLUMN investments.tokens_purchased IS 'JSON object of token mints and amounts purchased';
COMMENT ON COLUMN investments.purchase_mc IS 'Total market cap of ETF at time of purchase';
COMMENT ON COLUMN investments.is_sold IS 'Whether this ETF position has been sold';
