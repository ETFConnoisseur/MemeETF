import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const network = searchParams.get('network') || 'devnet';
    const creator = searchParams.get('creator');

    const pool = getDatabasePool();

    if (!pool) {
      return NextResponse.json({
        success: true,
        transactions: [],
        totalFees: 0,
        unclaimedFees: 0,
      });
    }

    // If no creator specified, return empty
    if (!creator) {
      return NextResponse.json({
        success: true,
        transactions: [],
        totalFees: 0,
        unclaimedFees: 0,
      });
    }

    // Get fee transactions for ETFs created by this wallet
    // Join fees with investments to get buyer info and swap signatures
    const result = await pool.query(
      `SELECT
         i.user_id as buyer_wallet,
         f.lister_fee as amount,
         f.created_at as date,
         f.paid_out,
         e.name as etf_name,
         e.id as etf_id,
         (SELECT is2.tx_signature FROM investment_swaps is2
          WHERE is2.investment_id = i.id
          ORDER BY is2.created_at LIMIT 1) as signature
       FROM fees f
       JOIN etf_listings e ON f.etf_id = e.id
       JOIN investments i ON i.etf_id = e.id
         AND i.created_at >= f.created_at - INTERVAL '1 minute'
         AND i.created_at <= f.created_at + INTERVAL '1 minute'
       WHERE e.creator = $1 AND e.network = $2
       ORDER BY f.created_at DESC
       LIMIT 100`,
      [creator, network]
    );

    const transactions = result.rows.map(row => ({
      wallet: row.buyer_wallet,
      signature: row.signature || '',
      amount: parseFloat(row.amount || 0),
      date: row.date,
      etfName: row.etf_name,
      etfId: row.etf_id,
      paidOut: row.paid_out,
    }));

    // Get total and unclaimed fees
    const statsResult = await pool.query(
      `SELECT
         COALESCE(SUM(f.lister_fee), 0) as total_fees,
         COALESCE(SUM(CASE WHEN f.paid_out = FALSE THEN f.lister_fee ELSE 0 END), 0) as unclaimed_fees
       FROM fees f
       JOIN etf_listings e ON f.etf_id = e.id
       WHERE e.creator = $1 AND e.network = $2`,
      [creator, network]
    );

    return NextResponse.json({
      success: true,
      transactions,
      totalFees: parseFloat(statsResult.rows[0]?.total_fees || 0),
      unclaimedFees: parseFloat(statsResult.rows[0]?.unclaimed_fees || 0),
    });
  } catch (error) {
    console.error('Error fetching fee transactions:', error);
    return NextResponse.json({
      success: true,
      transactions: [],
      totalFees: 0,
      unclaimedFees: 0,
    });
  }
}
