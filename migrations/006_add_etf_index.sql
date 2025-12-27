-- Migration: Add etf_index to support multiple ETFs per wallet
-- Each wallet can now create up to 5 ETFs (index 0-4)

-- Add etf_index column to etf_listings
ALTER TABLE etf_listings
ADD COLUMN IF NOT EXISTS etf_index SMALLINT DEFAULT 0;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_etf_listings_creator_index
ON etf_listings(creator, etf_index);

-- Update comment
COMMENT ON COLUMN etf_listings.etf_index IS 'ETF index for this wallet (0-4, allows 5 ETFs per wallet)';
