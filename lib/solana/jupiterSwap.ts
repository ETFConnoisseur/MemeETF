/**
 * Jupiter Swap Service for on-chain token swaps
 * Supports both devnet (with USDC fallback) and mainnet
 */

import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  Keypair,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

// Devnet USDC mint
const DEVNET_USDC = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
// Mainnet USDC mint
const MAINNET_USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

export interface SwapResult {
  signature: string;
  inputAmount: number;
  outputAmount: number;
  inputMint: string;
  outputMint: string;
  isDevnetMock: boolean;
}

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: null | any;
  priceImpactPct: string;
  routePlan: any[];
  contextSlot?: number;
  timeTaken?: number;
}

/**
 * Check if a token exists on the given network
 */
export async function tokenExistsOnChain(
  connection: Connection,
  tokenMint: PublicKey
): Promise<boolean> {
  try {
    const accountInfo = await connection.getAccountInfo(tokenMint);
    return accountInfo !== null && accountInfo.lamports > 0;
  } catch (error) {
    console.error('[JupiterSwap] Error checking token:', error);
    return false;
  }
}

/**
 * Get Jupiter quote for a swap
 */
export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: number, // in lamports
  slippageBps: number = 50, // 0.5% slippage
  isDevnet: boolean = true
): Promise<JupiterQuoteResponse | null> {
  try {
    const baseUrl = isDevnet
      ? 'https://quote-api.jup.ag/v6' // Jupiter has limited devnet support
      : 'https://quote-api.jup.ag/v6';

    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amount.toString(),
      slippageBps: slippageBps.toString(),
    });

    const response = await fetch(`${baseUrl}/quote?${params}`);

    if (!response.ok) {
      console.error('[JupiterSwap] Quote API error:', response.statusText);
      return null;
    }

    const quote = await response.json();
    return quote as JupiterQuoteResponse;
  } catch (error) {
    console.error('[JupiterSwap] Error fetching quote:', error);
    return null;
  }
}

/**
 * Execute a Jupiter swap
 */
