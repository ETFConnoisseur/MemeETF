import { NextRequest, NextResponse } from 'next/server';
import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js';
import { buildUnsignedEtfPurchase } from '@/lib/solana/jupiterSwap';
import { getDatabasePool } from '@/lib/database/connection';

/**
 * POST /api/investments/prepare
 *
 * NON-CUSTODIAL: Builds unsigned transactions for user to sign in their wallet
 * No private keys are stored or used on the backend
 *
 * Flow:
 * 1. User calls this endpoint with ETF details and wallet address
 * 2. Backend fetches ETF from database to get the on-chain PDA (contract_address)
 * 3. Backend builds unsigned Jupiter swap transactions + program transaction
 * 4. Returns serialized transactions to frontend
 * 5. Frontend prompts user to sign with Phantom/Solflare
 * 6. Frontend sends signed transactions to blockchain
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      etfId,
      solAmount,
      userWallet,
      creatorWallet,
      tokens,
      network = 'devnet'
    } = body;

    // Validation
    if (!etfId) {
      return NextResponse.json({ error: 'ETF ID required' }, { status: 400 });
    }
    if (!solAmount || typeof solAmount !== 'number' || solAmount <= 0) {
      return NextResponse.json({ error: 'Valid SOL amount required' }, { status: 400 });
    }
    if (!userWallet) {
      return NextResponse.json({ error: 'User wallet address required' }, { status: 400 });
    }
    if (!creatorWallet) {
      return NextResponse.json({ error: 'Creator wallet address required' }, { status: 400 });
    }
    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return NextResponse.json({ error: 'Token list required' }, { status: 400 });
    }
    if (network !== 'devnet' && network !== 'mainnet-beta') {
      return NextResponse.json({ error: 'Invalid network' }, { status: 400 });
    }

    // Validate wallet addresses
    let userPubkey: PublicKey;
    let creatorPubkey: PublicKey;
    try {
      userPubkey = new PublicKey(userWallet);
      creatorPubkey = new PublicKey(creatorWallet);
    } catch {
      return NextResponse.json({ error: 'Invalid wallet address format' }, { status: 400 });
    }

    // Validate token addresses
    const tokenMints: PublicKey[] = [];
    const tokenSymbols: string[] = [];
    const tokenWeights: number[] = [];

    for (const token of tokens) {
      if (!token.address || !token.symbol || !token.weight) {
        return NextResponse.json({
          error: 'Each token must have address, symbol, and weight'
        }, { status: 400 });
      }
      try {
        tokenMints.push(new PublicKey(token.address));
        tokenSymbols.push(token.symbol);
        tokenWeights.push(parseFloat(token.weight));
      } catch {
        return NextResponse.json({
          error: `Invalid token address: ${token.address}`
        }, { status: 400 });
      }
    }

    // Validate weights sum to 100
    const totalWeight = tokenWeights.reduce((sum, w) => sum + w, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      return NextResponse.json({
        error: `Token weights must sum to 100, got ${totalWeight}`
      }, { status: 400 });
    }

    console.log('[Prepare] Building unsigned ETF purchase transactions...');
    console.log('[Prepare] User wallet:', userWallet);
    console.log('[Prepare] Creator wallet:', creatorWallet);
    console.log('[Prepare] SOL amount:', solAmount);
    console.log('[Prepare] Network:', network);
    console.log('[Prepare] Tokens:', tokens.length);

    // Fetch ETF from database to get the on-chain PDA (contract_address)
    const pool = getDatabasePool();
    let etfPda: PublicKey | undefined;

    if (pool) {
      try {
        const etfResult = await pool.query(
          'SELECT contract_address, creator FROM etf_listings WHERE id = $1 AND network = $2',
          [etfId, network]
        );

        if (etfResult.rows.length > 0 && etfResult.rows[0].contract_address) {
          etfPda = new PublicKey(etfResult.rows[0].contract_address);
          console.log('[Prepare] Found on-chain ETF PDA:', etfPda.toBase58());
        } else {
          console.log('[Prepare] ETF not initialized on-chain yet, program tx will be skipped');
        }
      } catch (dbError) {
        console.error('[Prepare] Database lookup failed:', dbError);
        // Continue without program transaction
      }
    }

    // Get connection
    const isDevnet = network === 'devnet';
    const rpcUrl = isDevnet
      ? clusterApiUrl('devnet')
      : process.env.MAINNET_RPC_URL || clusterApiUrl('mainnet-beta');
    const connection = new Connection(rpcUrl, 'confirmed');

    // Build unsigned transactions
    const unsignedPurchase = await buildUnsignedEtfPurchase(
      connection,
      userPubkey,
      creatorPubkey,
      tokenMints,
      tokenSymbols,
      tokenWeights,
      solAmount,
      isDevnet,
      etfPda  // Pass the actual PDA from database
    );

    console.log('[Prepare] Built transactions successfully');
    console.log('[Prepare] Fee transaction: 1');
    console.log('[Prepare] Swap transactions:', unsignedPurchase.swapTransactions.length);

    return NextResponse.json({
      success: true,
      ...unsignedPurchase,
      etfId,
      message: 'Sign these transactions in your wallet to complete the purchase'
    });

  } catch (error: any) {
    console.error('[Prepare] Error building transactions:', error);
    return NextResponse.json({
      error: error.message || 'Failed to prepare transactions',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
