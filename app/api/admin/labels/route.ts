import { NextRequest, NextResponse } from 'next/server';
import { getAllUserLabels, setUserLabel, removeUserLabel, getUsersByLabel } from '@/lib/database/queries';
import { getDatabasePool } from '@/lib/database/connection';

// Verify admin token (same as other admin endpoints)
function verifyToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.substring(7);
  return token && token.length >= 32;
}

/**
 * GET /api/admin/labels
 * Get all user labels or filter by label type
 */
export async function GET(request: NextRequest) {
  if (!verifyToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const labelFilter = searchParams.get('label');

    // Ensure table exists
    const pool = getDatabasePool();
    if (pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_labels (
          wallet_address VARCHAR(64) PRIMARY KEY,
          label VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    let labels;
    if (labelFilter) {
      labels = await getUsersByLabel(labelFilter);
    } else {
      labels = await getAllUserLabels();
    }

    return NextResponse.json({
      success: true,
      labels,
    });
  } catch (error: any) {
    console.error('[Admin Labels] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch labels' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/labels
 * Add or update a user label
 */
export async function POST(request: NextRequest) {
  if (!verifyToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { walletAddress, label } = body;

    if (!walletAddress || !label) {
      return NextResponse.json(
        { error: 'walletAddress and label are required' },
        { status: 400 }
      );
    }

    // Validate wallet address format (basic check)
    if (walletAddress.length < 32 || walletAddress.length > 64) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }

    // Ensure table exists
    const pool = getDatabasePool();
    if (pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_labels (
          wallet_address VARCHAR(64) PRIMARY KEY,
          label VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    const result = await setUserLabel(walletAddress, label);

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to set label' },
        { status: 500 }
      );
    }

    console.log(`[Admin Labels] Set label '${label}' for wallet ${walletAddress}`);

    return NextResponse.json({
      success: true,
      label: result,
    });
  } catch (error: any) {
    console.error('[Admin Labels] Error:', error);
    return NextResponse.json(
      { error: 'Failed to set label' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/labels
 * Remove a user label
 */
export async function DELETE(request: NextRequest) {
  if (!verifyToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      );
    }

    const removed = await removeUserLabel(walletAddress);

    if (!removed) {
      return NextResponse.json(
        { error: 'Label not found or failed to remove' },
        { status: 404 }
      );
    }

    console.log(`[Admin Labels] Removed label for wallet ${walletAddress}`);

    return NextResponse.json({
      success: true,
      message: 'Label removed',
    });
  } catch (error: any) {
    console.error('[Admin Labels] Error:', error);
    return NextResponse.json(
      { error: 'Failed to remove label' },
      { status: 500 }
    );
  }
}
