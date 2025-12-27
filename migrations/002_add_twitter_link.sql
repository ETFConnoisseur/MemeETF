-- Add twitter_link column to etf_listings table
ALTER TABLE etf_listings ADD COLUMN IF NOT EXISTS twitter_link VARCHAR(500);

-- Create index for future queries on twitter_link
CREATE INDEX IF NOT EXISTS idx_etf_twitter_link ON etf_listings(twitter_link) WHERE twitter_link IS NOT NULL;
