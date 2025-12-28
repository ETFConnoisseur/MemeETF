import { NextRequest, NextResponse } from 'next/server';
import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js';

/**
 * POST /api/investments/swap
 *
 * Fetches a fresh Jupiter swap transaction for a single token swap.
 * Called right before each swap to ensure the blockhash is fresh.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userWallet,
      inputMint,
      outputMint,
      amount, // in lamports
      network = 'devnet'
    } = body;

    // Validation
    if (!userWallet) {
      return NextResponse.json({ error: 'User wallet required' }, { status: 400 });
    }
    if (!inputMint || !outputMint) {
      return NextResponse.json({ error: 'Input and output mints required' }, { status: 400 });
    }
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Valid amount required' }, { status: 400 });
    }

    console.log(`[Swap API] Fetching fresh swap: ${inputMint.substring(0, 8)}... -> ${outputMint.substring(0, 8)}...`);
    console.log(`[Swap API] Amount: ${amount} lamports, Network: ${network}`);

    // Try Jupiter Ultra API first (recommended)
    try {
      const ultraParams = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amount.toString(),
        taker: userWallet,
      });

      const ultraResponse = await fetch(`https://api.jup.ag/ultra/v1/order?${ultraParams}`);

      if (ultraResponse.ok) {
        const ultraOrder = await ultraResponse.json();

        if (ultraOrder.transaction && !ultraOrder.errorCode) {
          console.log(`[Swap API] Ultra order received: ${ultraOrder.outAmount} tokens via ${ultraOrder.router}`);

          return NextResponse.json({
            success: true,
            transaction: ultraOrder.transaction,
            inputMint: ultraOrder.inputMint,
            outputMint: ultraOrder.outputMint,
            inAmount: ultraOrder.inAmount,
            outAmount: ultraOrder.outAmount,
            priceImpactPct: ultraOrder.priceImpactPct,
            router: ultraOrder.router,
            source: 'ultra'
          });
        }
      }
    } catch (ultraError) {
      console.log('[Swap API] Ultra API failed, trying v6...');
    }

    // Fall back to v6 API (quote + swap)
    const quoteParams = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amount.toString(),
      slippageBps: network === 'devnet' ? '100' : '50',
    });

    const quoteResponse = await fetch(`https://quote-api.jup.ag/v6/quote?${quoteParams}`);

    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      console.error('[Swap API] Quote failed:', errorText);
      return NextResponse.json({ error: 'Failed to get Jupiter quote' }, { status: 500 });
    }

    const quote = await quoteResponse.json();

    // Get swap transaction
    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: userWallet,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });

    if (!swapResponse.ok) {
      const errorText = await swapResponse.text();
      console.error('[Swap API] Swap build failed:', errorText);
      return NextResponse.json({ error: 'Failed to build swap transaction' }, { status: 500 });
    }

    const { swapTransaction } = await swapResponse.json();

    console.log(`[Swap API] v6 swap built: ${quote.outAmount} tokens expected`);

    return NextResponse.json({
      success: true,
      transaction: swapTransaction,
      inputMint: quote.inputMint,
      outputMint: quote.outputMint,
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      priceImpactPct: quote.priceImpactPct,
      source: 'v6'
    });

  } catch (error: any) {
    console.error('[Swap API] Error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to get swap transaction'
    }, { status: 500 });
  }
}
