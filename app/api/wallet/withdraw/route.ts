import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { decryptPrivateKey } from '@/lib/solana/wallet';
import { Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js';
import { getConnection, getKeypairFromPrivateKey } from '@/lib/solana/wallet';
import { withTransaction, deductProtocolBalance, recordTransaction } from '@/lib/database/transactions';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, address, amount, network = 'devnet' } = body;

    // Validate inputs
    if (!userId || !address || !amount) {
      return NextResponse.json(
        { error: 'User ID, destination address, and amount required' },
        { status: 400 }
      );
    }

    if (network !== 'devnet' && network !== 'mainnet-beta') {
      return NextResponse.json({ error: 'Invalid network. Must be devnet or mainnet-beta' }, { status: 400 });
    }

    if (amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    const pool = getDatabasePool();
    if (!pool) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Get user's protocol balance and wallet
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

    // Check sufficient balance BEFORE any blockchain interaction
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

    // Decrypt key and create keypair
    const privateKey = decryptPrivateKey(walletResult.rows[0].encrypted_private_key);
    const keypair = getKeypairFromPrivateKey(privateKey);

    // Connect to correct network
    const connection = getConnection(network);

    console.log(`[Withdraw] Initiating withdrawal of ${amount} SOL on ${network}`);
    console.log(`[Withdraw] From: ${protocolWalletAddress}`);
    console.log(`[Withdraw] To: ${address}`);

    // Step 1: Create and send blockchain transaction FIRST
    // This ensures we only deduct balance if withdrawal actually succeeds
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey(address),
        lamports: Math.floor(amount * LAMPORTS_PER_SOL),
      })
    );

    let signature: string;
    try {
      signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [keypair],
        {
          commitment: 'confirmed'
        }
      );

      console.log(`[Withdraw] ✅ Blockchain transaction successful: ${signature}`);
    } catch (err: any) {
      console.error('[Withdraw] ❌ Blockchain transaction failed:', err);

      return NextResponse.json({
        error: `Withdrawal failed: ${err.message || 'Could not send transaction'}`,
        details: network === 'devnet' ? err.toString() : undefined
      }, { status: 500 });
    }

    // Step 2: ONLY after successful blockchain transaction, update database ATOMICALLY
    try {
      await withTransaction(pool, async (client) => {
        // Deduct from protocol balance (with balance check)
        await deductProtocolBalance(client, userId, amount);

        // Record withdrawal in withdrawals table
        await client.query(
          `INSERT INTO withdrawals (user_id, amount, tx_signature, from_address, to_address, status, confirmed_at)
           VALUES ($1, $2, $3, $4, $5, 'confirmed', CURRENT_TIMESTAMP)`,
          [userId, amount, signature, protocolWalletAddress, address]
        );

        // Record in transactions table
        await recordTransaction(client, {
          userId,
          type: 'withdrawal',
          amount,
          txHash: signature,
          status: 'completed',
          metadata: {
            from_address: protocolWalletAddress,
            to_address: address,
            network: network
          }
        });
      });

      console.log('[Withdraw] ✅ Database records updated successfully');

      return NextResponse.json({
        success: true,
        txHash: signature,
        newBalance: currentBalance - amount,
        network: network,
        explorerUrl: network === 'mainnet-beta'
          ? `https://solscan.io/tx/${signature}`
          : `https://solscan.io/tx/${signature}?cluster=devnet`
      });

    } catch (dbError: any) {
      // CRITICAL: Blockchain transaction succeeded but database update failed
      // This creates an inconsistency that needs manual reconciliation
      console.error('[Withdraw] ❌ CRITICAL: Blockchain succeeded but database failed!');
      console.error('[Withdraw] Transaction signature:', signature);
      console.error('[Withdraw] Database error:', dbError);
      console.error('[Withdraw] ACTION REQUIRED: Manual reconciliation needed');

      // Log to a reconciliation table (if it exists) or error tracking service
      try {
        await pool.query(
          `INSERT INTO transactions (user_id, type, amount, tx_hash, status, metadata)
           VALUES ($1, 'withdrawal', $2, $3, 'pending_reconciliation', $4)`,
          [
            userId,
            amount,
            signature,
            JSON.stringify({
              error: dbError.message,
              timestamp: new Date().toISOString(),
              needs_manual_review: true,
              from_address: protocolWalletAddress,
              to_address: address,
              network: network
            })
          ]
        );
      } catch (logError) {
        console.error('[Withdraw] Could not log to transactions table:', logError);
      }

      return NextResponse.json({
        success: false,
        error: 'Withdrawal sent but database update failed. Please contact support.',
        txHash: signature,
        requiresReconciliation: true,
        explorerUrl: network === 'mainnet-beta'
          ? `https://solscan.io/tx/${signature}`
          : `https://solscan.io/tx/${signature}?cluster=devnet`
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('[Withdraw] Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process withdrawal',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
