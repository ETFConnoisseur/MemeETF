import { NextRequest, NextResponse } from 'next/server';
import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js';
import { buildUnsignedInitializeEtf, getEtfPda } from '@/lib/solana/program';
import { generateTokenHash } from '@/lib/utils/tokenHash';
import { getDatabasePool } from '@/lib/database/connection';

/**
 * POST /api/etfs/prepare
 *
 * NON-CUSTODIAL: Builds unsigned ETF creation transaction for user to sign
 * User signs directly with Phantom/Solflare - no private keys stored
 *
 * Flow:
 * 1. Validate ETF parameters
 * 2. Build unsigned initialize_etf transaction
 * 3. Return serialized transaction to frontend
 * 4. User signs and sends via their wallet
 */

const MAX_TOKENS_PER_ETF = 10;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, tokens, userWallet, network = 'devnet' } = body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'ETF name is required' }, { status: 400 });
    }

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return NextResponse.json({ error: 'At least one token is required' }, { status: 400 });
    }

    if (tokens.length > MAX_TOKENS_PER_ETF) {
      return NextResponse.json({ error: `Maximum ${MAX_TOKENS_PER_ETF} tokens allowed` }, { status: 400 });
    }

    if (!userWallet) {
      return NextResponse.json({ error: 'User wallet address required' }, { status: 400 });
    }

    if (network !== 'devnet' && network !== 'mainnet-beta') {
      return NextResponse.json({ error: 'Invalid network' }, { status: 400 });
    }

    // Validate user wallet
    let userPubkey: PublicKey;
    try {
      userPubkey = new PublicKey(userWallet);
    } catch {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    // Validate token addresses and build pubkey array
    const tokenPubkeys: PublicKey[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (!t.address || typeof t.address !== 'string') {
        return NextResponse.json({ error: `Token ${i + 1} missing address` }, { status: 400 });
      }
      try {
        tokenPubkeys.push(new PublicKey(t.address.trim()));
      } catch {
        return NextResponse.json({ error: `Token ${i + 1} has invalid address` }, { status: 400 });
      }
    }

    // Check for duplicate ETF (same tokens on same network)
    const pool = getDatabasePool();
    if (pool) {
      const tokenHash = generateTokenHash(tokens);
      const duplicateCheck = await pool.query(
        'SELECT id FROM etf_listings WHERE token_hash = $1 AND network = $2',
        [tokenHash, network]
      );
      if (duplicateCheck.rows.length > 0) {
        return NextResponse.json({
          error: 'An ETF with these exact tokens already exists on this network'
        }, { status: 400 });
      }
    }

    // Check if user already has an ETF PDA on-chain
    const isDevnet = network === 'devnet';
    const rpcUrl = isDevnet
      ? clusterApiUrl('devnet')
      : process.env.MAINNET_RPC_URL || process.env.MAINNET_RPC_FALLBACK || clusterApiUrl('mainnet-beta');
    const connection = new Connection(rpcUrl, 'confirmed');

    const [etfPda] = getEtfPda(userPubkey);
    const existingAccount = await connection.getAccountInfo(etfPda);
    if (existingAccount) {
      return NextResponse.json({
        error: 'You already have an ETF on-chain. Delete it first to create a new one.'
      }, { status: 400 });
    }

    console.log('[ETF Prepare] Building unsigned transaction...');
    console.log('[ETF Prepare] User wallet:', userWallet);
    console.log('[ETF Prepare] Network:', network);
    console.log('[ETF Prepare] Tokens:', tokens.length);

    // Build unsigned transaction
    const { transaction, etfPda: pdaAddress } = await buildUnsignedInitializeEtf(
      connection,
      userPubkey,
      tokenPubkeys
    );

    console.log('[ETF Prepare] Transaction built successfully');
    console.log('[ETF Prepare] ETF PDA:', pdaAddress);

    return NextResponse.json({
      success: true,
      transaction,
      etfPda: pdaAddress,
      name,
      tokens,
      network,
      userWallet,
      message: 'Sign this transaction in your wallet to create the ETF'
    });

  } catch (error: any) {
    console.error('[ETF Prepare] Error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to prepare ETF creation',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
