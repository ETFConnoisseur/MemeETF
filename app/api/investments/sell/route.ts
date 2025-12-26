import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { decryptPrivateKey, getKeypairFromPrivateKey, getConnection } from '@/lib/solana/wallet';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { swapSolToToken } from '@/lib/solana/jupiterSwap';

/**
 * POST /api/investments/sell
 * Sell an ETF position - swaps all tokens back to SOL
 * Returns SOL to protocol wallet balance
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { investmentId, userId } = body;

    if (!investmentId || !userId) {
      return NextResponse.json({ error: 'Investment ID and user ID required' }, { status: 400 });
    }

    const pool = getDatabasePool();
    if (!pool) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Get investment details
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

    const connection = getConnection('devnet');
    const isDevnet = true; // TODO: Make dynamic

    console.log('[Sell] 🚀 Starting ETF sell...');
    console.log('[Sell] Investment:', investmentId);
    console.log('[Sell] ETF:', investment.etf_name);
    console.log('[Sell] Tokens to sell:', tokensPurchased.length);

    // Swap each token back to SOL
    let totalSOLReceived = 0;
    const sellSwaps = [];

    for (const token of tokensPurchased) {
      try {
        // For devnet mock, we'll just estimate the SOL value
        // In production mainnet, this would execute real Jupiter swaps
        if (isDevnet) {
          // Mock: assume we get back the original SOL amount proportionally
          const estimatedSOL = (token.weight / 100) * parseFloat(investment.sol_invested);
          totalSOLReceived += estimatedSOL;

          sellSwaps.push({
            tokenMint: token.mint,
            tokenSymbol: token.symbol,
            tokenAmount: token.amount,
            solReceived: estimatedSOL,
            signature: `DEVNET_SELL_MOCK_${Date.now()}_${sellSwaps.length}`,
            isDevnetMock: true,
          });

          console.log(`[Sell] ✅ Mock sold ${token.symbol}: ~${estimatedSOL.toFixed(4)} SOL`);
        } else {
          // TODO: Real Jupiter swap from token to SOL on mainnet
          // This would use Jupiter to swap token -> USDC -> SOL
          throw new Error('Mainnet token selling not yet implemented');
        }
      } catch (swapError: any) {
        console.error(`[Sell] ❌ Failed to swap ${token.symbol}:`, swapError);
        sellSwaps.push({
          tokenMint: token.mint,
          tokenSymbol: token.symbol,
          tokenAmount: token.amount,
          solReceived: 0,
          signature: 'FAILED',
          error: swapError.message,
        });
      }
    }

    // Calculate fees (0.5% to lister)
    const listerFee = totalSOLReceived * 0.005;
    const solAfterFees = totalSOLReceived - listerFee;

    // Add SOL back to protocol balance
    await pool.query(
      'UPDATE users SET protocol_sol_balance = protocol_sol_balance + $1 WHERE id = $2',
      [solAfterFees, userId]
    );

    // Calculate current market cap for sell tracking
    const currentMC = 0; // TODO: Fetch current MC from prices

    // Mark investment as sold
    await pool.query(
      `UPDATE investments
       SET is_sold = TRUE,
           sold_at = NOW(),
           sol_received = $1,
           sell_mc = $2
       WHERE id = $3`,
      [solAfterFees, currentMC, investmentId]
    );

    // Record sell swaps
    for (const swap of sellSwaps) {
      await pool.query(
        `INSERT INTO investment_swaps (
          investment_id, token_mint, token_symbol, token_name,
          weight, sol_amount, token_amount, tx_signature,
          swap_type, is_devnet_mock
        )
        VALUES ($1, $2, $3, $4, 0, $5, $6, $7, 'sell', $8)`,
        [
          investmentId,
          swap.tokenMint,
          swap.tokenSymbol,
          swap.tokenSymbol,
          swap.solReceived,
          swap.tokenAmount,
          swap.signature,
          swap.isDevnetMock || false,
        ]
      );
    }

    // Record lister fee
    await pool.query(
      `INSERT INTO fees (etf_id, lister_fee, platform_fee, paid_out)
       VALUES ($1, $2, 0, FALSE)`,
      [investment.etf_id, listerFee]
    );

    // Get updated protocol balance
    const updatedUser = await pool.query(
      'SELECT protocol_sol_balance FROM users WHERE id = $1',
      [userId]
    );

    const realizedPnL = solAfterFees - parseFloat(investment.sol_invested);

    console.log('[Sell] ✅ Investment sold successfully');
    console.log('[Sell] Total SOL received:', totalSOLReceived.toFixed(4));
    console.log('[Sell] After fees:', solAfterFees.toFixed(4));
    console.log('[Sell] Realized P&L:', realizedPnL.toFixed(4), 'SOL');

    return NextResponse.json({
      success: true,
      totalSOLReceived,
      solAfterFees,
      fees: listerFee,
      realizedPnL,
      sellSwaps,
      newProtocolBalance: parseFloat(updatedUser.rows[0].protocol_sol_balance),
    });

  } catch (error: any) {
    console.error('[Sell] ❌ Error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to sell investment'
    }, { status: 500 });
  }
}
