/**
 * Jupiter Swap Service for on-chain token swaps
 *
 * NON-CUSTODIAL MODE: Returns unsigned transactions for user to sign
 * DEVNET MODE: All token swaps are converted to devnet USDC as a demo
 * MAINNET MODE: Real Jupiter swaps to actual meme tokens
 *
 * Fee Structure: 1% total (0.5% to ETF creator + 0.5% to platform dev)
 */

import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionMessage,
} from '@solana/web3.js';
import { buildUnsignedBuyEtf, getEtfPda } from './program';

// Devnet USDC mint - used as placeholder for all tokens on devnet
const DEVNET_USDC = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
// Mainnet USDC mint
const MAINNET_USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Fee constants
const CREATOR_FEE_BPS = 50; // 0.5% = 50 basis points
const DEV_FEE_BPS = 50;     // 0.5% = 50 basis points
const TOTAL_FEE_BPS = CREATOR_FEE_BPS + DEV_FEE_BPS; // 1% total

// Dev wallet for platform fees (matches contract DEV_WALLET)
const DEV_WALLET = new PublicKey('F2Qgu6J59kfLAKZWMT258PwFYi1Q19WuaYPPTxLeYwjz');

// Unsigned transaction for user to sign
export interface UnsignedSwapTransaction {
  transaction: string; // base64 serialized VersionedTransaction
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  expectedOutputAmount: number;
  priceImpactPct: string;
  tokenSymbol: string;
  tokenWeight: number;
}

// Fee transfer transaction
export interface FeeTransaction {
  transaction: string; // base64 serialized transaction
  creatorFee: number;
  devFee: number;
  totalFee: number;
}

// Program transaction for on-chain registration
export interface ProgramTransaction {
  transaction: string; // base64 serialized transaction
  etfPda: string;
  description: string;
}

// Complete unsigned transaction bundle for ETF purchase
export interface UnsignedEtfPurchase {
  programTransaction?: ProgramTransaction; // Calls buy_etf on the program (shows on Solscan)
  feeTransaction: FeeTransaction;
  swapTransactions: UnsignedSwapTransaction[];
  totalSolAmount: number;
  solAfterFees: number;
  userWallet: string;
  creatorWallet: string;
  etfPda?: string;
  network: 'devnet' | 'mainnet-beta';
}

// Complete unsigned transaction bundle for ETF sell
export interface UnsignedEtfSell {
  swapTransactions: UnsignedSwapTransaction[];
  feeTransaction?: FeeTransaction; // Fees taken from proceeds
  totalExpectedSol: number;
  userWallet: string;
  network: 'devnet' | 'mainnet-beta';
}

