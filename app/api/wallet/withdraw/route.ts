import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { decryptPrivateKey } from '@/lib/solana/wallet';
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js';
import { getConnection, getKeypairFromPrivateKey } from '@/lib/solana/wallet';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, address, amount } = body;

    if (!userId || !address || !amount) {
      return NextResponse.json(
        { error: 'User ID, destination address, and amount required' },
        { status: 400 }
      );
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
    const currentBalance = parseFloat(user.protocol_sol_balance || '0');
    const protocolWalletAddress = user.protocol_wallet_address;

    if (currentBalance < amount) {
      return NextResponse.json({
        error: `Insufficient protocol balance. Have ${currentBalance.toFixed(4)} SOL, need ${amount} SOL`
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

    // Decrypt key
    const privateKey = decryptPrivateKey(walletResult.rows[0].encrypted_private_key);
    const keypair = getKeypairFromPrivateKey(privateKey);

    // Connect to Solana
    const connection = getConnection('devnet');

    // Create Transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey(address),
        lamports: amount * LAMPORTS_PER_SOL,
      })
    );

    // Deduct from protocol balance first
    await pool.query(
      'UPDATE users SET protocol_sol_balance = protocol_sol_balance - $1 WHERE wallet_address = $2',
      [amount, userId]
    );

    // Send Transaction
    let signature;
    try {
      signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [keypair]
      );

      console.log('[Withdraw] ✅ Withdrawal successful:', signature);
    } catch (err: any) {
      console.error('[Withdraw] ❌ Solana transfer failed:', err);

      // Refund protocol balance if transaction fails
      await pool.query(
        'UPDATE users SET protocol_sol_balance = protocol_sol_balance + $1 WHERE wallet_address = $2',
        [amount, userId]
      );

      return NextResponse.json({ error: `Transfer failed: ${err.message}` }, { status: 500 });
    }

    // Record withdrawal in withdrawals table
    await pool.query(
      `INSERT INTO withdrawals (user_id, amount, tx_signature, from_address, to_address, status, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, 'confirmed', CURRENT_TIMESTAMP)`,
      [userId, amount, signature, protocolWalletAddress, address]
    );

    // Also record in transactions table for compatibility
    await pool.query(
      `INSERT INTO transactions (user_id, type, amount, tx_hash, status)
       VALUES ($1, 'withdrawal', $2, $3, 'completed')`,
      [userId, amount, signature]
    );

    return NextResponse.json({
      success: true,
      txHash: signature,
      newBalance: currentBalance - amount
    });

  } catch (error) {
    console.error('Error withdrawing:', error);
    return NextResponse.json(
      { error: 'Failed to withdraw' },
      { status: 500 }
    );
  }
}






