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

    // Update the type check constraint to include 'refund'
    try {
      await pool.query(`ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check`);
      await pool.query(`
        ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
        CHECK (type IN ('deposit', 'withdrawal', 'buy', 'sell', 'refund'))
      `);
      console.log('[Migration] Updated type constraint');
    } catch (e: any) {
      console.log('[Migration] Type constraint update skipped:', e.message);
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