export interface SwapResult {
  signature: string;
  inputAmount: number;
  outputAmount: number;
  inputMint: string;
  outputMint: string;
  originalOutputMint: string; // The token user wanted (for devnet tracking)
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
    // Use api.jup.ag for both devnet and mainnet
    const baseUrl = 'https://api.jup.ag/v6';

    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amount.toString(),
      slippageBps: slippageBps.toString(),
    });

    console.log(`[JupiterSwap] Fetching quote from ${baseUrl}/quote (${isDevnet ? 'devnet' : 'mainnet'})`);
    const response = await fetch(`${baseUrl}/quote?${params}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[JupiterSwap] Quote API error:', response.status, errorText);
      return null;
    }

    const quote = await response.json();
    console.log('[JupiterSwap] Quote received successfully');
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
    // Use api.jup.ag for both devnet and mainnet
    const baseUrl = 'https://api.jup.ag/v6';

    console.log(`[JupiterSwap] Executing swap via ${baseUrl}/swap (${isDevnet ? 'devnet' : 'mainnet'})`);

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
      const errorText = await swapResponse.text();
      throw new Error(`Swap API error: ${swapResponse.status} - ${errorText}`);
    }

    const { swapTransaction } = await swapResponse.json();

    // Deserialize and sign transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    transaction.sign([userKeypair]);

    console.log('[JupiterSwap] Sending transaction to blockchain...');

    // Send and confirm transaction
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log('[JupiterSwap] Transaction sent, confirming...', signature);
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
 *
 * DEVNET: Swaps to devnet USDC as demo (mainnet tokens don't exist on devnet)
 * MAINNET: Real Jupiter swap to the actual token
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
  const originalMint = outputTokenMint.toBase58();

  let finalOutputMint = outputTokenMint;

  // On devnet, ALWAYS use USDC for all tokens (mainnet tokens don't exist on devnet)
  if (isDevnet) {
    console.log(`[JupiterSwap] 🧪 DEVNET DEMO: ${outputTokenMint.toBase58().substring(0, 8)}... → devnet USDC`);
    finalOutputMint = DEVNET_USDC;

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
          originalOutputMint: originalMint,
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
      outputAmount: Math.floor(solAmount * 1000000), // Mock: assume 1 SOL = 1M USDC tokens
      inputMint: SOL_MINT,
      outputMint: finalOutputMint.toBase58(),
      originalOutputMint: originalMint,
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
      originalOutputMint: originalMint,
      isDevnetMock: false,
    };
  } catch (error) {
    console.error('[JupiterSwap] Mainnet swap failed:', error);
    throw error;
  }
}

/**
 * Swap token to SOL via Jupiter
 * Used when selling ETF positions
 */
export async function swapTokenToSol(
  connection: Connection,
  userKeypair: Keypair,
  inputTokenMint: PublicKey,
  tokenAmount: number, // token amount in smallest units
  isDevnet: boolean = true
): Promise<SwapResult> {
  const SOL_MINT = 'So11111111111111111111111111111111111111112';

  // On devnet, use realistic simulation (since we can't actually sell devnet tokens)
  if (isDevnet) {
    console.log(`[JupiterSwap] 🧪 DEVNET DEMO: Simulating sale of ${inputTokenMint.toBase58().substring(0, 8)}...`);

    // Realistic simulation: random price movement between 80-120% of entry
    // In real scenario, we'd query current price vs entry price
    const priceMultiplier = 0.8 + (Math.random() * 0.4); // 80% to 120%
    const estimatedLamports = Math.floor(tokenAmount * 0.001 * priceMultiplier); // Rough estimate
    const estimatedSOL = estimatedLamports / LAMPORTS_PER_SOL;

    console.log(`[JupiterSwap] ⚠️  Simulated sell: ~${estimatedSOL.toFixed(4)} SOL (${(priceMultiplier * 100).toFixed(1)}% of entry)`);

    const mockSignature = `DEVNET_SELL_MOCK_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    return {
      signature: mockSignature,
      inputAmount: tokenAmount,
      outputAmount: estimatedLamports,
      inputMint: inputTokenMint.toBase58(),
      outputMint: SOL_MINT,
      originalOutputMint: SOL_MINT,
      isDevnetMock: true,
    };
  }

  // Mainnet: Execute real Jupiter swap token -> SOL
  try {
    console.log('[JupiterSwap] Getting quote for token -> SOL swap...');

    const quote = await getJupiterQuote(
      inputTokenMint.toBase58(),
      SOL_MINT,
      Math.floor(tokenAmount),
      50, // 0.5% slippage
      false // mainnet
    );

    if (!quote) {
      throw new Error('Failed to get Jupiter quote for sell');
    }

    console.log('[JupiterSwap] Sell quote received:', {
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      priceImpact: quote.priceImpactPct,
    });

    // Execute swap
    const signature = await executeJupiterSwap(connection, userKeypair, quote, false);

    return {
      signature,
      inputAmount: tokenAmount,
      outputAmount: parseInt(quote.outAmount),
      inputMint: inputTokenMint.toBase58(),
      outputMint: SOL_MINT,
      originalOutputMint: SOL_MINT,
      isDevnetMock: false,
    };
  } catch (error) {
    console.error('[JupiterSwap] Mainnet token->SOL swap failed:', error);
    throw error;
  }
}

