import { NextRequest, NextResponse } from 'next/server';
import { getWalletBalance, getConnection } from '@/lib/solana/wallet';
import { getDatabasePool } from '@/lib/database/connection';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const publicKey = searchParams.get('publicKey');

    if (!publicKey) {
      return NextResponse.json({ error: 'Public key required' }, { status: 400 });
    }

    const network = (searchParams.get('network') as 'mainnet' | 'devnet') || 'devnet';
    const connection = getConnection(network);
    const balance = await getWalletBalance(publicKey, connection);

    return NextResponse.json({
      success: true,
      balance,
      publicKey,
    });
  } catch (error) {
    console.error('Error fetching balance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch balance' },
      { status: 500 }
    );
  }
}

