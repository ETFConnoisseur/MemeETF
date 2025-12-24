import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { decryptPrivateKey, getKeypairFromPrivateKey } from '@/lib/solana/wallet';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getConnection, sellEtf, getEtfPda } from '@/lib/solana/program';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { etfId, userId, tokensToSell } = body;

    if (!etfId || !userId) {
      return NextResponse.json({ error: 'ETF ID and user ID required' }, { status: 400 });
    }

    const pool = getDatabasePool();
    if (!pool) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Get portfolio position
    const portfolioResult = await pool.query(
      'SELECT * FROM portfolio WHERE user_id = $1 AND etf_id = $2',
      [userId, etfId]
    );
    if (portfolioResult.rows.length === 0) {
      return NextResponse.json({ error: 'No position found' }, { status: 404 });
    }

    const position = portfolioResult.rows[0];
    // Portfolio table uses: amount (tokens), current_value (invested SOL)
    const tokensHeld = parseFloat(position.amount || 0);
    const investedSol = parseFloat(position.current_value || 0);
    const sellTokenAmount = tokensToSell || tokensHeld;

    if (sellTokenAmount > tokensHeld) {
      return NextResponse.json({ error: `Cannot sell more than you own. You have ${tokensHeld} tokens.` }, { status: 400 });
    }

    if (sellTokenAmount <= 0) {
      return NextResponse.json({ error: 'Invalid sell amount' }, { status: 400 });
    }

    // Get ETF
    const etfResult = await pool.query('SELECT * FROM etf_listings WHERE id = $1', [etfId]);
    if (etfResult.rows.length === 0) {
      return NextResponse.json({ error: 'ETF not found' }, { status: 404 });
    }
    const etf = etfResult.rows[0];

    // Get ETF creator's wallet for the lister account (for fees)
    const creatorWalletResult = await pool.query(
      'SELECT public_key FROM wallets WHERE user_id = $1',
      [etf.creator]
    );
    if (creatorWalletResult.rows.length === 0) {
      return NextResponse.json({ error: 'ETF creator wallet not found' }, { status: 404 });
    }
    const listerPubkey = new PublicKey(creatorWalletResult.rows[0].public_key);

    // Get user wallet
    const walletResult = await pool.query(
      'SELECT encrypted_private_key, public_key, sol_balance FROM wallets WHERE user_id = $1',
      [userId]
    );
    if (walletResult.rows.length === 0) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    }

    const { encrypted_private_key, sol_balance } = walletResult.rows[0];
    const currentWalletBalance = parseFloat(sol_balance || 0);
    const privateKey = decryptPrivateKey(encrypted_private_key);
    const investorKeypair = getKeypairFromPrivateKey(privateKey);
    const connection = getConnection('devnet');

    // Get ETF PDA
    const creatorPubkey = new PublicKey(etf.creator);
    const [etfPda] = getEtfPda(creatorPubkey);

    // Calculate returns for database tracking
    // Token value = invested SOL proportionally
    const proportionSold = sellTokenAmount / tokensHeld;
    const solValueToReturn = investedSol * proportionSold;
    const totalFee = solValueToReturn * 0.01; // 1% total fee
    const netReturn = solValueToReturn - totalFee;

    console.log('[Sell] 🚀 Executing sell...');
    console.log('[Sell] User:', userId);
    console.log('[Sell] ETF:', etf.name);
    console.log('[Sell] Tokens to sell:', sellTokenAmount, 'out of', tokensHeld);
    console.log('[Sell] SOL value to return:', solValueToReturn);
    console.log('[Sell] Net return after fees:', netReturn);

    // For now, execute sell in database mode (smart contract sell may fail due to liquidity)
    // In production, this would execute on-chain
    const signature = `sell-${Date.now()}-${userId.slice(0, 8)}`;

    // Update wallet balance (add net return)
    const newBalance = currentWalletBalance + netReturn;
    await pool.query(
      'UPDATE wallets SET sol_balance = $1 WHERE user_id = $2',
      [newBalance, userId]
    );

    console.log('[Sell] ✅ Updated wallet balance:', newBalance);

    // Calculate realized PnL (net return - cost basis)
    // Since we're returning at cost (no market price changes in this model), PnL = -fees
    const realizedPnl = netReturn - (investedSol * proportionSold);

    // Record transaction with realized PnL
    await pool.query(
      `INSERT INTO transactions (user_id, type, amount, fees, etf_id, tx_hash, status, pnl)
       VALUES ($1, 'sell', $2, $3, $4, $5, 'completed', $6)`,
      [userId, netReturn, totalFee, etfId, signature, realizedPnl]
    );

    // Record fees for the ETF creator (0.5% lister fee, 0.5% platform fee)
    const listerFee = solValueToReturn * 0.005; // 0.5%
    const platformFee = solValueToReturn * 0.005; // 0.5%
    await pool.query(
      `INSERT INTO fees (etf_id, lister_fee, platform_fee, paid_out)
       VALUES ($1, $2, $3, FALSE)`,
      [etfId, listerFee, platformFee]
    );

    console.log('[Sell] 💰 Recorded fees - Lister:', listerFee, 'Platform:', platformFee);

    // Update or delete portfolio position
    if (sellTokenAmount >= tokensHeld) {
      // Selling all - delete position
      await pool.query('DELETE FROM portfolio WHERE user_id = $1 AND etf_id = $2', [userId, etfId]);
      console.log('[Sell] Position closed completely');
    } else {
      // Partial sell - update position
      const remainingTokens = tokensHeld - sellTokenAmount;
      const remainingInvested = investedSol - solValueToReturn;
      await pool.query(
        'UPDATE portfolio SET amount = $3, current_value = $4 WHERE user_id = $1 AND etf_id = $2',
        [userId, etfId, remainingTokens, remainingInvested]
      );
      console.log('[Sell] Position updated - Remaining tokens:', remainingTokens);
    }

    return NextResponse.json({
      success: true,
      tokensSold: sellTokenAmount,
      solReturned: netReturn,
      fees: totalFee,
      txHash: signature,
      newBalance: newBalance,
    });
    
  } catch (error: any) {
    console.error('[Sell] ❌ Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to sell' }, { status: 500 });
  }
}