/**
 * Execute multiple swaps for ETF purchase
 *
 * Fee breakdown:
 * - 0.5% goes to ETF creator
 * - 0.5% goes to platform dev
 * - Remaining 99% is split across tokens based on percentages
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

  // Calculate fees: 0.5% to creator + 0.5% to dev = 1% total
  const creatorFee = totalSolAmount * (CREATOR_FEE_BPS / 10000);
  const devFee = totalSolAmount * (DEV_FEE_BPS / 10000);
  const totalFees = creatorFee + devFee;
  const solAfterFees = totalSolAmount - totalFees;

  console.log(`[JupiterSwap] ════════════════════════════════════════`);
  console.log(`[JupiterSwap] 🎯 ETF PURCHASE on ${isDevnet ? 'DEVNET' : 'MAINNET'}`);
  console.log(`[JupiterSwap] ════════════════════════════════════════`);
  console.log(`[JupiterSwap] 💰 Total SOL: ${totalSolAmount.toFixed(4)}`);
  console.log(`[JupiterSwap] 💸 Creator fee (0.5%): ${creatorFee.toFixed(6)} SOL`);
  console.log(`[JupiterSwap] 💸 Dev fee (0.5%): ${devFee.toFixed(6)} SOL`);
  console.log(`[JupiterSwap] 🔄 SOL for swaps: ${solAfterFees.toFixed(4)}`);
  console.log(`[JupiterSwap] 📊 Tokens: ${tokenMints.length}`);

  if (isDevnet) {
    console.log(`[JupiterSwap] ════════════════════════════════════════`);
    console.log(`[JupiterSwap] 🧪 DEVNET DEMO MODE`);
    console.log(`[JupiterSwap] All tokens → devnet USDC (4zMMC9...)`);
    console.log(`[JupiterSwap] On mainnet: actual tokens purchased`);
    console.log(`[JupiterSwap] ════════════════════════════════════════`);
  }

  for (let i = 0; i < tokenMints.length; i++) {
    const tokenMint = tokenMints[i];
    const percentage = percentages[i];
    const solForToken = solAfterFees * (percentage / 100);

    console.log(`[JupiterSwap] Swap ${i + 1}/${tokenMints.length}: ${solForToken.toFixed(4)} SOL (${percentage}%) → ${tokenMint.toBase58().substring(0, 8)}...`);

    try {
      const result = await swapSolToToken(
        connection,
        userKeypair,
        tokenMint,
        solForToken,
        isDevnet
      );

      results.push(result);
      console.log(`[JupiterSwap] ✅ Swap ${i + 1} done: ${result.signature.substring(0, 20)}...`);
    } catch (error) {
      console.error(`[JupiterSwap] ❌ Swap ${i + 1} failed:`, error);
      // Continue with other swaps even if one fails
      results.push({
        signature: 'FAILED',
        inputAmount: solForToken,
        outputAmount: 0,
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: tokenMint.toBase58(),
        originalOutputMint: tokenMint.toBase58(),
        isDevnetMock: false,
      });
    }
  }

  const successCount = results.filter(r => r.signature !== 'FAILED').length;
  console.log(`[JupiterSwap] ════════════════════════════════════════`);
  console.log(`[JupiterSwap] 🎉 Complete: ${successCount}/${results.length} swaps successful`);
  console.log(`[JupiterSwap] ════════════════════════════════════════`);

  return results;
}

/**
 * Execute multiple token->SOL swaps for ETF selling
 */
export async function swapForEtfSell(
  connection: Connection,
  userKeypair: Keypair,
  tokens: Array<{ mint: string; amount: number; symbol: string }>,
  isDevnet: boolean = true
): Promise<SwapResult[]> {
  const results: SwapResult[] = [];

  console.log(`[JupiterSwap] 💰 Selling ${tokens.length} tokens back to SOL on ${isDevnet ? 'DEVNET' : 'MAINNET'}`);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    console.log(`[JupiterSwap] Sell ${i + 1}/${tokens.length}: ${token.symbol} (${token.amount} tokens)`);

    try {
      const result = await swapTokenToSol(
        connection,
        userKeypair,
        new PublicKey(token.mint),
        token.amount,
        isDevnet
      );

      results.push(result);
      const solReceived = result.outputAmount / LAMPORTS_PER_SOL;
      console.log(`[JupiterSwap] ✅ Sell ${i + 1}/${tokens.length} completed: ${solReceived.toFixed(4)} SOL`);
    } catch (error: any) {
      console.error(`[JupiterSwap] ❌ Sell ${i + 1} failed:`, error);
      results.push({
        signature: 'FAILED',
        inputAmount: token.amount,
        outputAmount: 0,
        inputMint: token.mint,
        outputMint: 'So11111111111111111111111111111111111111112',
        originalOutputMint: 'So11111111111111111111111111111111111111112',
        isDevnetMock: false,
      });
    }
  }

  const successfulSells = results.filter(r => r.signature !== 'FAILED').length;
  console.log(`[JupiterSwap] 🎉 Sell complete: ${successfulSells}/${results.length} successful`);

  return results;
}

