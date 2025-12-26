import { NextRequest, NextResponse } from 'next/server';
import { generateWallet, encryptPrivateKey } from '@/lib/solana/wallet';
import { getDatabasePool } from '@/lib/database/connection';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, xUsername } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    // Validate wallet address format
    if (walletAddress.length < 32 || walletAddress.length > 44) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }

    const pool = getDatabasePool();

    if (!pool) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      );
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [walletAddress]
    );

    if (existingUser.rows.length > 0) {
      // User exists - update X username if provided
      if (xUsername !== undefined) {
        await pool.query(
          'UPDATE users SET x_username = $2, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = $1',
          [walletAddress, xUsername || null]
        );
      }

      // Get updated user data
      const updatedUser = await pool.query(
        'SELECT * FROM users WHERE wallet_address = $1',
        [walletAddress]
      );

      // Get wallet info and protocol balance
      const walletResult = await pool.query(
        'SELECT w.public_key, u.protocol_sol_balance FROM wallets w JOIN users u ON w.user_id = u.wallet_address WHERE w.user_id = $1',
        [walletAddress]
      );

      const user = updatedUser.rows[0];
      const wallet = walletResult.rows[0];

      return NextResponse.json({
        success: true,
        user: {
          wallet_address: user.wallet_address,
          x_username: user.x_username,
          created_at: user.created_at,
        },
        protocolWallet: wallet ? {
          publicKey: wallet.public_key,
          balance: parseFloat(wallet.protocol_sol_balance || '0'),
        } : null,
        isNew: false,
      });
    }

    // Generate new protocol wallet for user
    const { publicKey, privateKey } = generateWallet();
    const encryptedPrivateKey = encryptPrivateKey(privateKey);

    // Create user
    const userResult = await pool.query(
      `INSERT INTO users (wallet_address, x_username)
       VALUES ($1, $2)
       RETURNING wallet_address, x_username, created_at`,
      [walletAddress, xUsername || null]
    );

    const user = userResult.rows[0];

    // Create protocol wallet
    await pool.query(
      `INSERT INTO wallets (user_id, public_key, encrypted_private_key, sol_balance)
       VALUES ($1, $2, $3, 0)`,
      [walletAddress, publicKey, encryptedPrivateKey]
    );

    return NextResponse.json({
      success: true,
      user: {
        wallet_address: user.wallet_address,
        x_username: user.x_username,
        created_at: user.created_at,
      },
      protocolWallet: {
        publicKey: publicKey,
        balance: 0,
      },
      isNew: true,
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}

// GET to fetch user info
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const walletAddress = searchParams.get('walletAddress');

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    const pool = getDatabasePool();

    if (!pool) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      );
    }

    const userResult = await pool.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [walletAddress]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const user = userResult.rows[0];

    // Get wallet info and protocol balance
    const walletResult = await pool.query(
      'SELECT w.public_key, w.exported_keys, u.protocol_sol_balance FROM wallets w JOIN users u ON w.user_id = u.wallet_address WHERE w.user_id = $1',
      [walletAddress]
    );

    const wallet = walletResult.rows[0];

    return NextResponse.json({
      success: true,
      user: {
        wallet_address: user.wallet_address,
        x_username: user.x_username,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      protocolWallet: wallet ? {
        publicKey: wallet.public_key,
        balance: parseFloat(wallet.protocol_sol_balance || '0'),
        exportedKeys: wallet.exported_keys,
      } : null,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// DELETE to remove user account
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    const pool = getDatabasePool();

    if (!pool) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      );
    }

    // Delete user (cascades to wallets, portfolio, etc.)
    const result = await pool.query(
      'DELETE FROM users WHERE wallet_address = $1 RETURNING wallet_address',
      [walletAddress]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
