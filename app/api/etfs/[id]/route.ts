import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { closeEtf, getConnection } from '@/lib/solana/program';
import { decryptPrivateKey, getKeypairFromPrivateKey } from '@/lib/solana/wallet';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pool = getDatabasePool();
    
    if (!pool) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      );
    }
    
    const result = await pool.query(
      'SELECT * FROM etf_listings WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'ETF not found' },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    const etf = {
      id: row.id,
      name: row.name,
      creator: row.creator,
      contract_address: row.contract_address,
      market_cap_at_list: parseFloat(row.market_cap_at_list),
      tokens: typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens,
      token_hash: row.token_hash,
      created_at: row.created_at,
    };

    return NextResponse.json({ success: true, etf });
  } catch (error) {
    console.error('Error fetching ETF:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ETF' },
      { status: 500 }
    );
  }
}

// DELETE endpoint to delete an ETF
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID (wallet address) is required' },
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

    // Check if ETF exists and user is the creator
    const etfResult = await pool.query(
      'SELECT creator FROM etf_listings WHERE id = $1',
      [id]
    );

    if (etfResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'ETF not found' },
        { status: 404 }
      );
    }

    if (etfResult.rows[0].creator !== userId) {
      return NextResponse.json(
        { error: 'You can only delete ETFs you created' },
        { status: 403 }
      );
    }

    // Get all investors in this ETF who have active positions
    // Portfolio table uses: amount (tokens), current_value (invested SOL)
    const investorsResult = await pool.query(
      `SELECT p.user_id, p.amount as tokens_held, p.current_value as invested_sol,
              w.public_key as protocol_wallet, w.encrypted_private_key
       FROM portfolio p
       JOIN wallets w ON p.user_id = w.user_id
       WHERE p.etf_id = $1 AND p.amount > 0`,
      [id]
    );

    console.log(`[Delete ETF] Found ${investorsResult.rows.length} investors to refund`);

    // Refund each investor
    const refunds: { userId: string; amount: number; success: boolean }[] = [];
    
    for (const investor of investorsResult.rows) {
      try {
        const refundAmount = parseFloat(investor.invested_sol) || 0;
        
        if (refundAmount <= 0) continue;

        // Update the investor's protocol balance (add back their invested SOL)
        await pool.query(
          'UPDATE users SET protocol_sol_balance = protocol_sol_balance + $1 WHERE wallet_address = $2',
          [refundAmount, investor.user_id]
        );

        // Record the refund transaction
        await pool.query(
          `INSERT INTO transactions (user_id, etf_id, type, amount, status, tx_hash)
           VALUES ($1, $2, 'refund', $3, 'completed', $4)`,
          [investor.user_id, id, refundAmount, `refund-${Date.now()}-${investor.user_id.slice(0, 8)}`]
        );

        refunds.push({ userId: investor.user_id, amount: refundAmount, success: true });
        console.log(`[Delete ETF] Refunded ${refundAmount} SOL to ${investor.user_id}`);
      } catch (refundError) {
        console.error(`[Delete ETF] Failed to refund ${investor.user_id}:`, refundError);
        refunds.push({ userId: investor.user_id, amount: 0, success: false });
      }
    }

    // Close the ETF on-chain (returns rent to lister)
    try {
      // Get the lister's (creator's) protocol wallet
      const listerWalletResult = await pool.query(
        'SELECT encrypted_private_key, public_key FROM wallets WHERE user_id = $1',
        [userId]
      );

      if (listerWalletResult.rows.length > 0) {
        const { encrypted_private_key } = listerWalletResult.rows[0];
        const privateKey = decryptPrivateKey(encrypted_private_key);
        const listerKeypair = getKeypairFromPrivateKey(privateKey);

        const connection = getConnection('devnet');

        console.log('[Delete ETF] Closing ETF PDA on-chain...');
        const closeTxSignature = await closeEtf(connection, listerKeypair);
        console.log('[Delete ETF] ✅ ETF PDA closed successfully:', closeTxSignature);
      } else {
        console.warn('[Delete ETF] Could not find lister wallet to close PDA');
      }
    } catch (closeError: any) {
      console.error('[Delete ETF] Failed to close ETF on-chain:', closeError.message);
      // Continue with database deletion even if on-chain close fails
      // The PDA might not exist or might have already been closed
    }

    // Delete related records first (investments, portfolio, fees, transactions)
    await pool.query('DELETE FROM fees WHERE etf_id = $1', [id]);
    await pool.query('DELETE FROM investments WHERE etf_id = $1', [id]);
    await pool.query('DELETE FROM portfolio WHERE etf_id = $1', [id]);
    await pool.query('DELETE FROM transactions WHERE etf_id = $1', [id]);

    // Delete the ETF
    await pool.query('DELETE FROM etf_listings WHERE id = $1', [id]);

    const totalRefunded = refunds.reduce((sum, r) => sum + (r.success ? r.amount : 0), 0);
    
    return NextResponse.json({ 
      success: true, 
      message: 'ETF deleted successfully',
      refunds: {
        count: refunds.filter(r => r.success).length,
        totalAmount: totalRefunded,
        details: refunds,
      }
    });
  } catch (error) {
    console.error('Error deleting ETF:', error);
    return NextResponse.json(
      { error: 'Failed to delete ETF' },
      { status: 500 }
    );
  }
}