// ============================================================================
// NON-CUSTODIAL FUNCTIONS - Returns unsigned transactions for user to sign
// ============================================================================

/**
 * Build unsigned fee transfer transaction
 * User signs this to pay fees to creator and dev wallet
 */
export async function buildFeeTransaction(
  connection: Connection,
  userWallet: PublicKey,
  creatorWallet: PublicKey,
  totalSolAmount: number
): Promise<FeeTransaction> {
  const creatorFee = Math.floor(totalSolAmount * LAMPORTS_PER_SOL * (CREATOR_FEE_BPS / 10000));
  const devFee = Math.floor(totalSolAmount * LAMPORTS_PER_SOL * (DEV_FEE_BPS / 10000));

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

  const transaction = new Transaction({
    feePayer: userWallet,
    blockhash,
    lastValidBlockHeight,
  });

  // Transfer to creator
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: userWallet,
      toPubkey: creatorWallet,
      lamports: creatorFee,
    })
  );

  // Transfer to dev wallet
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: userWallet,
      toPubkey: DEV_WALLET,
      lamports: devFee,
    })
  );

  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  return {
    transaction: serialized.toString('base64'),
    creatorFee: creatorFee / LAMPORTS_PER_SOL,
    devFee: devFee / LAMPORTS_PER_SOL,
    totalFee: (creatorFee + devFee) / LAMPORTS_PER_SOL,
  };
}

/**
 * Build an unsigned Jupiter swap transaction
 * Returns the serialized transaction for user to sign
 */
