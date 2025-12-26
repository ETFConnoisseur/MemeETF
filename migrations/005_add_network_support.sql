-- Migration: Add network support to all tables
-- This allows filtering ETFs, transactions, and data by network (devnet/mainnet)

-- Add network column to etf_listings
ALTER TABLE etf_listings
ADD COLUMN IF NOT EXISTS network VARCHAR(20) DEFAULT 'devnet';

-- Add network column to investments
ALTER TABLE investments
ADD COLUMN IF NOT EXISTS network VARCHAR(20) DEFAULT 'devnet';

-- Add network column to transactions
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS network VARCHAR(20) DEFAULT 'devnet';

-- Create indexes for faster network filtering
CREATE INDEX IF NOT EXISTS idx_etf_listings_network ON etf_listings(network);
CREATE INDEX IF NOT EXISTS idx_investments_network ON investments(network);
CREATE INDEX IF NOT EXISTS idx_transactions_network ON transactions(network);

-- Update existing records to devnet (default)
UPDATE etf_listings SET network = 'devnet' WHERE network IS NULL;
UPDATE investments SET network = 'devnet' WHERE network IS NULL;
UPDATE transactions SET network = 'devnet' WHERE network IS NULL;
