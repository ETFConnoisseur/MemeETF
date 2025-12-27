import { NextRequest, NextResponse } from 'next/server';
import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js';
import { buildUnsignedEtfSell } from '@/lib/solana/jupiterSwap';

/**
 * POST /api/investments/prepare-sell
 *
 * NON-CUSTODIAL: Builds unsigned token->SOL swap transactions for user to sign
 * No private keys are stored or used on the backend
 *
 * Flow:
 * 1. User calls this endpoint with tokens to sell
 * 2. Backend builds unsigned Jupiter swap transactions (token -> SOL)
 * 3. Returns serialized transactions to frontend
 * 4. Frontend prompts user to sign with Phantom/Solflare
 * 5. Frontend sends signed transactions to blockchain
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userWallet,
      creatorWallet,
      tokens,
      network = 'devnet'
    } = body;

    // Validation
    if (!userWallet) {
      return NextResponse.json({ error: 'User wallet address required' }, { status: 400 });
    }
    if (!creatorWallet) {
      return NextResponse.json({ error: 'Creator wallet address required' }, { status: 400 });
    }
    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return NextResponse.json({ error: 'Tokens to sell required' }, { status: 400 });
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

    // Validate token data
    const tokensToSell: Array<{ mint: string; amount: number; symbol: string }> = [];

    for (const token of tokens) {
      if (!token.mint || !token.amount || !token.symbol) {
        return NextResponse.json({
          error: 'Each token must have mint, amount, and symbol'
        }, { status: 400 });
      }
      try {
        new PublicKey(token.mint); // Validate address format
        tokensToSell.push({
          mint: token.mint,
          amount: parseFloat(token.amount),
          symbol: token.symbol
        });
      } catch {
        return NextResponse.json({
          error: `Invalid token mint address: ${token.mint}`
        }, { status: 400 });
      }
    }

    console.log('[PrepareSell] Building unsigned sell transactions...');
    console.log('[PrepareSell] User wallet:', userWallet);
    console.log('[PrepareSell] Creator wallet:', creatorWallet);
    console.log('[PrepareSell] Network:', network);
    console.log('[PrepareSell] Tokens to sell:', tokensToSell.length);

    // Get connection (with fallback for mainnet)
    const isDevnet = network === 'devnet';
    const rpcUrl = isDevnet
      ? clusterApiUrl('devnet')
      : process.env.MAINNET_RPC_URL || process.env.MAINNET_RPC_FALLBACK || clusterApiUrl('mainnet-beta');
    const connection = new Connection(rpcUrl, 'confirmed');

    // Build unsigned sell transactions
    const unsignedSell = await buildUnsignedEtfSell(
      connection,
      userPubkey,
      creatorPubkey,
      tokensToSell,
      isDevnet
    );

    console.log('[PrepareSell] Built transactions successfully');
    console.log('[PrepareSell] Swap transactions:', unsignedSell.swapTransactions.length);
    console.log('[PrepareSell] Expected SOL:', unsignedSell.totalExpectedSol.toFixed(4));

    return NextResponse.json({
      success: true,
      ...unsignedSell,
      message: 'Sign these transactions in your wallet to complete the sale'
    });

  } catch (error: any) {
    console.error('[PrepareSell] Error building transactions:', error);
    return NextResponse.json({
      error: error.message || 'Failed to prepare sell transactions',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
