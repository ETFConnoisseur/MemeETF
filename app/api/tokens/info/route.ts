import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana/wallet';
import { fetchTokenData } from '@/lib/utils/tokenData';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const address = searchParams.get('address');
    const network = (searchParams.get('network') as 'mainnet' | 'devnet') || 'mainnet';

    if (!address) {
      return NextResponse.json(
        { error: 'Token address required' },
        { status: 400 }
      );
    }

    const connection = getConnection(network);
    
    // Fetch token data from multiple sources
    let tokenData;
    try {
      tokenData = await fetchTokenData(address, connection, {
        birdeyeApiKey: process.env.BIRDEYE_API_KEY,
        solscanApiKey: process.env.SOLSCAN_API_KEY,
      });
    } catch (error) {
      console.error('Error fetching token data:', error);
      // Return basic token structure on error
      tokenData = {
        name: 'Unknown Token',
        symbol: 'UNKNOWN',
        decimals: 9,
        market_cap: 0,
        pfp_url: undefined,
      };
    }

    // Return in the format expected by frontend
    return NextResponse.json({
      address: address,
      name: tokenData.name,
      symbol: tokenData.symbol,
      image: tokenData.pfp_url || '',
      marketCap: tokenData.market_cap,
      decimals: tokenData.decimals,
    });
  } catch (error) {
    console.error('Error in token info route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch token info' },
      { status: 500 }
    );
  }
}

