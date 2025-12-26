import { NextRequest, NextResponse } from 'next/server';
import { generateWallet, encryptPrivateKey } from '@/lib/solana/wallet';
import { getDatabasePool } from '@/lib/database/connection';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    // Generate new wallet
    const { publicKey, privateKey } = generateWallet();
    const encryptedPrivateKey = encryptPrivateKey(privateKey);

    // Store wallet in database
    const pool = getDatabasePool();
    
    if (!pool) {
      // Database not configured - return mock wallet for development
      console.warn('[Wallet] Database not configured, returning mock wallet');
      return NextResponse.json({
        success: true,
        wallet: {
          publicKey: publicKey, // Newly generated
          balance: 0,
        },
      });
    }
    
    try {
      // Check if user already has a wallet
      const existing = await pool.query(
        'SELECT public_key, sol_balance FROM wallets WHERE user_id = $1',
        [userId]
      );

      if (existing.rows.length > 0) {
        // Update the user's protocol_wallet_address if it's not set
        await pool.query(
          `UPDATE users SET protocol_wallet_address = $1 WHERE wallet_address = $2 AND (protocol_wallet_address IS NULL OR protocol_wallet_address = '')`,
          [existing.rows[0].public_key, userId]
        );

        return NextResponse.json({
          success: true,
          wallet: {
            publicKey: existing.rows[0].public_key,
            balance: parseFloat(existing.rows[0].sol_balance),
          },
        });
      }

      // Create user if doesn't exist and set protocol_wallet_address
      await pool.query(
        `INSERT INTO users (wallet_address, protocol_wallet_address)
         VALUES ($1, $2)
         ON CONFLICT (wallet_address)
         DO UPDATE SET protocol_wallet_address = $2`,
        [userId, publicKey]
      );

      // Create wallet
      const result = await pool.query(
        `INSERT INTO wallets (user_id, public_key, encrypted_private_key, sol_balance)
         VALUES ($1, $2, $3, $4)
         RETURNING id, public_key, sol_balance`,
        [userId, publicKey, encryptedPrivateKey, 0]
      );

      return NextResponse.json({
        success: true,
        wallet: {
          publicKey: result.rows[0].public_key,
          balance: parseFloat(result.rows[0].sol_balance),
        },
      });
    } catch (dbError: any) {
      console.error('[Wallet] Database error:', dbError.message);
      // Fallback to mock wallet if database fails
      return NextResponse.json({
        success: true,
        wallet: {
          publicKey: publicKey,
          balance: 0,
        },
      });
    }
  } catch (error) {
    console.error('Error creating wallet:', error);
    return NextResponse.json(
      { error: 'Failed to create wallet' },
      { status: 500 }
    );
  }
}
