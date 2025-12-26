import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getConnection } from '@/lib/solana/wallet';
import { withTransaction, addProtocolBalance, recordTransaction } from '@/lib/database/transactions';

export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
    const { userId, amount, txHash, network = 'devnet' } = body;

    // Validate inputs
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID (wallet address) required' },
        { status: 400 }
      );
    }

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Valid amount required' },
        { status: 400 }
      );
    }

    if (!txHash) {
      return NextResponse.json(
        { error: 'Transaction hash required' },
        { status: 400 }
      );
    }

    if (network !== 'devnet' && network !== 'mainnet-beta') {
      return NextResponse.json({ error: 'Invalid network. Must be devnet or mainnet-beta' }, { status: 400 });
    }

    const pool = getDatabasePool();
    if (!pool) {
      console.error('[Deposit API] Database pool is null');
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    console.log(`[Deposit] Processing deposit of ${amount} SOL on ${network}`);
    console.log(`[Deposit] User: ${userId}, TX: ${txHash}`);

    // Check if this transaction has already been processed (prevents double-spend)
    let existingTx;
    try {
      existingTx = await pool.query(
        'SELECT id, type, status FROM transactions WHERE tx_hash = $1',
        [txHash]
      );
    } catch (queryError: any) {
      console.error('[Deposit API] Query failed:', queryError);
      if (queryError.code === '42P01') {
        return NextResponse.json({
          error: 'Database tables not initialized. Please run migrations.'
        }, { status: 503 });
      }
      throw queryError;
    }

    if (existingTx.rows.length > 0) {
      console.warn(`[Deposit] Transaction ${txHash} already processed`);
      return NextResponse.json(
        {
          error: 'Transaction already processed',
          existingTransaction: {
            type: existingTx.rows[0].type,
            status: existingTx.rows[0].status
          }
        },
        { status: 400 }
      );
    }

    // Verify transaction on blockchain
    const connection = getConnection(network);
    let txInfo;

    try {
      txInfo = await connection.getTransaction(txHash, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

      if (!txInfo) {
        return NextResponse.json(
          { error: 'Transaction not found on blockchain. Please wait for confirmation.' },
          { status: 400 }
        );
      }

      // Verify the transaction was successful
      if (txInfo.meta?.err) {
        console.error('[Deposit] Transaction failed on blockchain:', txInfo.meta.err);
        return NextResponse.json(
          { error: 'Transaction failed on blockchain' },
          { status: 400 }
        );
      }

      console.log('[Deposit] ✅ Transaction verified on blockchain');
    } catch (verifyError: any) {
      console.error('[Deposit] Could not verify transaction on chain:', verifyError);
      return NextResponse.json(
        {
          error: 'Could not verify transaction on blockchain',
          details: verifyError.message
        },
        { status: 500 }
      );
    }

    // Get user info
    const userResult = await pool.query(
      'SELECT wallet_address, protocol_sol_balance, protocol_wallet_address FROM users WHERE wallet_address = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found. Please connect your wallet first.' },
        { status: 404 }
      );
    }

    const user = userResult.rows[0];
    const currentBalance = parseFloat(user.protocol_sol_balance || '0');
    const protocolWalletAddress = user.protocol_wallet_address;

    if (!protocolWalletAddress) {
      return NextResponse.json(
        { error: 'Protocol wallet not initialized. Please create wallet first.' },
        { status: 400 }
      );
    }

    // ATOMIC TRANSACTION: Update balance + Record in deposits + Record in transactions
    await withTransaction(pool, async (client) => {
      // Add to protocol balance
      await addProtocolBalance(client, userId, amount);

      // Record in deposits table
      await client.query(
        `INSERT INTO deposits (user_id, amount, tx_signature, from_address, to_address, status, confirmed_at)
         VALUES ($1, $2, $3, $4, $5, 'confirmed', CURRENT_TIMESTAMP)`,
        [userId, amount, txHash, userId, protocolWalletAddress]
      );

      // Record in transactions table
      await recordTransaction(client, {
        userId,
        type: 'deposit',
        amount,
        txHash,
        status: 'completed',
        metadata: {
          from_address: userId,
          to_address: protocolWalletAddress,
          network: network,
          verified_on_chain: true
        }
      });
    });

    const newBalance = currentBalance + amount;

    console.log(`[Deposit] ✅ Deposit processed successfully. New balance: ${newBalance} SOL`);

    return NextResponse.json({
      success: true,
      newBalance,
      txHash,
      network,
      message: `Successfully deposited ${amount} SOL`,
      explorerUrl: network === 'mainnet-beta'
        ? `https://solscan.io/tx/${txHash}`
        : `https://solscan.io/tx/${txHash}?cluster=devnet`
    });

  } catch (error: any) {
    console.error('[Deposit API] Error depositing:', error);
    console.error('[Deposit API] Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      userId: body.userId || 'unknown',
      amount: body.amount || 'unknown',
      txHash: body.txHash || 'unknown',
    });
    return NextResponse.json(
      {
        error: 'Failed to process deposit',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check deposit status
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const txHash = searchParams.get('txHash');
    const network = searchParams.get('network') || 'devnet';

    if (!txHash) {
      return NextResponse.json(
        { error: 'Transaction hash required' },
        { status: 400 }
      );
    }

    const pool = getDatabasePool();
    if (!pool) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Check if transaction exists in our database
    const txResult = await pool.query(
      'SELECT * FROM transactions WHERE tx_hash = $1',
      [txHash]
    );

    if (txResult.rows.length > 0) {
      return NextResponse.json({
        success: true,
        status: 'processed',
        transaction: {
          type: txResult.rows[0].type,
          amount: parseFloat(txResult.rows[0].amount),
          status: txResult.rows[0].status,
          created_at: txResult.rows[0].created_at,
        }
      });
    }

    // Check on blockchain
    try {
      const connection = getConnection(network as 'devnet' | 'mainnet-beta');
      const txInfo = await connection.getTransaction(txHash, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

      if (txInfo) {
        return NextResponse.json({
          success: true,
          status: 'confirmed_on_chain',
          message: 'Transaction confirmed on blockchain but not yet processed by server'
        });
      }
    } catch (error) {
      console.error('Error checking transaction on chain:', error);
    }

    return NextResponse.json({
      success: true,
      status: 'pending',
      message: 'Transaction not found'
    });

  } catch (error) {
    console.error('Error checking deposit status:', error);
    return NextResponse.json(
      { error: 'Failed to check deposit status' },
      { status: 500 }
    );
  }
}
