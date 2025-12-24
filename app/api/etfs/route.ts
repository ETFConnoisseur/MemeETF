import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filter = searchParams.get('filter') || 'all';
    const creator = searchParams.get('creator');
    const limit = parseInt(searchParams.get('limit') || '100');

    const pool = getDatabasePool();
    
    if (!pool) {
      console.error('[ETFs API] Database pool is null');
      return NextResponse.json({ success: true, etfs: [] });
    }
    
    let query: string;
    let params: any[];

    if (creator) {
      // Filter by creator wallet address
      query = `SELECT * FROM etf_listings WHERE creator = $1 ORDER BY created_at DESC LIMIT $2`;
      params = [creator, limit];
    } else {
      // Get all ETFs
      query = `SELECT * FROM etf_listings ORDER BY created_at DESC LIMIT $1`;
      params = [limit];
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
