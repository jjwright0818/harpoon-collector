-- Step 1: Add trader information, shares, and usd columns to trades table
-- Run this BEFORE deploying new collector code

-- Add shares column (number of outcome tokens purchased)
ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS shares DECIMAL(20,6);

-- Add usd column (USD amount spent - replaces size)
ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS usd DECIMAL(15,2);

-- Add trader columns if they don't exist
ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS trader_username VARCHAR(255),
ADD COLUMN IF NOT EXISTS trader_pseudonym VARCHAR(255),
ADD COLUMN IF NOT EXISTS trader_wallet VARCHAR(255),
ADD COLUMN IF NOT EXISTS trader_bio TEXT,
ADD COLUMN IF NOT EXISTS trader_profile_image TEXT;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_trades_username 
ON trades(trader_username) 
WHERE trader_username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trades_wallet 
ON trades(trader_wallet) 
WHERE trader_wallet IS NOT NULL;

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'trades' 
  AND column_name LIKE 'trader_%'
ORDER BY column_name;

