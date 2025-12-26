#!/bin/bash

# Set Vercel environment variables for production

echo "Setting production environment variables..."

# Database connection
echo "postgresql://postgres.ucvtpvrfzgkonqwtdmue:Y6fPZljGZfoIHmhj@aws-0-us-east-1.pooler.supabase.com:6543/postgres" | vercel env add DATABASE_URL production

echo "postgres" | vercel env add PGDATABASE production

echo "aws-0-us-east-1.pooler.supabase.com" | vercel env add PGHOST production

echo "Y6fPZljGZfoIHmhj" | vercel env add PGPASSWORD production

echo "6543" | vercel env add PGPORT production

echo "postgres.ucvtpvrfzgkonqwtdmue" | vercel env add PGUSER production

echo "production" | vercel env add NODE_ENV production

echo "mtf-secret-key-32chars-here!!" | vercel env add ENCRYPTION_KEY production

echo "https://api.devnet.solana.com" | vercel env add SOLANA_DEVNET_RPC_URL production

echo "CwwrCDfrsuA2C4YPiobU82ZA9wSWrecyLbbvP35QXmyo" | vercel env add PROGRAM_ID production

echo "MHc5em1SSlg4X2lhVFZzTTJ5Z3I6MTpjaQ" | vercel env add X_CLIENT_ID production

echo "FEg3esuwourhYxsBjnk_PlKDN-NC33A_ugfG6h16VNkB5LS-HU" | vercel env add X_CLIENT_SECRET production

echo "https://memeetf.tech/settings" | vercel env add X_REDIRECT_URI production

echo "Done! Redeploy your application for changes to take effect."
