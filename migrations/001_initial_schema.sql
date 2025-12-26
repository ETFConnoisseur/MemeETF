-- Users table (stores basic user info, wallet_address is the primary identifier)
CREATE TABLE IF NOT EXISTS users (
  wallet_address VARCHAR(44) PRIMARY KEY,
  x_username VARCHAR(255),
  protocol_sol_balance NUMERIC(20, 8) DEFAULT 0,
  protocol_wallet_address VARCHAR(44),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Wallets table (protocol-managed wallets for each user)
-- user_id references the external wallet address (connected wallet)
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(44) NOT NULL UNIQUE REFERENCES users(wallet_address) ON DELETE CASCADE,
  public_key VARCHAR(44) UNIQUE NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  sol_balance NUMERIC(20, 8) DEFAULT 0,
  exported_keys BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ETFs table
CREATE TABLE IF NOT EXISTS etf_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  creator VARCHAR(44) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  contract_address VARCHAR(44) UNIQUE NOT NULL,
  tokens JSONB NOT NULL,
  market_cap_at_list NUMERIC(20, 2) NOT NULL,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Portfolio table (Current holdings)
CREATE TABLE IF NOT EXISTS portfolio (
  user_id VARCHAR(44) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  etf_id UUID NOT NULL REFERENCES etf_listings(id) ON DELETE CASCADE,
  amount NUMERIC(20, 8) NOT NULL,
  entry_price NUMERIC(20, 8) NOT NULL,
  current_value NUMERIC(20, 8) NOT NULL,
  PRIMARY KEY (user_id, etf_id)
);

-- Investments table (History of buys)
CREATE TABLE IF NOT EXISTS investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(44) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  etf_id UUID NOT NULL REFERENCES etf_listings(id) ON DELETE CASCADE,
  sol_amount NUMERIC(20, 8) NOT NULL,
  entry_market_cap NUMERIC(20, 2) NOT NULL,
  tokens_received NUMERIC(20, 8) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(44) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'buy', 'sell')),
  amount NUMERIC(20, 8) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  tx_hash VARCHAR(88),
  fees NUMERIC(20, 8) DEFAULT 0,
  etf_id UUID REFERENCES etf_listings(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fees table
CREATE TABLE IF NOT EXISTS fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etf_id UUID NOT NULL REFERENCES etf_listings(id) ON DELETE CASCADE,
  lister_fee NUMERIC(20, 8) NOT NULL,
  platform_fee NUMERIC(20, 8) NOT NULL,
  paid_out BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_etfs_creator ON etf_listings(creator);
CREATE INDEX IF NOT EXISTS idx_investments_user_id ON investments(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_user_id ON portfolio(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_fees_etf_id ON fees(etf_id);
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);

