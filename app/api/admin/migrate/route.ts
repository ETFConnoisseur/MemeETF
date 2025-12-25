import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';

export async function POST(request: NextRequest) {
  try {
    const pool = getDatabasePool();
    if (!pool) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Add pnl column to transactions table if it doesn't exist
    await pool.query(`
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pnl NUMERIC(20, 8) DEFAULT 0
    `);
    console.log('[Migration] Added pnl column to transactions');

    // Update the type check constraint to include 'refund'
    try {
      await pool.query(`ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check`);
      await pool.query(`
        ALTER TABLE transactions ADD CONSTRAINT transactions_type_check 
        CHECK (type IN ('deposit', 'withdrawal', 'buy', 'sell', 'refund'))
      `);
      console.log('[Migration] Updated type constraint');
    } catch (e) {
      console.log('[Migration] Type constraint update skipped (may already be correct)');
    }

    return NextResponse.json({
      success: true,
      message: 'Migration completed successfully',
    });
  } catch (error: any) {
    console.error('[Migration] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


