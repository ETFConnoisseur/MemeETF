import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { decryptPrivateKey, getKeypairFromPrivateKey, getConnection } from '@/lib/solana/wallet';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { swapForEtfPurchase } from '@/lib/solana/jupiterSwap';

/**
 * POST /api/investments/create
 * Purchase an ETF using protocol wallet balance
 * Executes real Jupiter swaps for each token in the ETF
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { etfId, solAmount, userId, network = 'devnet' } = body;

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

    if (protocolBalance < solAmount) {
      return NextResponse.json({
        error: `Insufficient protocol balance. Have ${protocolBalance.toFixed(4)} SOL, need ${solAmount} SOL`
      }, { status: 400 });
    }

    // Get ETF details
    const etfResult = await pool.query(
      'SELECT * FROM etf_listings WHERE id = $1',
      [etfId]
    );

    if (etfResult.rows.length === 0) {
      return NextResponse.json({ error: 'ETF not found' }, { status: 404 });
    }

    const etf = etfResult.rows[0];
    const tokens = typeof etf.tokens === 'string' ? JSON.parse(etf.tokens) : etf.tokens;

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({ error: 'ETF has no tokens configured' }, { status: 400 });
    }

    // Get protocol wallet keypair (for executing swaps)
    const walletResult = await pool.query(
      'SELECT encrypted_private_key FROM wallets WHERE user_id = $1',
      [userId]
    );

    if (walletResult.rows.length === 0) {
      return NextResponse.json({ error: 'Protocol wallet not found' }, { status: 404 });
    }

    const privateKey = decryptPrivateKey(walletResult.rows[0].encrypted_private_key);
    const protocolKeypair = getKeypairFromPrivateKey(privateKey);

    // Calculate fees (0.5% to lister)
    const listerFee = solAmount * 0.005;
    const solAfterFees = solAmount - listerFee;

    // Deduct from protocol balance immediately
    await pool.query(
      'UPDATE users SET protocol_sol_balance = protocol_sol_balance - $1 WHERE wallet_address = $2',
      [solAmount, userId]
    );

    console.log('[Investment] 🚀 Starting ETF purchase...');
    console.log('[Investment] User:', userId);
    console.log('[Investment] ETF:', etf.name);
    console.log('[Investment] Amount:', solAmount, 'SOL');
    console.log('[Investment] Tokens:', tokens.length);

    // Determine if devnet or mainnet from request
    const connection = getConnection(network);
    const isDevnet = network === 'devnet';

    // Execute Jupiter swaps for each token
    const tokenMints = tokens.map((t: any) => new PublicKey(t.address));
    const tokenWeights = tokens.map((t: any) => parseFloat(t.weight));

    let swapResults;
    try {
      swapResults = await swapForEtfPurchase(
        connection,
        protocolKeypair,
        tokenMints,
        tokenWeights,
        solAfterFees, // Swap the SOL after fees
        isDevnet
      );

      console.log('[Investment] ✅ Swaps completed:', swapResults.length);
    } catch (swapError: any) {
      console.error('[Investment] ❌ Swap failed:', swapError);

      // Refund to protocol balance if swap fails
      await pool.query(
        'UPDATE users SET protocol_sol_balance = protocol_sol_balance + $1 WHERE wallet_address = $2',
        [solAmount, userId]
      );

      return NextResponse.json({
        error: `Failed to execute swaps: ${swapError.message}`
      }, { status: 500 });
    }

    // Calculate current and purchase market caps
    const currentMC = tokens.reduce((sum: number, token: any) => {
      return sum + (token.market_cap || 0) * (token.weight / 100);
    }, 0);

    const purchase24hChange = tokens.reduce((sum: number, token: any) => {
      return sum + (token.price_change_24h || 0) * (token.weight / 100);
    }, 0);

    // Store investment record with actual swap data
    const investmentResult = await pool.query(
      `INSERT INTO investments (
        user_id, etf_id, sol_amount, sol_invested, purchase_mc,
        purchase_24h_change, tokens_purchased, entry_market_cap, is_sold
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
      RETURNING *`,
      [
        userId,
        etfId,
        solAmount,
        solAfterFees,
        currentMC,
        purchase24hChange,
        JSON.stringify(swapResults.map((s, i) => ({
          mint: tokens[i].address, // Original token address from ETF
          actualMint: s.outputMint, // Actual token minted (devnet USDC on devnet)
          symbol: tokens[i].symbol,
          amount: s.outputAmount,
          weight: tokenWeights[i],
          isDevnetSubstitution: isDevnet && tokens[i].address !== s.outputMint,
        }))),
        currentMC,
      ]
    );

    const investmentId = investmentResult.rows[0].id;

    // Record each individual swap
    for (let i = 0; i < swapResults.length; i++) {
      const swap = swapResults[i];
      const token = tokens[i];

      // Try to insert with actual_mint column if it exists, fallback to just token_mint
      try {
        await pool.query(
          `INSERT INTO investment_swaps (
            investment_id, token_mint, actual_mint, token_symbol, token_name,
            weight, sol_amount, token_amount, tx_signature,
            swap_type, is_devnet_mock
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'buy', $10)`,
          [
            investmentId,
            token.address, // Original mainnet token
            swap.outputMint, // Actual minted token (devnet USDC on devnet)
            token.symbol,
            token.name,
            tokenWeights[i],
            swap.inputAmount,
            swap.outputAmount,
            swap.signature,
            swap.isDevnetMock,
          ]
        );
      } catch (insertError: any) {
        // If actual_mint column doesn't exist, insert without it
        if (insertError.code === '42703') {
          await pool.query(
            `INSERT INTO investment_swaps (
              investment_id, token_mint, token_symbol, token_name,
              weight, sol_amount, token_amount, tx_signature,
              swap_type, is_devnet_mock
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'buy', $9)`,
            [
              investmentId,
              token.address,
              token.symbol,
              token.name,
              tokenWeights[i],
              swap.inputAmount,
              swap.outputAmount,
              swap.signature,
              swap.isDevnetMock,
            ]
          );
        } else {
          throw insertError;
        }
      }
    }

    // Update ETF stats
    await pool.query(
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
    await pool.query(
      `INSERT INTO fees (etf_id, lister_fee, platform_fee, paid_out)
       VALUES ($1, $2, 0, FALSE)`,
      [etfId, listerFee]
    );

    // Get updated protocol balance
    const updatedUser = await pool.query(
      'SELECT protocol_sol_balance FROM users WHERE wallet_address = $1',
      [userId]
    );

    console.log('[Investment] ✅ Investment created successfully');
    console.log('[Investment] Investment ID:', investmentId);
    console.log('[Investment] Swaps:', swapResults.map(s => s.signature).filter(s => s !== 'FAILED'));

    return NextResponse.json({
      success: true,
      investment: investmentResult.rows[0],
      swaps: swapResults,
      newProtocolBalance: parseFloat(updatedUser.rows[0].protocol_sol_balance),
      feesRecorded: { listerFee },
    });

  } catch (error: any) {
    console.error('[Investment] ❌ Error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to create investment'
    }, { status: 500 });
  }
}
