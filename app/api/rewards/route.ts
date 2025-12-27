import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const network = searchParams.get('network') || 'devnet';

    const pool = getDatabasePool();

    if (!pool) {
      return NextResponse.json({
        success: true,
        transactions: [],
      });
    }

    // Get all transactions for the network
    const result = await pool.query(
      `SELECT t.user_id as wallet, t.tx_signature as signature, t.amount, t.created_at as date
       FROM transactions t
       WHERE t.network = $1 AND t.tx_signature IS NOT NULL
       ORDER BY t.created_at DESC
       LIMIT 100`,
      [network]
    );

    const transactions = result.rows.map(row => ({
      wallet: row.wallet,
      signature: row.signature,
      amount: parseFloat(row.amount || 0),
      date: row.date,
    }));

    return NextResponse.json({
      success: true,
      transactions,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json({
      success: true,
      transactions: [],
    });
  }
}
