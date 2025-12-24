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

    // Get user wallet
    const walletResult = await pool.query(
      `SELECT w.id, w.encrypted_private_key, w.sol_balance, w.public_key 
       FROM wallets w 
       WHERE w.user_id = $1`,
      [userId]
    );

    if (walletResult.rows.length === 0) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    }

    const wallet = walletResult.rows[0];
    const currentBalance = parseFloat(wallet.sol_balance);

    if (currentBalance < amount) {
      return NextResponse.json({ error: 'Insufficient funds' }, { status: 400 });
    }

    // Decrypt key
    const privateKey = decryptPrivateKey(wallet.encrypted_private_key);
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

    // Send Transaction
    let signature;
    try {
      signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [keypair]
      );
    } catch (err: any) {
      console.error('Solana transfer failed:', err);
      return NextResponse.json({ error: `Transfer failed: ${err.message}` }, { status: 500 });
    }

    // Update DB
    await pool.query(
      'UPDATE wallets SET sol_balance = sol_balance - $1 WHERE id = $2',
      [amount, wallet.id]
    );

    // Record Transaction
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