export async function buildUnsignedSwapTransaction(
  userWallet: PublicKey,
  quote: JupiterQuoteResponse,
  isDevnet: boolean = true
): Promise<string> {
  const baseUrl = 'https://api.jup.ag/v6';

  console.log(`[JupiterSwap] Building unsigned swap for ${userWallet.toBase58().substring(0, 8)}...`);

  const swapResponse = await fetch(`${baseUrl}/swap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: userWallet.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });

  if (!swapResponse.ok) {
    const errorText = await swapResponse.text();
    throw new Error(`Jupiter swap API error: ${swapResponse.status} - ${errorText}`);
  }

  const { swapTransaction } = await swapResponse.json();
  return swapTransaction; // Already base64
}

/**
 * Build unsigned transactions for ETF purchase
 * Returns all transactions for user to sign in their wallet
 * Includes program transaction to register the purchase on-chain (shows on Solscan)
 *
 * @param etfPdaFromDb - Optional: The actual PDA from database (contract_address).
 *                       If provided, enables the on-chain program transaction.
 *                       If not provided, only fee+swap transactions are built.
 */
export async function buildUnsignedEtfPurchase(
  connection: Connection,
  userWallet: PublicKey,
  creatorWallet: PublicKey,
  tokenMints: PublicKey[],
  tokenSymbols: string[],
  percentages: number[],
  totalSolAmount: number,
  isDevnet: boolean = true,
  etfPdaFromDb?: PublicKey  // The actual PDA from database (contract_address)
): Promise<UnsignedEtfPurchase> {
  const SOL_MINT = 'So11111111111111111111111111111111111111112';

  console.log(`[JupiterSwap] ════════════════════════════════════════`);
  console.log(`[JupiterSwap] Building UNSIGNED ETF Purchase`);
  console.log(`[JupiterSwap] Network: ${isDevnet ? 'DEVNET' : 'MAINNET'}`);
  console.log(`[JupiterSwap] User: ${userWallet.toBase58().substring(0, 8)}...`);
  console.log(`[JupiterSwap] Total SOL: ${totalSolAmount}`);
  console.log(`[JupiterSwap] ════════════════════════════════════════`);

  // Use the PDA from database if provided, otherwise derive it (for logging only)
  const etfPda = etfPdaFromDb || getEtfPda(creatorWallet)[0];
  console.log(`[JupiterSwap] ETF PDA: ${etfPda.toBase58()}${etfPdaFromDb ? ' (from database)' : ' (derived)'}`);

  // Build program transaction ONLY if we have the actual PDA from database
  // This means the ETF was properly initialized on-chain
  let programTransaction: ProgramTransaction | undefined = undefined;

  if (etfPdaFromDb) {
    try {
      console.log(`[JupiterSwap] Building program transaction (buy_etf)...`);
      const { transaction: programTx } = await buildUnsignedBuyEtf(
        connection,
        userWallet,
        etfPdaFromDb,
        creatorWallet,
        totalSolAmount,
        tokenMints,
        percentages
      );
      programTransaction = {
        transaction: programTx,
        etfPda: etfPdaFromDb.toBase58(),
        description: 'Register ETF purchase on-chain',
      };
      console.log(`[JupiterSwap] Program transaction built successfully`);
    } catch (error: any) {
      console.error(`[JupiterSwap] Could not build program transaction:`, error.message);
      // Continue without program transaction - fees and swaps will still work
    }
  } else {
    console.log(`[JupiterSwap] Program transaction skipped (ETF not initialized on-chain)`);
  }

  // Build fee transaction
  const feeTransaction = await buildFeeTransaction(
    connection,
    userWallet,
    creatorWallet,
    totalSolAmount
  );

  const solAfterFees = totalSolAmount - feeTransaction.totalFee;
  console.log(`[JupiterSwap] 💸 Fees: ${feeTransaction.totalFee} SOL`);
  console.log(`[JupiterSwap] 🔄 SOL for swaps: ${solAfterFees}`);

  // Build swap transactions
  const swapTransactions: UnsignedSwapTransaction[] = [];

  for (let i = 0; i < tokenMints.length; i++) {
    const tokenMint = tokenMints[i];
    const symbol = tokenSymbols[i];
    const percentage = percentages[i];
    const solForToken = solAfterFees * (percentage / 100);
    const lamports = Math.floor(solForToken * LAMPORTS_PER_SOL);

    // On devnet, swap to USDC instead
    const finalOutputMint = isDevnet ? DEVNET_USDC : tokenMint;

    console.log(`[JupiterSwap] Getting quote ${i + 1}/${tokenMints.length}: ${solForToken.toFixed(4)} SOL → ${symbol}`);

    try {
      const quote = await getJupiterQuote(
        SOL_MINT,
        finalOutputMint.toBase58(),
        lamports,
        isDevnet ? 100 : 50, // Higher slippage on devnet
        isDevnet
      );

      if (!quote) {
        console.log(`[JupiterSwap] ⚠️ No quote for ${symbol}, skipping...`);
        continue;
      }

      const unsignedTx = await buildUnsignedSwapTransaction(userWallet, quote, isDevnet);

      swapTransactions.push({
        transaction: unsignedTx,
        inputMint: SOL_MINT,
        outputMint: finalOutputMint.toBase58(),
        inputAmount: solForToken,
        expectedOutputAmount: parseInt(quote.outAmount),
        priceImpactPct: quote.priceImpactPct,
        tokenSymbol: symbol,
        tokenWeight: percentage,
      });

      console.log(`[JupiterSwap] ✅ Quote ${i + 1}: ${quote.outAmount} tokens expected`);
    } catch (error: any) {
      console.error(`[JupiterSwap] ❌ Failed to get quote for ${symbol}:`, error.message);
    }
  }

  console.log(`[JupiterSwap] ════════════════════════════════════════`);
  console.log(`[JupiterSwap] 📦 Prepared ${swapTransactions.length} swap transactions`);
  if (programTransaction) {
    console.log(`[JupiterSwap] 🔗 + 1 program transaction (will show on Solscan)`);
  }
  console.log(`[JupiterSwap] ════════════════════════════════════════`);

  return {
    programTransaction,
    feeTransaction,
    swapTransactions,
    totalSolAmount,
    solAfterFees,
    userWallet: userWallet.toBase58(),
    creatorWallet: creatorWallet.toBase58(),
    etfPda: etfPda.toBase58(),
    network: isDevnet ? 'devnet' : 'mainnet-beta',
  };
}

/**
 * Build unsigned transactions for ETF sell
 * Returns token->SOL swap transactions for user to sign
 */
export async function buildUnsignedEtfSell(
  connection: Connection,
  userWallet: PublicKey,
  creatorWallet: PublicKey,
  tokens: Array<{ mint: string; amount: number; symbol: string }>,
  isDevnet: boolean = true
): Promise<UnsignedEtfSell> {
  const SOL_MINT = 'So11111111111111111111111111111111111111112';

  console.log(`[JupiterSwap] ════════════════════════════════════════`);
  console.log(`[JupiterSwap] 🔧 Building UNSIGNED ETF Sell`);
  console.log(`[JupiterSwap] 📍 Network: ${isDevnet ? 'DEVNET' : 'MAINNET'}`);
  console.log(`[JupiterSwap] 👛 User: ${userWallet.toBase58().substring(0, 8)}...`);
  console.log(`[JupiterSwap] 💰 Tokens to sell: ${tokens.length}`);
  console.log(`[JupiterSwap] ════════════════════════════════════════`);

  const swapTransactions: UnsignedSwapTransaction[] = [];
  let totalExpectedSol = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    console.log(`[JupiterSwap] Getting sell quote ${i + 1}/${tokens.length}: ${token.symbol}`);

    try {
      const quote = await getJupiterQuote(
        token.mint,
        SOL_MINT,
        Math.floor(token.amount),
        isDevnet ? 100 : 50,
        isDevnet
      );

      if (!quote) {
        console.log(`[JupiterSwap] ⚠️ No sell quote for ${token.symbol}, skipping...`);
        continue;
      }

      const unsignedTx = await buildUnsignedSwapTransaction(userWallet, quote, isDevnet);
      const expectedSol = parseInt(quote.outAmount) / LAMPORTS_PER_SOL;
      totalExpectedSol += expectedSol;

      swapTransactions.push({
        transaction: unsignedTx,
        inputMint: token.mint,
        outputMint: SOL_MINT,
        inputAmount: token.amount,
        expectedOutputAmount: parseInt(quote.outAmount),
        priceImpactPct: quote.priceImpactPct,
        tokenSymbol: token.symbol,
        tokenWeight: 0, // Not applicable for sells
      });

      console.log(`[JupiterSwap] ✅ Sell quote ${i + 1}: ~${expectedSol.toFixed(4)} SOL expected`);
    } catch (error: any) {
      console.error(`[JupiterSwap] ❌ Failed to get sell quote for ${token.symbol}:`, error.message);
    }
  }

  // Build fee transaction for proceeds
  let feeTransaction: FeeTransaction | undefined;
  if (totalExpectedSol > 0) {
    feeTransaction = await buildFeeTransaction(
      connection,
      userWallet,
      creatorWallet,
      totalExpectedSol
    );
  }

  console.log(`[JupiterSwap] ════════════════════════════════════════`);
  console.log(`[JupiterSwap] 📦 Prepared ${swapTransactions.length} sell transactions`);
  console.log(`[JupiterSwap] 💰 Expected total: ~${totalExpectedSol.toFixed(4)} SOL`);
  console.log(`[JupiterSwap] ════════════════════════════════════════`);

  return {
    swapTransactions,
    feeTransaction,
    totalExpectedSol,
    userWallet: userWallet.toBase58(),
    network: isDevnet ? 'devnet' : 'mainnet-beta',
  };
}
