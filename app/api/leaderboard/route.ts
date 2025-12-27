import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';

// Fetch current token prices from DexScreener with better error handling
async function fetchTokenPrices(addresses: string[]): Promise<Record<string, number | null>> {
  const prices: Record<string, number | null> = {};

  // Process in batches to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);

    await Promise.all(batch.map(async (address) => {
      try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
          headers: { 'Accept': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          const pair = data.pairs?.[0];
          if (pair?.marketCap) {
            prices[address] = parseFloat(pair.marketCap);
          } else if (pair?.fdv) {
            prices[address] = parseFloat(pair.fdv);
          } else {
            prices[address] = null; // Token not found on DexScreener
          }
        } else {
          prices[address] = null;
        }
      } catch (e) {
        prices[address] = null;
      }
    }));

    // Small delay between batches to avoid rate limits
    if (i + batchSize < addresses.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return prices;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const network = searchParams.get('network') || 'devnet';
    const limit = parseInt(searchParams.get('limit') || '50');

    const pool = getDatabasePool();

    if (!pool) {
      return NextResponse.json({ success: true, leaderboard: [] });
    }

    // Get ETFs with creator info (filtered by network)
    const result = await pool.query(`
      SELECT e.*, u.x_username,
                 COUNT(i.id) as investment_count,
                 COALESCE(SUM(i.sol_amount), 0) as total_invested
          FROM etf_listings e
      LEFT JOIN users u ON e.creator = u.wallet_address
          LEFT JOIN investments i ON e.id = i.etf_id AND i.network = $1
      WHERE e.network = $1
      GROUP BY e.id, u.x_username
          LIMIT $2
    `, [network, limit]);

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
    const currentPrices = await fetchTokenPrices(allTokenAddresses.slice(0, 50)); // Increased limit

    // Calculate returns for each ETF - matching ETFDetail.tsx calculation
    const leaderboardEntries = result.rows.map((row) => {
      const tokens = typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens;

      // Calculate listed market cap (weighted sum of token MCs at listing)
      const listedMC = parseFloat(row.market_cap_at_list) || tokens.reduce((sum: number, token: any) => {
        return sum + ((token.market_cap || 0) * (token.weight || 0) / 100);
      }, 0);

      // Calculate current weighted MC using live prices
      // Only use tokens where we successfully got a current price
      let currentMC = 0;
      let hasLiveData = false;

      tokens.forEach((token: any) => {
        const weight = token.weight || 0;
        const livePrice = currentPrices[token.address];

        if (livePrice !== null && livePrice !== undefined) {
          // We have live data for this token
          currentMC += (livePrice * weight / 100);
          hasLiveData = true;
        } else {
          // No live data - use the listing market cap for this token
          // This maintains the same calculation method as ETFDetail
          currentMC += ((token.market_cap || 0) * weight / 100);
        }
      });

      // Calculate return percentage: (current - listed) / listed * 100
      // This matches the ETFDetail.tsx calculation exactly
      let returnPercentage = 0;
      if (listedMC > 0 && currentMC > 0) {
        returnPercentage = ((currentMC - listedMC) / listedMC) * 100;
      }

      return {
        etf_id: row.id,
        etf_name: row.name,
        user_id: row.creator,
        twitter_handle: row.x_username || null,
        return_percentage: returnPercentage,
        market_cap_at_list: listedMC,
        current_market_cap: currentMC,
        has_live_data: hasLiveData,
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

    // Add cache headers to allow fresh data on each request
    return NextResponse.json(
      { success: true, leaderboard },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json({ success: true, leaderboard: [] });
  }
}
