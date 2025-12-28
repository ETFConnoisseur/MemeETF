import { NextRequest, NextResponse } from 'next/server';
import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js';
import { getEtfPda } from '@/lib/solana/program';
import { generateTokenHash } from '@/lib/utils/tokenHash';
import { getDatabasePool } from '@/lib/database/connection';

/**
 * POST /api/etfs/confirm
 *
 * Called after user signs and sends the ETF creation transaction
 * Verifies the transaction succeeded and saves ETF to database
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, tokens, userWallet, txSignature, network = 'devnet', tweetUrl } = body;

    // Validation
    if (!name || !tokens || !userWallet || !txSignature) {
      return NextResponse.json({
        error: 'Missing required fields: name, tokens, userWallet, txSignature'
      }, { status: 400 });
    }

    // Validate wallet
    let userPubkey: PublicKey;
    try {
      userPubkey = new PublicKey(userWallet);
    } catch {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    // Get connection (with fallback for mainnet)
    const isDevnet = network === 'devnet';
    const rpcUrl = isDevnet
      ? clusterApiUrl('devnet')
      : process.env.MAINNET_RPC_URL || process.env.MAINNET_RPC_FALLBACK || clusterApiUrl('mainnet-beta');
    const connection = new Connection(rpcUrl, 'confirmed');

    // Verify transaction was confirmed
    console.log('[ETF Confirm] Verifying transaction:', txSignature);
    const txStatus = await connection.getSignatureStatus(txSignature);

    if (!txStatus.value || txStatus.value.err) {
      return NextResponse.json({
        error: 'Transaction failed or not found',
        details: txStatus.value?.err
      }, { status: 400 });
    }

    if (txStatus.value.confirmationStatus !== 'confirmed' && txStatus.value.confirmationStatus !== 'finalized') {
      return NextResponse.json({
        error: 'Transaction not yet confirmed. Please wait and try again.'
      }, { status: 400 });
    }

    // Verify ETF account exists on-chain
    const [etfPda] = getEtfPda(userPubkey);
    const etfAccount = await connection.getAccountInfo(etfPda);

    if (!etfAccount) {
      return NextResponse.json({
        error: 'ETF account not found on-chain. Transaction may have failed.'
      }, { status: 400 });
    }

    console.log('[ETF Confirm] ETF account verified on-chain:', etfPda.toBase58());

    // Calculate initial market cap
    let initialMarketCap = 0;
    for (const token of tokens) {
      const mc = token.market_cap || 0;
      const weight = token.weight || 0;
      if (typeof mc === 'number' && !isNaN(mc) && isFinite(mc) && mc > 0) {
        initialMarketCap += (mc * weight) / 100;
      }
    }

    // Save to database
    const pool = getDatabasePool();
    if (!pool) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const tokenHash = generateTokenHash(tokens);

    // Check if already saved (idempotency)
    const existingCheck = await pool.query(
      'SELECT id FROM etf_listings WHERE contract_address = $1',
      [etfPda.toBase58()]
    );

    if (existingCheck.rows.length > 0) {
      // Already saved, return success
      return NextResponse.json({
        success: true,
        etf: {
          id: existingCheck.rows[0].id,
          name,
          contract_address: etfPda.toBase58(),
        },
        message: 'ETF already registered',
        txHash: txSignature,
      });
    }

    // Insert new ETF
    const result = await pool.query(
      `INSERT INTO etf_listings (name, creator, contract_address, market_cap_at_list, tokens, token_hash, network, twitter_link)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, creator, contract_address, market_cap_at_list, tokens, network, twitter_link, created_at`,
      [name, userWallet, etfPda.toBase58(), initialMarketCap, JSON.stringify(tokens), tokenHash, network, tweetUrl || null]
    );

    const etf = {
      id: result.rows[0].id,
      name: result.rows[0].name,
      creator: result.rows[0].creator,
      contract_address: result.rows[0].contract_address,
      market_cap_at_list: parseFloat(result.rows[0].market_cap_at_list),
      tokens: typeof result.rows[0].tokens === 'string' ? JSON.parse(result.rows[0].tokens) : result.rows[0].tokens,
      tweet_url: result.rows[0].twitter_link,
      created_at: result.rows[0].created_at,
      network: result.rows[0].network,
    };

    console.log('[ETF Confirm] ETF saved to database:', etf.id);

    return NextResponse.json({
      success: true,
      etf,
      txHash: txSignature,
      network,
      explorerUrl: isDevnet
        ? `https://solscan.io/tx/${txSignature}?cluster=devnet`
        : `https://solscan.io/tx/${txSignature}`
    });

  } catch (error: any) {
    console.error('[ETF Confirm] Error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to confirm ETF creation',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
