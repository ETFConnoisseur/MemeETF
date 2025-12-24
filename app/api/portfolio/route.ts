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
        availableBalance: 0,
      });
    }

    // Get all portfolio positions with ETF details
    let portfolioResult;
    try {
      portfolioResult = await pool.query(
      `SELECT p.*, e.id as etf_id, e.name, e.creator, e.contract_address, 
              e.market_cap_at_list, e.tokens, e.token_hash, e.created_at as etf_created_at
       FROM portfolio p
       JOIN etf_listings e ON p.etf_id = e.id
       WHERE p.user_id = $1`,
      [userId]
      );
    } catch (queryError: any) {
      console.error('[Portfolio API] Portfolio query failed:', queryError);
      if (queryError.code === '42P01') {
        // Table doesn't exist
        return NextResponse.json({
          success: true,
          holdings: [],
          totalValue: 0,
          totalPnl: 0,
          availableBalance: 0,
        });
      }
      throw queryError;
    }

    // Get user's wallet balance (in SOL)
    const walletResult = await pool.query(
      'SELECT sol_balance FROM wallets WHERE user_id = $1',
      [userId]
    );
    const availableBalanceSOL = walletResult.rows.length > 0 
      ? parseFloat(walletResult.rows[0].sol_balance) 
      : 0;

    // Get investment history for P/L calculation
    const investmentsResult = await pool.query(
      `SELECT etf_id, SUM(sol_amount) as total_invested
       FROM investments 
       WHERE user_id = $1
       GROUP BY etf_id`,
      [userId]
    );

    const investmentsByEtf: Record<string, number> = {};
    investmentsResult.rows.forEach(row => {
      investmentsByEtf[row.etf_id] = parseFloat(row.total_invested);
    });

    // Collect all token addresses to fetch current prices
    const allTokenAddresses: string[] = [];
    portfolioResult.rows.forEach(row => {
      const tokens = typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens;
      tokens.forEach((t: any) => {
        if (t.address && !allTokenAddresses.includes(t.address)) {
          allTokenAddresses.push(t.address);
        }
      });
    });

    // Fetch current market caps for all tokens
    const currentPrices = await fetchTokenPrices(allTokenAddresses);

    // Build holdings array with P/L calculations
    const holdings = portfolioResult.rows.map(row => {
      const tokens = typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens;
      const listedMC = parseFloat(row.market_cap_at_list) || 0;
      
      // Calculate current weighted MC based on live prices (for display)
      let currentMC = 0;
      tokens.forEach((token: any) => {
        const tokenCurrentMC = currentPrices[token.address] || token.market_cap || 0;
        const weight = token.weight || 0;
        currentMC += (tokenCurrentMC * weight / 100);
      });

      // Calculate performance as weighted average of individual token returns
      let performancePercentage = 0;
      tokens.forEach((token: any) => {
        const tokenCurrentMC = currentPrices[token.address] || token.market_cap || 0;
        const tokenListingMC = token.market_cap || 0;
        const weight = token.weight || 0;
        
        if (tokenListingMC > 0 && tokenCurrentMC > 0) {
          const tokenReturn = ((tokenCurrentMC - tokenListingMC) / tokenListingMC) * 100;
          performancePercentage += (tokenReturn * weight / 100);
        }
      });

      // Total SOL invested in this ETF
      const totalInvestedSOL = investmentsByEtf[row.etf_id] || parseFloat(row.current_value) || 0;
      
      // Calculate current value based on performance
      const currentValueSOL = totalInvestedSOL * (1 + performancePercentage / 100);
      
      const unrealizedPnlSOL = currentValueSOL - totalInvestedSOL;

      // Portfolio table: amount = tokens, current_value = invested SOL
      const tokensHeld = parseFloat(row.amount || 0);
      const positionInvestedSol = parseFloat(row.current_value || 0);
      // Use the actual position's invested SOL if available, otherwise fall back to investments sum
      const actualInvestedSOL = positionInvestedSol > 0 ? positionInvestedSol : totalInvestedSOL;

      return {
        etf: {
          id: row.etf_id,
          name: row.name,
          creator: row.creator,
          contract_address: row.contract_address,
          market_cap_at_list: listedMC,
          tokens: tokens,
          token_hash: row.token_hash,
          created_at: row.etf_created_at,
        },
        position: {
          user_id: row.user_id,
          etf_id: row.etf_id,
          amount: tokensHeld,
          tokens_held: tokensHeld,
          entry_price: listedMC,
          current_value: currentValueSOL,
          invested_sol: actualInvestedSOL,
        },
        tokens_held: tokensHeld,
        current_value: currentValueSOL,
        invested_sol: actualInvestedSOL,
        unrealized_pnl: unrealizedPnlSOL,
        performance_percentage: performancePercentage,
      };
    });

    // Total portfolio value in SOL
    const totalValueSOL = holdings.reduce((sum, h) => sum + h.current_value, 0);
    const totalInvestedSOL = holdings.reduce((sum, h) => sum + h.invested_sol, 0);
    const totalUnrealizedPnlSOL = holdings.reduce((sum, h) => sum + h.unrealized_pnl, 0);

    // Get realized P/L from sell transactions
    // Sum of pnl column if it exists, otherwise calculate from amount - fees for sells
    const realizedResult = await pool.query(
      `SELECT 
         COALESCE(SUM(COALESCE(pnl, 0)), 0) as total_pnl,
         COALESCE(SUM(CASE WHEN type = 'sell' THEN amount ELSE 0 END), 0) as total_sold,
         COALESCE(SUM(CASE WHEN type = 'sell' THEN fees ELSE 0 END), 0) as total_sell_fees
       FROM transactions
       WHERE user_id = $1 AND type = 'sell' AND status = 'completed'`,
      [userId]
    );

    const totalPnl = parseFloat(realizedResult.rows[0].total_pnl) || 0;
    const totalSold = parseFloat(realizedResult.rows[0].total_sold) || 0;
    const totalSellFees = parseFloat(realizedResult.rows[0].total_sell_fees) || 0;
    
    // If we have PnL recorded, use it. Otherwise, realized PnL is just -fees (since sells return at cost)
    const realizedPnlSOL = totalPnl !== 0 ? totalPnl : -totalSellFees;

    // Get transaction history
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
      availableBalance: availableBalanceSOL,
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
