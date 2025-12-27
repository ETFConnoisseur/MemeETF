import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { Connection, clusterApiUrl, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';

// Dev wallet that receives platform fees
const DEV_WALLET = 'F2Qgu6J59kfLAKZWMT258PwFYi1Q19WuaYPPTxLeYwjz';

/**
 * GET /api/admin/stats
 * Get admin dashboard statistics
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    if (!token || token.length < 32) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get database stats
    const pool = getDatabasePool();
    let dbStats = {
      totalEtfs: 0,
      totalUsers: 0,
      totalTransactions: 0,
      recentEtfs: [] as any[],
      recentTransactions: [] as any[],
    };

    if (pool) {
      try {
        // Total ETFs
        const etfCount = await pool.query('SELECT COUNT(*) FROM etf_listings');
        dbStats.totalEtfs = parseInt(etfCount.rows[0].count);

        // Total users (unique creators)
        const userCount = await pool.query('SELECT COUNT(DISTINCT creator) FROM etf_listings');
        dbStats.totalUsers = parseInt(userCount.rows[0].count);

        // Total transactions
        const txCount = await pool.query('SELECT COUNT(*) FROM transactions');
        dbStats.totalTransactions = parseInt(txCount.rows[0].count);

        // Recent ETFs
        const recentEtfs = await pool.query(`
          SELECT id, name, creator, market_cap_at_list, network, created_at
          FROM etf_listings
          ORDER BY created_at DESC
          LIMIT 10
        `);
        dbStats.recentEtfs = recentEtfs.rows;

        // Recent transactions
        const recentTx = await pool.query(`
          SELECT id, type, user_wallet, amount, tx_hash, created_at
          FROM transactions
          ORDER BY created_at DESC
          LIMIT 10
        `);
        dbStats.recentTransactions = recentTx.rows;
      } catch (dbError: any) {
        console.error('[Admin Stats] Database error:', dbError.message);
      }
    }

    // Get on-chain stats
    let onChainStats = {
      devWalletBalance: 0,
      devWalletBalanceMainnet: 0,
    };

    try {
      // Devnet balance
      const devnetConnection = new Connection(clusterApiUrl('devnet'), 'confirmed');
      const devnetBalance = await devnetConnection.getBalance(new PublicKey(DEV_WALLET));
      onChainStats.devWalletBalance = devnetBalance / LAMPORTS_PER_SOL;

      // Mainnet balance
      const mainnetConnection = new Connection(
        process.env.MAINNET_RPC_URL || process.env.MAINNET_RPC_FALLBACK || clusterApiUrl('mainnet-beta'),
        'confirmed'
      );
      const mainnetBalance = await mainnetConnection.getBalance(new PublicKey(DEV_WALLET));
      onChainStats.devWalletBalanceMainnet = mainnetBalance / LAMPORTS_PER_SOL;
    } catch (chainError: any) {
      console.error('[Admin Stats] Chain error:', chainError.message);
    }

    return NextResponse.json({
      success: true,
      stats: {
        database: dbStats,
        onChain: onChainStats,
        devWallet: DEV_WALLET,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Admin Stats] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