export async function executeJupiterSwap(
  connection: Connection,
  userKeypair: Keypair,
  quote: JupiterQuoteResponse,
  isDevnet: boolean = true
): Promise<string> {
  try {
    const baseUrl = isDevnet
      ? 'https://quote-api.jup.ag/v6'
      : 'https://quote-api.jup.ag/v6';

    // Get swap transaction from Jupiter
    const swapResponse = await fetch(`${baseUrl}/swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: userKeypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });

    if (!swapResponse.ok) {
      throw new Error(`Swap API error: ${swapResponse.statusText}`);
    }

    const { swapTransaction } = await swapResponse.json();

    // Deserialize and sign transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    transaction.sign([userKeypair]);

    // Send and confirm transaction
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    await connection.confirmTransaction(signature, 'confirmed');

    console.log('[JupiterSwap] ✅ Swap successful:', signature);
    return signature;
  } catch (error) {
    console.error('[JupiterSwap] Swap execution error:', error);
    throw error;
  }
}

/**
 * Swap SOL to a token via Jupiter
 * Handles devnet fallback to USDC automatically
 */
export async function swapSolToToken(
  connection: Connection,
  userKeypair: Keypair,
  outputTokenMint: PublicKey,
  solAmount: number, // in SOL
  isDevnet: boolean = true
): Promise<SwapResult> {
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
  const SOL_MINT = 'So11111111111111111111111111111111111111112';

  let finalOutputMint = outputTokenMint;
  let isSubstituted = false;

  // On devnet, ALWAYS use USDC for all tokens (mainnet tokens don't exist on devnet)
  if (isDevnet) {
    console.log(`[JupiterSwap] Devnet mode: Substituting ${outputTokenMint.toBase58()} with devnet USDC`);
    finalOutputMint = DEVNET_USDC;
    isSubstituted = true;

    // Try to execute a real swap on devnet using Jupiter
    try {
      const quote = await getJupiterQuote(
        SOL_MINT,
        finalOutputMint.toBase58(),
        lamports,
        100, // 1% slippage for devnet
        true
      );

      if (quote) {
        console.log('[JupiterSwap] Devnet quote received, executing swap...');
        const signature = await executeJupiterSwap(connection, userKeypair, quote, true);

        return {
          signature,
          inputAmount: solAmount,
          outputAmount: parseInt(quote.outAmount),
          inputMint: SOL_MINT,
          outputMint: finalOutputMint.toBase58(),
          isDevnetMock: false,
        };
      }
    } catch (swapError: any) {
      console.error('[JupiterSwap] Devnet swap failed:', swapError.message);
    }

    // Fallback to mock if Jupiter swap fails on devnet
    console.log('[JupiterSwap] ⚠️  Creating mock swap (Jupiter unavailable on devnet)');
    const mockSignature = `DEVNET_MOCK_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    return {
      signature: mockSignature,
      inputAmount: solAmount,
      outputAmount: solAmount * 1000000, // Mock: assume 1 SOL = 1M USDC tokens
      inputMint: SOL_MINT,
      outputMint: finalOutputMint.toBase58(),
      isDevnetMock: true,
    };
  }

  // Mainnet: Execute real Jupiter swap
  try {
    // Get quote
    const quote = await getJupiterQuote(
      SOL_MINT,
      finalOutputMint.toBase58(),
      lamports,
      50, // 0.5% slippage
      false // mainnet
    );

    if (!quote) {
      throw new Error('Failed to get Jupiter quote');
    }

    console.log('[JupiterSwap] Quote received:', {
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      priceImpact: quote.priceImpactPct,
    });

    // Execute swap
    const signature = await executeJupiterSwap(connection, userKeypair, quote, false);

    return {
      signature,
      inputAmount: solAmount,
      outputAmount: parseInt(quote.outAmount),
      inputMint: SOL_MINT,
      outputMint: finalOutputMint.toBase58(),
      isDevnetMock: false,
    };
  } catch (error) {
    console.error('[JupiterSwap] Mainnet swap failed:', error);
    throw error;
  }
}

/**
 * Execute multiple swaps for ETF purchase
 */
export async function swapForEtfPurchase(
  connection: Connection,
  userKeypair: Keypair,
  tokenMints: PublicKey[],
  percentages: number[],
  totalSolAmount: number,
  isDevnet: boolean = true
): Promise<SwapResult[]> {
  const results: SwapResult[] = [];
  const listerFee = totalSolAmount * 0.005; // 0.5%
  const solAfterFees = totalSolAmount - listerFee;

  console.log(`[JupiterSwap] 🎯 Executing ${tokenMints.length} swaps on ${isDevnet ? 'DEVNET' : 'MAINNET'}`);
  console.log(`[JupiterSwap] Total SOL after fees: ${solAfterFees.toFixed(4)}`);

  if (isDevnet) {
    console.log('[JupiterSwap] 🔄 DEVNET MODE: All tokens will be substituted with devnet USDC (4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU)');
  }

  for (let i = 0; i < tokenMints.length; i++) {
    const tokenMint = tokenMints[i];
    const percentage = percentages[i];
    const solForToken = solAfterFees * (percentage / 100);

    console.log(`[JupiterSwap] Swap ${i + 1}/${tokenMints.length}: ${solForToken.toFixed(4)} SOL (${percentage}%) for ${tokenMint.toBase58().substring(0, 8)}...`);

    try {
      const result = await swapSolToToken(
        connection,
        userKeypair,
        tokenMint,
        solForToken,
        isDevnet
      );

      results.push(result);
      console.log(`[JupiterSwap] ✅ Swap ${i + 1}/${tokenMints.length} completed: ${result.signature.substring(0, 20)}...`);
      if (result.outputMint !== tokenMint.toBase58()) {
        console.log(`[JupiterSwap] 🔄 Token substituted: ${tokenMint.toBase58().substring(0, 8)}... → ${result.outputMint.substring(0, 8)}...`);
      }
    } catch (error) {
      console.error(`[JupiterSwap] ❌ Swap ${i + 1} failed:`, error);
      // Continue with other swaps even if one fails
      results.push({
        signature: 'FAILED',
        inputAmount: solForToken,
        outputAmount: 0,
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: tokenMint.toBase58(),
        isDevnetMock: false,
      });
    }
  }

  console.log(`[JupiterSwap] 🎉 All swaps completed: ${results.filter(r => r.signature !== 'FAILED').length}/${results.length} successful`);
  return results;
}
