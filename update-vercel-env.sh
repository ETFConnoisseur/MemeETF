#!/bin/bash

echo "Updating Vercel environment variables with Neon database..."

# Note: You need to manually update these in Vercel dashboard
# Go to: https://vercel.com/yeetrew1-1502s-projects/mtf-platform/settings/environment-variables

cat << 'EOF'

=============================================================
MANUAL STEP REQUIRED: Update Vercel Environment Variables
=============================================================

Please update these variables in Vercel Dashboard:
https://vercel.com/yeetrew1-1502s-projects/mtf-platform/settings/environment-variables

For PRODUCTION environment, update:

DATABASE_URL=postgresql://neondb_owner:npg_xKJDUi3Q4omw@ep-aged-recipe-ae68l8h7-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require

PGHOST=ep-aged-recipe-ae68l8h7-pooler.c-2.us-east-2.aws.neon.tech

PGPORT=5432

PGUSER=neondb_owner

PGPASSWORD=npg_xKJDUi3Q4omw

PGDATABASE=neondb

=============================================================

Then redeploy with: vercel --prod

EOF
