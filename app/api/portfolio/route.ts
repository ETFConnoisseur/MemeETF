import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';

// Fetch current token prices from DexScreener
async function fetchTokenPrices(addresses: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  for (const address of addresses) {
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
      if (response.ok) {
        const data = await response.json();
        const pair = data.pairs?.[0];
        if (pair?.marketCap) {
          prices[address] = parseFloat(pair.marketCap);
        } else if (pair?.fdv) {
          prices[address] = parseFloat(pair.fdv);
        }
      }
    } catch (e) {
      // Ignore individual failures
    }
  }

  return prices;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID (wallet address) required' },
        { status: 400 }
      );
    }

    const pool = getDatabasePool();

    if (!pool) {
      console.error('[Portfolio API] Database pool is null');
      return NextResponse.json({
        success: true,
        holdings: [],
        totalValue: 0,
        totalPnl: 0,
        protocolBalance: 0,
      });
    }

    // Get user's protocol balance
    const userResult = await pool.query(
      'SELECT protocol_sol_balance FROM users WHERE wallet_address = $1',
      [userId]
    );
    const protocolBalance = userResult.rows.length > 0
      ? parseFloat(userResult.rows[0].protocol_sol_balance || '0')
      : 0;

    // Get all active ETF positions (not sold)
    let investmentsResult;
    try {
      investmentsResult = await pool.query(
        `SELECT i.*, e.name as etf_name, e.creator, e.tokens as etf_tokens
         FROM investments i
         JOIN etf_listings e ON i.etf_id = e.id
         WHERE i.user_id = $1 AND i.is_sold = FALSE
         ORDER BY i.created_at DESC`,
        [userId]
      );
    } catch (queryError: any) {
      console.error('[Portfolio API] Investments query failed:', queryError);
      if (queryError.code === '42P01') {
        // Table doesn't exist
        return NextResponse.json({
          success: true,
          holdings: [],
          totalValue: 0,
          totalPnl: 0,
          protocolBalance,
        });
      }
      throw queryError;
    }

    // Collect all token addresses to fetch current prices
    const allTokenAddresses: string[] = [];
    investmentsResult.rows.forEach(row => {
      const tokensPurchased = typeof row.tokens_purchased === 'string'
        ? JSON.parse(row.tokens_purchased)
        : row.tokens_purchased || [];

      tokensPurchased.forEach((t: any) => {
        if (t.mint && !allTokenAddresses.includes(t.mint)) {
          allTokenAddresses.push(t.mint);
        }
      });
    });

    // Fetch current market caps for all tokens
    const currentPrices = await fetchTokenPrices(allTokenAddresses);

    // Build holdings array with P/L calculations
    const holdings = investmentsResult.rows.map(row => {
      const tokensPurchased = typeof row.tokens_purchased === 'string'
        ? JSON.parse(row.tokens_purchased)
        : row.tokens_purchased || [];

      const purchaseMC = parseFloat(row.purchase_mc) || 0;
      const solInvested = parseFloat(row.sol_invested) || 0;

      // Calculate current weighted MC based on live prices
      let currentMC = 0;
      tokensPurchased.forEach((token: any) => {
        const tokenCurrentMC = currentPrices[token.mint] || 0;
        const weight = token.weight || 0;
        currentMC += (tokenCurrentMC * weight / 100);
      });

      // Calculate performance percentage
      let performancePercentage = 0;
      if (purchaseMC > 0 && currentMC > 0) {
        performancePercentage = ((currentMC - purchaseMC) / purchaseMC) * 100;
      }

      // Calculate current value in SOL based on performance
      const currentValueSOL = solInvested * (1 + performancePercentage / 100);
      const unrealizedPnlSOL = currentValueSOL - solInvested;

      return {
        investmentId: row.id,
        etf: {
          id: row.etf_id,
          name: row.etf_name,
          creator: row.creator,
        },
        solInvested,
        currentValue: currentValueSOL,
        unrealizedPnl: unrealizedPnlSOL,
        performancePercentage,
        purchaseMC,
        currentMC,
        purchase24hChange: parseFloat(row.purchase_24h_change) || 0,
        purchasedAt: row.created_at,
        tokensPurchased: tokensPurchased.map((t: any) => ({
          symbol: t.symbol,
          mint: t.mint,
          amount: t.amount,
          weight: t.weight,
        })),
      };
    });

    // Total portfolio value in SOL
    const totalValueSOL = holdings.reduce((sum, h) => sum + h.currentValue, 0);
    const totalInvestedSOL = holdings.reduce((sum, h) => sum + h.solInvested, 0);
    const totalUnrealizedPnlSOL = holdings.reduce((sum, h) => sum + h.unrealizedPnl, 0);

    // Get realized P/L from sold investments
    const soldInvestmentsResult = await pool.query(
      `SELECT
         COALESCE(SUM(sol_received), 0) as total_received,
         COALESCE(SUM(sol_invested), 0) as total_invested_sold
       FROM investments
       WHERE user_id = $1 AND is_sold = TRUE`,
      [userId]
    );

    const totalReceived = parseFloat(soldInvestmentsResult.rows[0].total_received) || 0;
    const totalInvestedSold = parseFloat(soldInvestmentsResult.rows[0].total_invested_sold) || 0;
    const realizedPnlSOL = totalReceived - totalInvestedSold;

    // Get recent transaction history
    const transactionsResult = await pool.query(
      `SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );

    const transactions = transactionsResult.rows.map(row => ({
      id: row.id,
      type: row.type,
      amount: parseFloat(row.amount),
      fees: parseFloat(row.fees || 0),
      etf_id: row.etf_id,
      tx_hash: row.tx_hash,
      status: row.status,
      created_at: row.created_at,
    }));

    return NextResponse.json({
      success: true,
      holdings,
      // All values in SOL
      totalValue: totalValueSOL,
      totalInvested: totalInvestedSOL,
      unrealizedPnl: totalUnrealizedPnlSOL,
      realizedPnl: realizedPnlSOL,
      protocolBalance,
      transactions,
    });
  } catch (error: any) {
    const userId = request.nextUrl.searchParams.get('userId');
    console.error('[Portfolio API] Error fetching portfolio:', error);
    console.error('[Portfolio API] Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      userId: userId || 'unknown',
    });
    return NextResponse.json(
      {
        error: 'Failed to fetch portfolio',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
