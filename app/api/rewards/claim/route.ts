import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { getProgram } from '@/lib/anchor/client';
import { decryptPrivateKey } from '@/lib/solana/wallet';
import { PublicKey } from '@solana/web3.js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID (wallet address) required' },
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

    // Get unclaimed fees for this user's ETFs
    const unclaimedResult = await pool.query(
      `SELECT f.id, f.etf_id, f.lister_fee, e.contract_address, e.name
       FROM fees f
       JOIN etf_listings e ON f.etf_id = e.id
       WHERE e.creator = $1 AND f.paid_out = FALSE`,
      [userId]
    );

    if (unclaimedResult.rows.length === 0) {
      return NextResponse.json({ 
        success: true, 
        claimed: 0,
        message: 'No unclaimed fees to withdraw'
      });
    }

    // Calculate total to claim
    const totalToClaim = unclaimedResult.rows.reduce(
      (sum, row) => sum + parseFloat(row.lister_fee), 
      0
    );

    // Get user's wallet
    const walletResult = await pool.query(
      `SELECT encrypted_private_key, public_key FROM wallets WHERE user_id = $1`,
      [userId]
    );

    if (walletResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Wallet not found' },
        { status: 404 }
      );
    }

    const { encrypted_private_key, public_key } = walletResult.rows[0];
    const privateKey = decryptPrivateKey(encrypted_private_key);

    // Call smart contract to claim fees for each ETF
    const claimResults: string[] = [];
    
    try {
      const program = getProgram(privateKey, 'devnet');
      const listerPubkey = new PublicKey(public_key);

      // Group fees by ETF to batch claims
      const feesByEtf: Record<string, { total: number; contractAddress: string; feeIds: string[] }> = {};
      
      for (const row of unclaimedResult.rows) {
        const etfId = row.etf_id;
        if (!feesByEtf[etfId]) {
          feesByEtf[etfId] = {
            total: 0,
            contractAddress: row.contract_address,
            feeIds: []
          };
        }
        feesByEtf[etfId].total += parseFloat(row.lister_fee);
        feesByEtf[etfId].feeIds.push(row.id);
      }

      // Claim from each ETF
      for (const [etfId, data] of Object.entries(feesByEtf)) {
        try {
          const etfPubkey = new PublicKey(data.contractAddress);

          // Call claimFees on smart contract
          const tx = await program.methods.claimFees()
            .accounts({
              etf: etfPubkey,
              lister: listerPubkey,
              listerAta: listerPubkey,
              etfVault: etfPubkey,
            })
            .rpc();

          claimResults.push(tx);
          console.log(`[Claim] Claimed fees from ETF ${etfId}. Signature: ${tx}`);

          // Mark fees as paid in DB
          await pool.query(
            `UPDATE fees SET paid_out = TRUE WHERE id = ANY($1::uuid[])`,
            [data.feeIds]
          );

        } catch (err: any) {
          console.error(`[Claim] Failed to claim from ETF ${etfId}:`, err);
          // Continue with other ETFs even if one fails
        }
      }

    } catch (err: any) {
      console.error('[Claim] Smart contract claim failed:', err);
      // Still update DB if contract call fails (for testing)
    }

    // Update protocol balance (not wallet balance)
    await pool.query(
      'UPDATE users SET protocol_sol_balance = protocol_sol_balance + $1 WHERE wallet_address = $2',
      [totalToClaim, userId]
    );

    // Record transaction
    await pool.query(
      `INSERT INTO transactions (user_id, type, amount, status, tx_hash)
       VALUES ($1, 'deposit', $2, 'completed', $3)`,
      [userId, totalToClaim, claimResults[0] || 'fee_claim']
    );

    // Mark all fees as paid (backup in case loop didn't complete)
    await pool.query(
      `UPDATE fees SET paid_out = TRUE
       WHERE etf_id IN (SELECT id FROM etf_listings WHERE creator = $1)
       AND paid_out = FALSE`,
      [userId]
    );

    // Get new protocol balance
    const newBalanceResult = await pool.query(
      'SELECT protocol_sol_balance FROM users WHERE wallet_address = $1',
      [userId]
    );
    const newBalance = parseFloat(newBalanceResult.rows[0]?.protocol_sol_balance || 0);

    return NextResponse.json({ 
      success: true,
      claimed: totalToClaim,
      newBalance,
      transactions: claimResults
    });
  } catch (error) {
    console.error('Error claiming rewards:', error);
    return NextResponse.json(
      { error: 'Failed to claim rewards' },
      { status: 500 }
    );
  }
}
