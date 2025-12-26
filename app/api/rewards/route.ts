import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const network = searchParams.get('network') || 'devnet';

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID (wallet address) required' },
        { status: 400 }
      );
    }

    const pool = getDatabasePool();

    if (!pool) {
      return NextResponse.json({
        success: true,
        total_claimable: 0,
        total_claimed: 0,
        rewards: [],
        history: [],
      });
    }

    // Get unclaimed fees (total_claimable) - fees earned as ETF creator (for the current network)
    const unclaimedResult = await pool.query(
      `SELECT COALESCE(SUM(f.lister_fee), 0) as total
       FROM fees f
       JOIN etf_listings e ON f.etf_id = e.id
       WHERE e.creator = $1 AND f.paid_out = FALSE AND e.network = $2`,
      [userId, network]
    );
    const totalClaimable = parseFloat(unclaimedResult.rows[0].total || 0);

    // Get claimed fees (total_claimed) (for the current network)
    const claimedResult = await pool.query(
      `SELECT COALESCE(SUM(f.lister_fee), 0) as total
       FROM fees f
       JOIN etf_listings e ON f.etf_id = e.id
       WHERE e.creator = $1 AND f.paid_out = TRUE AND e.network = $2`,
      [userId, network]
    );
    const totalClaimed = parseFloat(claimedResult.rows[0].total || 0);

    // Get fee history for chart (for the current network)
    const historyResult = await pool.query(
      `SELECT f.created_at as date, f.lister_fee as amount,
              CASE WHEN f.paid_out THEN 'claimed' ELSE 'earned' END as type
       FROM fees f
       JOIN etf_listings e ON f.etf_id = e.id
       WHERE e.creator = $1 AND e.network = $2
       ORDER BY f.created_at DESC
       LIMIT 50`,
      [userId, network]
    );

    const history = historyResult.rows.map(row => ({
      date: row.date,
      amount: parseFloat(row.amount),
      type: row.type,
    }));

    // Get individual rewards by ETF (for the current network)
    const rewardsResult = await pool.query(
      `SELECT e.id, e.name,
              COALESCE(SUM(CASE WHEN f.paid_out = FALSE THEN f.lister_fee ELSE 0 END), 0) as unclaimed,
              COALESCE(SUM(f.lister_fee), 0) as total_earned
       FROM etf_listings e
       LEFT JOIN fees f ON e.id = f.etf_id
       WHERE e.creator = $1 AND e.network = $2
       GROUP BY e.id, e.name
       ORDER BY total_earned DESC`,
      [userId, network]
    );

    const rewards = rewardsResult.rows.map(row => ({
      etf_id: row.id,
      etf_name: row.name,
      unclaimed: parseFloat(row.unclaimed),
      total_earned: parseFloat(row.total_earned),
    }));

    return NextResponse.json({
      success: true,
      total_claimable: totalClaimable,
      total_claimed: totalClaimed,
      rewards,
      history,
    });
  } catch (error) {
    console.error('Error fetching rewards:', error);
    return NextResponse.json({
      success: true,
      total_claimable: 0,
      total_claimed: 0,
      rewards: [],
      history: [],
    });
  }
}
