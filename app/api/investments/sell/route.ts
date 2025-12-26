import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { decryptPrivateKey, getKeypairFromPrivateKey, getConnection } from '@/lib/solana/wallet';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { swapForEtfSell } from '@/lib/solana/jupiterSwap';
import { withTransaction, addProtocolBalance, recordTransaction } from '@/lib/database/transactions';

/**
 * POST /api/investments/sell
 * Sell an ETF position - swaps all tokens back to SOL
 * SAFE IMPLEMENTATION: Execute swaps FIRST, then atomically update database
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { investmentId, userId, network = 'devnet' } = body;

    // Validation
    if (!investmentId || !userId) {
      return NextResponse.json({ error: 'Investment ID and user ID required' }, { status: 400 });
    }

    if (network !== 'devnet' && network !== 'mainnet-beta') {
      return NextResponse.json({ error: 'Invalid network. Must be devnet or mainnet-beta' }, { status: 400 });
    }

    const pool = getDatabasePool();
    if (!pool) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Get investment details with tokens
    const investmentResult = await pool.query(
      `SELECT i.*, e.name as etf_name
       FROM investments i
       JOIN etf_listings e ON i.etf_id = e.id
       WHERE i.id = $1 AND i.user_id = $2 AND i.is_sold = FALSE`,
      [investmentId, userId]
    );

    if (investmentResult.rows.length === 0) {
      return NextResponse.json({
        error: 'Investment not found or already sold'
      }, { status: 404 });
    }

    const investment = investmentResult.rows[0];
    const tokensPurchased = JSON.parse(investment.tokens_purchased || '[]');

    if (tokensPurchased.length === 0) {
      return NextResponse.json({
        error: 'No tokens found in this investment'
      }, { status: 400 });
    }

    // Get protocol wallet keypair
    const walletResult = await pool.query(
      'SELECT encrypted_private_key FROM wallets WHERE user_id = $1',
      [userId]
    );

    if (walletResult.rows.length === 0) {
      return NextResponse.json({ error: 'Protocol wallet not found' }, { status: 404 });
    }

    const privateKey = decryptPrivateKey(walletResult.rows[0].encrypted_private_key);
    const protocolKeypair = getKeypairFromPrivateKey(privateKey);

    // Connect to correct network
    const connection = getConnection(network);
    const isDevnet = network === 'devnet';

    console.log('[Sell] 🚀 Starting ETF sell...');
    console.log('[Sell] Investment:', investmentId);
    console.log('[Sell] ETF:', investment.etf_name);
    console.log('[Sell] Tokens to sell:', tokensPurchased.length);
    console.log('[Sell] Network:', network);

    // STEP 1: Execute all token->SOL swaps FIRST (before any database changes)
    const tokensToSell = tokensPurchased.map((t: any) => ({
      mint: t.actualMint || t.mint, // Use actualMint if it exists (devnet substitution)
      amount: parseFloat(t.amount),
      symbol: t.symbol
    }));

    let sellSwaps;
    try {
      sellSwaps = await swapForEtfSell(
        connection,
        protocolKeypair,
        tokensToSell,
        isDevnet
      );

      console.log('[Sell] ✅ All swaps completed successfully:', sellSwaps.length);
    } catch (swapError: any) {
      console.error('[Sell] ❌ Swap execution failed:', swapError);
      // Swaps failed, but no database changes made yet - safe to return error
      return NextResponse.json({
        error: `Failed to execute swaps: ${swapError.message}`,
        details: process.env.NODE_ENV === 'development' ? swapError.toString() : undefined
      }, { status: 500 });
    }

    // Calculate total SOL received from swaps
    const totalSOLReceived = sellSwaps.reduce((sum, swap) => {
      return sum + (swap.outputAmount / LAMPORTS_PER_SOL);
    }, 0);

    // Calculate fees (0.5% to lister)
    const listerFee = totalSOLReceived * 0.005;
    const solAfterFees = totalSOLReceived - listerFee;

    console.log('[Sell] Total SOL from swaps:', totalSOLReceived.toFixed(4));
    console.log('[Sell] Lister fee:', listerFee.toFixed(4));
    console.log('[Sell] SOL after fees:', solAfterFees.toFixed(4));

    // STEP 2: ALL swaps succeeded - now atomically update database
    try {
      await withTransaction(pool, async (client) => {
        // Add SOL back to protocol balance
        await addProtocolBalance(client, userId, solAfterFees);

        // Mark investment as sold
        await client.query(
          `UPDATE investments
           SET is_sold = TRUE,
               sold_at = NOW(),
               sol_received = $1,
               sell_mc = $2
           WHERE id = $3`,
          [solAfterFees, 0, investmentId] // TODO: Fetch real market cap
        );

        // Record all sell swaps
        for (let i = 0; i < sellSwaps.length; i++) {
          const swap = sellSwaps[i];
          const token = tokensPurchased[i];

          await client.query(
            `INSERT INTO investment_swaps (
              investment_id, token_mint, actual_mint, token_symbol, token_name,
              weight, sol_amount, token_amount, tx_signature,
              swap_type, is_devnet_mock
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'sell', $10)`,
            [
              investmentId,
              token.mint,
              swap.outputMint, // SOL mint
              token.symbol,
              token.symbol,
              token.weight || 0,
              swap.outputAmount / LAMPORTS_PER_SOL,
              swap.inputAmount,
              swap.signature,
              swap.isDevnetMock || false,
            ]
          );
        }

        // Record lister fee
        await client.query(
          `INSERT INTO fees (etf_id, lister_fee, platform_fee, paid_out)
           VALUES ($1, $2, 0, FALSE)`,
          [investment.etf_id, listerFee]
        );

        // Record transaction
        await recordTransaction(client, {
          userId,
          type: 'sell',
          amount: solAfterFees,
          txHash: sellSwaps[0]?.signature || 'MULTIPLE_SWAPS',
          status: 'completed',
          metadata: {
            investment_id: investmentId,
            total_sol_received: totalSOLReceived,
            lister_fee: listerFee,
            network: network,
            swap_signatures: sellSwaps.map(s => s.signature)
          }
        });
      });

      console.log('[Sell] ✅ Database updated successfully');
    } catch (dbError: any) {
      // CRITICAL: Swaps succeeded but database update failed
      console.error('[Sell] ❌ CRITICAL: Swaps completed but database update failed!');
      console.error('[Sell] Swap signatures:', sellSwaps.map(s => s.signature));
      console.error('[Sell] Database error:', dbError);
      console.error('[Sell] ACTION REQUIRED: Manual reconciliation needed');

      // Try to log this critical error
      try {
        await pool.query(
          `INSERT INTO transactions (user_id, type, amount, tx_hash, status, metadata)
           VALUES ($1, 'sell', $2, $3, 'pending_reconciliation', $4)`,
          [
            userId,
            solAfterFees,
            sellSwaps[0]?.signature || 'MULTIPLE_SWAPS',
            JSON.stringify({
              error: dbError.message,
              timestamp: new Date().toISOString(),
              needs_manual_review: true,
              swap_signatures: sellSwaps.map(s => s.signature),
              investment_id: investmentId,
              network: network
            })
          ]
        );
      } catch (logError) {
        console.error('[Sell] Could not log to transactions:', logError);
      }

      return NextResponse.json({
        success: false,
        error: 'Sell swaps completed but database update failed. Please contact support.',
        swapSignatures: sellSwaps.map(s => s.signature),
        requiresReconciliation: true,
        explorerUrls: sellSwaps.map(s => ({
          signature: s.signature,
          url: network === 'mainnet-beta'
            ? `https://solscan.io/tx/${s.signature}`
            : `https://solscan.io/tx/${s.signature}?cluster=devnet`
        }))
      }, { status: 500 });
    }

    // Get updated protocol balance
    const updatedUser = await pool.query(
      'SELECT protocol_sol_balance FROM users WHERE wallet_address = $1',
      [userId]
    );

    const realizedPnL = solAfterFees - parseFloat(investment.sol_invested);

    console.log('[Sell] ✅ Investment sold successfully');
    console.log('[Sell] Total SOL received:', totalSOLReceived.toFixed(4));
    console.log('[Sell] After fees:', solAfterFees.toFixed(4));
    console.log('[Sell] Realized P&L:', realizedPnL.toFixed(4), 'SOL');

    // Return response matching frontend expectations
    return NextResponse.json({
      success: true,
      txHash: sellSwaps[0]?.signature || null,
      swapSignatures: sellSwaps.map(s => s.signature),
      totalSOLReceived,
      solAfterFees,
      fees: listerFee,
      realizedPnL,
      newProtocolBalance: parseFloat(updatedUser.rows[0].protocol_sol_balance),
      network: network,
      explorerUrls: sellSwaps.map(s => ({
        signature: s.signature,
        url: network === 'mainnet-beta'
          ? `https://solscan.io/tx/${s.signature}`
          : `https://solscan.io/tx/${s.signature}?cluster=devnet`
      }))
    });

  } catch (error: any) {
    console.error('[Sell] ❌ Unexpected error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to sell investment',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
