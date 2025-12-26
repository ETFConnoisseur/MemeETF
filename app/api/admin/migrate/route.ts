import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const pool = getDatabasePool();
    if (!pool) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    console.log('[Migration] Starting database migration...');

    // Read the migration SQL file
    const migrationPath = join(process.cwd(), 'migrations', '001_initial_schema.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    console.log('[Migration] Running initial schema...');
    await pool.query(sql);
    console.log('[Migration] Initial schema created successfully');

    // Add pnl column to transactions table if it doesn't exist
    try {
      await pool.query(`
        ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pnl NUMERIC(20, 8) DEFAULT 0
      `);
      console.log('[Migration] Added pnl column to transactions');
    } catch (e: any) {
      console.log('[Migration] pnl column may already exist:', e.message);
    }

    // Add protocol wallet columns to users table
    try {
      await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS protocol_sol_balance NUMERIC(20, 8) DEFAULT 0
      `);
      await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS protocol_wallet_address VARCHAR(44)
      `);
      console.log('[Migration] Added protocol wallet columns to users');
    } catch (e: any) {
      console.log('[Migration] Protocol wallet columns may already exist:', e.message);
    }

    // Update the type check constraint to include 'refund' and 'token_swap'
    try {
      await pool.query(`ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check`);
      await pool.query(`
        ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
        CHECK (type IN ('deposit', 'withdrawal', 'buy', 'sell', 'refund', 'token_swap'))
      `);
      console.log('[Migration] Updated type constraint to include token_swap');
    } catch (e: any) {
      console.log('[Migration] Type constraint update skipped:', e.message);
    }

    // Add metadata column for token swap details
    try {
      await pool.query(`
        ALTER TABLE transactions ADD COLUMN IF NOT EXISTS metadata JSONB
      `);
      console.log('[Migration] Added metadata column');
    } catch (e: any) {
      console.log('[Migration] metadata column may already exist:', e.message);
    }

    // Add index on metadata column
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_transactions_metadata ON transactions USING GIN (metadata)
      `);
      console.log('[Migration] Created metadata index');
    } catch (e: any) {
      console.log('[Migration] metadata index may already exist:', e.message);
    }

    // Add missing columns to investments table
    try {
      await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS is_sold BOOLEAN DEFAULT FALSE`);
      await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS sol_invested NUMERIC(20, 8) DEFAULT 0`);
      await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS purchase_mc NUMERIC(20, 2) DEFAULT 0`);
      await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS purchase_24h_change NUMERIC(10, 2) DEFAULT 0`);
      await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS tokens_purchased JSONB`);
      await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS sol_received NUMERIC(20, 8) DEFAULT 0`);
      await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS sold_at TIMESTAMP`);
      console.log('[Migration] Added missing columns to investments table');
    } catch (e: any) {
      console.log('[Migration] Investments columns may already exist:', e.message);
    }

    // Add actual_mint column to investment_swaps table for devnet substitution tracking
    try {
      await pool.query(`ALTER TABLE investment_swaps ADD COLUMN IF NOT EXISTS actual_mint VARCHAR(44)`);
      console.log('[Migration] Added actual_mint column to investment_swaps table');
    } catch (e: any) {
      console.log('[Migration] actual_mint column may already exist:', e.message);
    }

    return NextResponse.json({
      success: true,
      message: 'Migration completed successfully. All tables created.',
    });
  } catch (error: any) {
    console.error('[Migration] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


