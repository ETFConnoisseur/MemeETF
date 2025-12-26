import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { decryptPrivateKey, getKeypairFromPrivateKey } from '@/lib/solana/wallet';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getConnection, buyEtf, getEtfPda } from '@/lib/solana/program';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { etfId, solAmount, userId } = body;

    if (!etfId || !userId) {
      return NextResponse.json({ error: 'ETF ID and User ID required' }, { status: 400 });
    }
    if (!solAmount || typeof solAmount !== 'number' || solAmount <= 0) {
      return NextResponse.json({ error: 'Valid SOL amount required' }, { status: 400 });
    }

    const pool = getDatabasePool();
    if (!pool) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
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
    const currentBalance = parseFloat(sol_balance);

    if (currentBalance < solAmount) {
      return NextResponse.json({ error: `Insufficient balance. Have ${currentBalance.toFixed(4)} SOL` }, { status: 400 });
    }

    // Get investor keypair
        const privateKey = decryptPrivateKey(encrypted_private_key);
    const investorKeypair = getKeypairFromPrivateKey(privateKey);
    const connection = getConnection('devnet');
    
    // Verify on-chain balance
    const onChainBalance = await connection.getBalance(investorKeypair.publicKey);
    const requiredLamports = solAmount * LAMPORTS_PER_SOL + 10000; // extra for fees
    
    if (onChainBalance < requiredLamports) {
      return NextResponse.json({ 
        error: `Insufficient on-chain SOL. Have ${(onChainBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL, need ${(requiredLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL` 
      }, { status: 400 });
    }

    // Parse tokens from JSONB column
    const tokens = typeof etf.tokens === 'string' ? JSON.parse(etf.tokens) : etf.tokens;

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({ error: 'ETF has no tokens configured' }, { status: 400 });
    }

    const tokenAddresses = tokens.map((t: any) => new PublicKey(t.address));
    const tokenPercentages = tokens.map((t: any) => parseFloat(t.weight));

    // Get ETF PDA
    const [etfPda] = getEtfPda(listerPubkey);

    console.log('[Investment] 🚀 Executing on-chain buy...');
    console.log('[Investment] Investor:', investorKeypair.publicKey.toBase58());
    console.log('[Investment] ETF PDA:', etfPda.toBase58());
    console.log('[Investment] Lister:', listerPubkey.toBase58());
    console.log('[Investment] Amount:', solAmount, 'SOL');
    console.log('[Investment] Tokens:', tokenAddresses.map((t: PublicKey) => t.toBase58()));
    console.log('[Investment] Percentages:', tokenPercentages);

    // Execute on-chain buy with token swaps
    const buyResult = await buyEtf(
      connection,
      investorKeypair,
      etfPda,
      listerPubkey,
      solAmount,
      tokenAddresses,
      tokenPercentages
    );

    console.log('[Investment] ✅ Main transaction confirmed:', buyResult.mainTxSignature);
    console.log('[Investment] ✅ Swap transactions:', buyResult.swapSignatures);
    console.log('[Investment] Token substitutions:', buyResult.tokenSubstitutions);

    // Update database after successful on-chain transaction
    const entryMarketCap = parseFloat(etf.market_cap_at_list);
    const tokensReceived = (solAmount * 1_000_000_000) / (entryMarketCap || 1);
    const totalFee = solAmount * 0.01;

    // Get new on-chain balance
    const newOnChainBalance = await connection.getBalance(investorKeypair.publicKey);
    const newBalance = newOnChainBalance / LAMPORTS_PER_SOL;

    // Update wallet balance in DB to match on-chain
    await pool.query('UPDATE wallets SET sol_balance = $1 WHERE user_id = $2', [newBalance, userId]);

    const investmentResult = await pool.query(
      `INSERT INTO investments (user_id, etf_id, sol_amount, entry_market_cap, tokens_received)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, etfId, solAmount, entryMarketCap, tokensReceived]
    );

    // Record main ETF buy transaction
    await pool.query(
      `INSERT INTO transactions (user_id, type, amount, fees, etf_id, tx_hash, status)
       VALUES ($1, 'buy', $2, $3, $4, $5, 'completed')`,
      [userId, solAmount, totalFee, etfId, buyResult.mainTxSignature]
    );

    // Record each token swap transaction
    for (const swap of buyResult.tokenSubstitutions) {
      if (swap.txSignature) {
        await pool.query(
          `INSERT INTO transactions (user_id, type, amount, fees, etf_id, tx_hash, status, metadata)
           VALUES ($1, 'token_swap', $2, 0, $3, $4, 'completed', $5)`,
          [
            userId,
            swap.solAmount,
            etfId,
            swap.txSignature,
            JSON.stringify({
              originalToken: swap.originalToken,
              finalToken: swap.finalToken,
              isSubstituted: swap.isSubstituted,
              percentage: swap.percentage,
            }),
          ]
        );
      }
    }

    await pool.query(
      `INSERT INTO portfolio (user_id, etf_id, amount, entry_price, current_value)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, etf_id) DO UPDATE SET 
         amount = portfolio.amount + EXCLUDED.amount,
         current_value = portfolio.current_value + EXCLUDED.current_value`,
      [userId, etfId, tokensReceived, entryMarketCap, solAmount]
    );

    // Record fees for the ETF creator (0.5% lister fee, 0.5% platform fee)
    const listerFee = solAmount * 0.005; // 0.5%
    const platformFee = solAmount * 0.005; // 0.5%
    
    console.log('[Investment] 💰 Recording fees...');
    console.log('[Investment] ETF ID:', etfId);
    console.log('[Investment] ETF Creator:', etf.creator);
    console.log('[Investment] Lister Fee:', listerFee, 'SOL');
    console.log('[Investment] Platform Fee:', platformFee, 'SOL');
    
    await pool.query(
      `INSERT INTO fees (etf_id, lister_fee, platform_fee, paid_out)
       VALUES ($1, $2, $3, FALSE)`,
      [etfId, listerFee, platformFee]
    );
    
    console.log('[Investment] ✅ Fees recorded successfully');

    return NextResponse.json({
      success: true,
      investment: investmentResult.rows[0],
      txHash: buyResult.mainTxSignature,
      swapSignatures: buyResult.swapSignatures,
      tokenSubstitutions: buyResult.tokenSubstitutions,
      newBalance: newBalance,
      feesRecorded: { listerFee, platformFee },
    });
    
  } catch (error: any) {
    console.error('[Investment] ❌ Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to invest' }, { status: 500 });
  }
}
