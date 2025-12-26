import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { decryptPrivateKey, getKeypairFromPrivateKey, getConnection } from '@/lib/solana/wallet';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { swapForEtfPurchase } from '@/lib/solana/jupiterSwap';
import { withTransaction, deductProtocolBalance } from '@/lib/database/transactions';

/**
 * POST /api/investments/create
 * Purchase an ETF using protocol wallet balance
 * SAFE IMPLEMENTATION: Execute swaps FIRST, then atomically update database
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { etfId, solAmount, userId, network = 'devnet' } = body;

    // Validation
    if (!etfId || !userId) {
      return NextResponse.json({ error: 'ETF ID and User ID required' }, { status: 400 });
    }
    if (!solAmount || typeof solAmount !== 'number' || solAmount <= 0) {
      return NextResponse.json({ error: 'Valid SOL amount required' }, { status: 400 });
    }
    if (network !== 'devnet' && network !== 'mainnet-beta') {
      return NextResponse.json({ error: 'Invalid network. Must be devnet or mainnet-beta' }, { status: 400 });
    }

    const pool = getDatabasePool();
    if (!pool) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Get user's protocol balance
    const userResult = await pool.query(
      'SELECT wallet_address, protocol_sol_balance, protocol_wallet_address FROM users WHERE wallet_address = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userResult.rows[0];
    const protocolBalance = parseFloat(user.protocol_sol_balance);

    // Check balance BEFORE any operations (no deduction yet)
    if (protocolBalance < solAmount) {
      return NextResponse.json({
        error: `Insufficient protocol balance. Have ${protocolBalance.toFixed(4)} SOL, need ${solAmount} SOL`
      }, { status: 400 });
    }

    // Get ETF details (verify network matches)
    const etfResult = await pool.query(
      'SELECT * FROM etf_listings WHERE id = $1 AND network = $2',
      [etfId, network]
    );

    if (etfResult.rows.length === 0) {
      return NextResponse.json({ error: 'ETF not found' }, { status: 404 });
    }

    const etf = etfResult.rows[0];
    const tokens = typeof etf.tokens === 'string' ? JSON.parse(etf.tokens) : etf.tokens;

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({ error: 'ETF has no tokens configured' }, { status: 400 });
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

    // Calculate fees
    const listerFee = solAmount * 0.005;
    const solAfterFees = solAmount - listerFee;

    console.log('[Investment] 🚀 Starting ETF purchase...');
    console.log('[Investment] User:', userId);
    console.log('[Investment] ETF:', etf.name);
    console.log('[Investment] Amount:', solAmount, 'SOL');
    console.log('[Investment] Network:', network);
    console.log('[Investment] Tokens:', tokens.length);

    // STEP 1: Execute Jupiter swaps FIRST (before any database changes)
    const connection = getConnection(network);
    const isDevnet = network === 'devnet';
    const tokenMints = tokens.map((t: any) => new PublicKey(t.address));
    const tokenWeights = tokens.map((t: any) => parseFloat(t.weight));

    let swapResults;
    try {
      swapResults = await swapForEtfPurchase(
        connection,
        protocolKeypair,
        tokenMints,
        tokenWeights,
        solAfterFees,
        isDevnet
      );

      console.log('[Investment] ✅ All swaps completed successfully:', swapResults.length);
    } catch (swapError: any) {
      console.error('[Investment] ❌ Swap execution failed:', swapError);
      // Swaps failed, but no database changes made yet - safe to return error
      return NextResponse.json({
        error: `Failed to execute swaps: ${swapError.message}`,
        details: process.env.NODE_ENV === 'development' ? swapError.toString() : undefined
      }, { status: 500 });
    }

    // Calculate market caps for portfolio tracking
    const currentMC = tokens.reduce((sum: number, token: any) => {
      return sum + (token.market_cap || 0) * (token.weight / 100);
    }, 0);

    const purchase24hChange = tokens.reduce((sum: number, token: any) => {
      return sum + (token.price_change_24h || 0) * (token.weight / 100);
    }, 0);

    // STEP 2: ALL swaps succeeded - now atomically update database
    let investmentId;
    try {
      await withTransaction(pool, async (client) => {
        // Deduct balance (with validation - will throw if insufficient)
        await deductProtocolBalance(client, userId, solAmount);

        // Insert investment record
        const investmentResult = await client.query(
          `INSERT INTO investments (
            user_id, etf_id, sol_amount, sol_invested, purchase_mc,
            purchase_24h_change, tokens_purchased, entry_market_cap, is_sold, network
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9)
          RETURNING *`,
          [
            userId,
            etfId,
            solAmount,
            solAfterFees,
            currentMC,
            purchase24hChange,
            JSON.stringify(swapResults.map((s, i) => ({
              mint: tokens[i].address,
              actualMint: s.outputMint,
              symbol: tokens[i].symbol,
              amount: s.outputAmount,
              weight: tokenWeights[i],
              isDevnetSubstitution: isDevnet && tokens[i].address !== s.outputMint,
            }))),
            currentMC,
            network,
          ]
        );

        investmentId = investmentResult.rows[0].id;

        // Insert all swap records
        for (let i = 0; i < swapResults.length; i++) {
          const swap = swapResults[i];
          const token = tokens[i];

          await client.query(
            `INSERT INTO investment_swaps (
              investment_id, token_mint, actual_mint, token_symbol, token_name,
              weight, sol_amount, token_amount, tx_signature,
              swap_type, is_devnet_mock, network
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'buy', $10, $11)`,
            [
              investmentId,
              token.address,
              swap.outputMint,
              token.symbol,
              token.name || token.symbol,
              tokenWeights[i],
              swap.inputAmount,
              swap.outputAmount,
              swap.signature,
              swap.isDevnetMock || false,
              network,
            ]
          );
        }

        // Update ETF stats
        await client.query(
          `UPDATE etf_listings
           SET total_volume = COALESCE(total_volume, 0) + $1,
               total_investors = (
                 SELECT COUNT(DISTINCT user_id)
                 FROM investments
                 WHERE etf_id = $2
               )
           WHERE id = $2`,
          [solAmount, etfId]
        );

        // Record lister fee
        await client.query(
          `INSERT INTO fees (etf_id, lister_fee, platform_fee, paid_out)
           VALUES ($1, $2, 0, FALSE)`,
          [etfId, listerFee]
        );
      });

      console.log('[Investment] ✅ Database updated successfully');
    } catch (dbError: any) {
      // CRITICAL: Swaps succeeded but database update failed
      console.error('[Investment] ❌ CRITICAL: Swaps completed but database update failed!');
      console.error('[Investment] Swap signatures:', swapResults.map(s => s.signature));
      console.error('[Investment] Database error:', dbError);
      console.error('[Investment] ACTION REQUIRED: Manual reconciliation needed');

      // Try to log this critical error
      try {
        await pool.query(
          `INSERT INTO transactions (user_id, type, amount, tx_hash, status, metadata)
           VALUES ($1, 'buy', $2, $3, 'pending_reconciliation', $4)`,
          [
            userId,
            solAmount,
            swapResults[0]?.signature || 'MULTIPLE_SWAPS',
            JSON.stringify({
              error: dbError.message,
              timestamp: new Date().toISOString(),
              needs_manual_review: true,
              swap_signatures: swapResults.map(s => s.signature),
              etf_id: etfId,
              network: network
            })
          ]
        );
      } catch (logError) {
        console.error('[Investment] Could not log to transactions:', logError);
      }

      return NextResponse.json({
        success: false,
        error: 'Investment swaps completed but database update failed. Please contact support.',
        swapSignatures: swapResults.map(s => s.signature),
        requiresReconciliation: true,
        explorerUrls: swapResults.map(s => ({
          signature: s.signature,
          url: network === 'mainnet-beta'
            ? `https://solscan.io/tx/${s.signature}`
            : `https://solscan.io/tx/${s.signature}?cluster=devnet`
        }))
      }, { status: 500 });
    }

    // Get updated balance
    const updatedUser = await pool.query(
      'SELECT protocol_sol_balance FROM users WHERE wallet_address = $1',
      [userId]
    );

    console.log('[Investment] ✅ Investment created successfully');
    console.log('[Investment] Investment ID:', investmentId);

    // Return response matching frontend expectations
    return NextResponse.json({
      success: true,
      txHash: swapResults[0]?.signature || null,
      swapSignatures: swapResults.map(s => s.signature),
      tokenSubstitutions: swapResults.map((s, i) => ({
        originalToken: tokens[i].address,
        actualToken: s.outputMint,
        isSubstituted: tokens[i].address !== s.outputMint,
        symbol: tokens[i].symbol,
        weight: tokenWeights[i]
      })),
      newProtocolBalance: parseFloat(updatedUser.rows[0].protocol_sol_balance),
      investment: {
        id: investmentId,
        solInvested: solAfterFees,
        purchaseMC: currentMC
      },
      network: network,
      explorerUrls: swapResults.map(s => ({
        signature: s.signature,
        url: network === 'mainnet-beta'
          ? `https://solscan.io/tx/${s.signature}`
          : `https://solscan.io/tx/${s.signature}?cluster=devnet`
      }))
    });

  } catch (error: any) {
    console.error('[Investment] ❌ Unexpected error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to create investment',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
