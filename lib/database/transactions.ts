/**
 * Database Transaction Helper
 * Provides utilities for atomic database operations
 */

import { Pool, PoolClient } from 'pg';

export interface TransactionCallback<T> {
  (client: PoolClient): Promise<T>;
}

/**
 * Execute a function within a database transaction
 * Automatically handles BEGIN, COMMIT, and ROLLBACK
 *
 * @param pool - PostgreSQL connection pool
 * @param callback - Function to execute within transaction
 * @returns Result from callback
 * @throws Error if transaction fails
 */
export async function withTransaction<T>(
  pool: Pool,
  callback: TransactionCallback<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Deduct SOL from user's protocol balance atomically
 * ONLY deducts if sufficient balance exists
 *
 * @param client - Database client within transaction
 * @param userId - User's wallet address
 * @param amount - Amount to deduct
 * @throws Error if insufficient balance
 */
export async function deductProtocolBalance(
  client: PoolClient,
  userId: string,
  amount: number
): Promise<void> {
  const result = await client.query(
    `UPDATE users
     SET protocol_sol_balance = protocol_sol_balance - $1
     WHERE wallet_address = $2
     AND protocol_sol_balance >= $1
     RETURNING protocol_sol_balance`,
    [amount, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Insufficient protocol balance');
  }
}

/**
 * Add SOL to user's protocol balance atomically
 *
 * @param client - Database client within transaction
 * @param userId - User's wallet address
 * @param amount - Amount to add
 */
export async function addProtocolBalance(
  client: PoolClient,
  userId: string,
  amount: number
): Promise<void> {
  await client.query(
    'UPDATE users SET protocol_sol_balance = protocol_sol_balance + $1 WHERE wallet_address = $2',
    [amount, userId]
  );
}

/**
 * Record a transaction in the transactions table
 *
 * @param client - Database client within transaction
 * @param params - Transaction parameters
 */
export async function recordTransaction(
  client: PoolClient,
  params: {
    userId: string;
    type: 'deposit' | 'withdrawal' | 'buy' | 'sell' | 'refund' | 'token_swap';
    amount: number;
    txHash: string;
    status: 'pending' | 'completed' | 'failed';
    fees?: number;
    pnl?: number;
    metadata?: any;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO transactions (user_id, type, amount, tx_hash, status, fees, pnl, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      params.userId,
      params.type,
      params.amount,
      params.txHash,
      params.status,
      params.fees || 0,
      params.pnl || 0,
      params.metadata ? JSON.stringify(params.metadata) : null
    ]
  );
}
