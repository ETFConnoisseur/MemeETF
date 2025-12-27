import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { getKOLWallets } from '@/lib/database/queries';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filter = searchParams.get('filter') || 'all';
    const creator = searchParams.get('creator');
    const network = searchParams.get('network') || 'devnet';
    const limit = parseInt(searchParams.get('limit') || '100');

    const pool = getDatabasePool();

    if (!pool) {
      console.error('[ETFs API] Database pool is null');
      return NextResponse.json({ success: true, etfs: [] });
    }

    // Ensure user_labels table exists
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_labels (
          wallet_address VARCHAR(64) PRIMARY KEY,
          label VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (tableError) {
      console.log('[ETFs API] user_labels table check:', tableError);
    }

    let query: string;
    let params: any[];

    if (creator) {
      // Filter by creator wallet address and network
      query = `SELECT * FROM etf_listings WHERE creator = $1 AND network = $2 ORDER BY created_at DESC LIMIT $3`;
      params = [creator, network, limit];
    } else if (filter === 'kol') {
      // Get ETFs only from KOL-labeled wallets
      const kolWallets = await getKOLWallets();

      if (kolWallets.length === 0) {
        // No KOLs yet, return empty
        return NextResponse.json({ success: true, etfs: [] });
      }

      // Build IN clause with placeholders
      const placeholders = kolWallets.map((_, i) => `$${i + 2}`).join(', ');
      query = `SELECT * FROM etf_listings WHERE network = $1 AND creator IN (${placeholders}) ORDER BY created_at DESC LIMIT $${kolWallets.length + 2}`;
      params = [network, ...kolWallets, limit];
    } else {
      // Get all ETFs for the network
      query = `SELECT * FROM etf_listings WHERE network = $1 ORDER BY created_at DESC LIMIT $2`;
      params = [network, limit];
    }

    let result;
    try {
      result = await pool.query(query, params);
    } catch (queryError: any) {
      console.error('[ETFs API] Query failed:', queryError);
      // Check if table doesn't exist
      if (queryError.code === '42P01') {
        console.error('[ETFs API] Table etf_listings does not exist');
        return NextResponse.json({ success: true, etfs: [] });
      }
      throw queryError;
    }

    const etfs = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      creator: row.creator,
      contract_address: row.contract_address,
      market_cap_at_list: parseFloat(row.market_cap_at_list),
      tokens: typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens,
      token_hash: row.token_hash,
      created_at: row.created_at,
    }));

    return NextResponse.json({ success: true, etfs });
  } catch (error: any) {
    console.error('[ETFs API] Error fetching ETFs:', error);
    console.error('[ETFs API] Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
    return NextResponse.json(
      { 
        error: 'Failed to fetch ETFs',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
