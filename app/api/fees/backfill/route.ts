import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';

// Backfill fees from transactions that don't have corresponding fee records
export async function POST(request: NextRequest) {
  try {
    const pool = getDatabasePool();
    if (!pool) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Find all buy transactions that don't have corresponding fee records
    const transactionsResult = await pool.query(`
      SELECT t.id, t.etf_id, t.amount, t.created_at
      FROM transactions t
      WHERE t.type = 'buy' 
        AND t.status = 'completed'
        AND t.etf_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM fees f 
          WHERE f.etf_id = t.etf_id 
            AND f.created_at >= t.created_at - INTERVAL '1 minute'
            AND f.created_at <= t.created_at + INTERVAL '1 minute'
        )
    `);

    console.log(`[Backfill] Found ${transactionsResult.rows.length} transactions without fees`);

    let backfilledCount = 0;
    for (const tx of transactionsResult.rows) {
      const solAmount = parseFloat(tx.amount);
      const listerFee = solAmount * 0.005; // 0.5%
      const platformFee = solAmount * 0.005; // 0.5%

      await pool.query(
        `INSERT INTO fees (etf_id, lister_fee, platform_fee, paid_out, created_at)
         VALUES ($1, $2, $3, FALSE, $4)`,
        [tx.etf_id, listerFee, platformFee, tx.created_at]
      );
      
      backfilledCount++;
      console.log(`[Backfill] Added fees for transaction ${tx.id}: ${listerFee} SOL`);
    }

    return NextResponse.json({
      success: true,
      message: `Backfilled ${backfilledCount} fee records`,
      backfilledCount,
    });
  } catch (error: any) {
    console.error('[Backfill] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Get fee statistics
export async function GET(request: NextRequest) {
  try {
    const pool = getDatabasePool();
    if (!pool) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Get total fees recorded
    const feesResult = await pool.query(`
      SELECT 
        COUNT(*) as total_records,
        COALESCE(SUM(lister_fee), 0) as total_lister_fees,
        COALESCE(SUM(platform_fee), 0) as total_platform_fees,
        COUNT(CASE WHEN paid_out = TRUE THEN 1 END) as paid_out_count,
        COUNT(CASE WHEN paid_out = FALSE THEN 1 END) as unpaid_count
      FROM fees
    `);

    // Get transactions without fees
    const missingResult = await pool.query(`
      SELECT COUNT(*) as missing_count
      FROM transactions t
      WHERE t.type = 'buy' 
        AND t.status = 'completed'
        AND t.etf_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM fees f 
          WHERE f.etf_id = t.etf_id 
            AND f.created_at >= t.created_at - INTERVAL '1 minute'
            AND f.created_at <= t.created_at + INTERVAL '1 minute'
        )
    `);

    return NextResponse.json({
      success: true,
      stats: {
        totalRecords: parseInt(feesResult.rows[0].total_records),
        totalListerFees: parseFloat(feesResult.rows[0].total_lister_fees),
        totalPlatformFees: parseFloat(feesResult.rows[0].total_platform_fees),
        paidOutCount: parseInt(feesResult.rows[0].paid_out_count),
        unpaidCount: parseInt(feesResult.rows[0].unpaid_count),
        transactionsMissingFees: parseInt(missingResult.rows[0].missing_count),
      },
    });
  } catch (error: any) {
    console.error('[Fees Stats] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

