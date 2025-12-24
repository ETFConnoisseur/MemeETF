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
    const limit = parseInt(searchParams.get('limit') || '50');

    const pool = getDatabasePool();

    if (!pool) {
      return NextResponse.json({ success: true, leaderboard: [] });
    }

    // Get ETFs with creator info
    const result = await pool.query(`
      SELECT e.*, u.x_username,
                 COUNT(i.id) as investment_count,
                 COALESCE(SUM(i.sol_amount), 0) as total_invested
          FROM etf_listings e
      LEFT JOIN users u ON e.creator = u.wallet_address
          LEFT JOIN investments i ON e.id = i.etf_id
      GROUP BY e.id, u.x_username
          LIMIT $1
    `, [limit]);

    // Collect all token addresses
    const allTokenAddresses: string[] = [];
    result.rows.forEach(row => {
      const tokens = typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens;
      tokens.forEach((t: any) => {
        if (t.address && !allTokenAddresses.includes(t.address)) {
          allTokenAddresses.push(t.address);
        }
      });
    });

    // Fetch current prices for all tokens
    const currentPrices = await fetchTokenPrices(allTokenAddresses.slice(0, 30)); // Limit to avoid rate limits

    // Calculate returns for each ETF
    const leaderboardEntries = result.rows.map((row) => {
      const tokens = typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens;
      const listedMC = parseFloat(row.market_cap_at_list) || 0;
      
      // Calculate current weighted MC (for display)
      let currentMC = 0;
      tokens.forEach((token: any) => {
        const tokenCurrentMC = currentPrices[token.address] || token.market_cap || 0;
        const weight = token.weight || 0;
        currentMC += (tokenCurrentMC * weight / 100);
      });

      // Calculate return percentage as weighted average of individual token returns
      let returnPercentage = 0;
      tokens.forEach((token: any) => {
        const tokenCurrentMC = currentPrices[token.address] || token.market_cap || 0;
        const tokenListingMC = token.market_cap || 0;
        const weight = token.weight || 0;
        
        if (tokenListingMC > 0 && tokenCurrentMC > 0) {
          const tokenReturn = ((tokenCurrentMC - tokenListingMC) / tokenListingMC) * 100;
          returnPercentage += (tokenReturn * weight / 100);
        }
      });

      return {
        etf_id: row.id,
        etf_name: row.name,
        user_id: row.creator,
        twitter_handle: row.x_username || null,
        return_percentage: returnPercentage,
        market_cap_at_list: listedMC,
        current_market_cap: currentMC,
        investment_count: parseInt(row.investment_count),
        total_invested: parseFloat(row.total_invested || 0),
        created_at: row.created_at,
      };
    });

    // Sort by return percentage descending and add ranks
    leaderboardEntries.sort((a, b) => b.return_percentage - a.return_percentage);
    
    const leaderboard = leaderboardEntries.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    return NextResponse.json({ success: true, leaderboard });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json({ success: true, leaderboard: [] });
  }
}
