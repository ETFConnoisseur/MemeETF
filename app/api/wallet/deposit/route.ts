import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getConnection } from '@/lib/solana/wallet';

export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
    const { userId, amount, txHash } = body;

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

    const pool = getDatabasePool();
    if (!pool) {
      console.error('[Deposit API] Database pool is null');
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Check if this transaction has already been processed
    let existingTx;
    try {
      existingTx = await pool.query(
      'SELECT id FROM transactions WHERE tx_hash = $1',
      [txHash]
      );
    } catch (queryError: any) {
      console.error('[Deposit API] Query failed:', queryError);
      if (queryError.code === '42P01') {
        // Table doesn't exist - this is a critical error
        return NextResponse.json({ 
          error: 'Database tables not initialized. Please run migrations.' 
        }, { status: 503 });
      }
      throw queryError;
    }

    if (existingTx.rows.length > 0) {
      return NextResponse.json(
        { error: 'Transaction already processed' },
        { status: 400 }
      );
    }

    // Verify transaction on Solana (optional but recommended)
    try {
      const connection = getConnection('devnet');
      const txInfo = await connection.getTransaction(txHash, {
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
        return NextResponse.json(
          { error: 'Transaction failed on blockchain' },
          { status: 400 }
        );
      }
    } catch (verifyError) {
      console.warn('[Deposit] Could not verify transaction on chain:', verifyError);
      // Continue anyway for testing - in production, you might want to fail here
    }

    // Get user's protocol wallet and current protocol balance
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
        { error: 'Protocol wallet not initialized' },
        { status: 400 }
      );
    }

    // Update protocol balance
    await pool.query(
      'UPDATE users SET protocol_sol_balance = protocol_sol_balance + $1 WHERE wallet_address = $2',
      [amount, userId]
    );

    // Record in transactions table
    await pool.query(
      `INSERT INTO transactions (user_id, type, amount, tx_hash, status)
       VALUES ($1, 'deposit', $2, $3, 'completed')`,
      [userId, amount, txHash]
    );

    const newBalance = currentBalance + amount;

    return NextResponse.json({
      success: true,
      newBalance,
      txHash,
      message: `Successfully deposited ${amount} SOL`
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
      const connection = getConnection('devnet');
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
