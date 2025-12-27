import { getDatabasePool } from './connection';
import { User, ETF, Investment, Transaction, Fee, Wallet, PortfolioPosition, TokenInfo } from '@/types';

// =============================================================================
// USER QUERIES
// =============================================================================

export async function getUserByWallet(walletAddress: string): Promise<User | null> {
  const pool = getDatabasePool();
  if (!pool) return null;
  
  const result = await pool.query(
    'SELECT * FROM users WHERE wallet_address = $1',
    [walletAddress]
  );
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    wallet_address: row.wallet_address,
    x_username: row.x_username,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createUser(walletAddress: string, xUsername?: string): Promise<User | null> {
  const pool = getDatabasePool();
  if (!pool) return null;
  
  const result = await pool.query(
    `INSERT INTO users (wallet_address, x_username)
     VALUES ($1, $2)
     ON CONFLICT (wallet_address) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [walletAddress, xUsername || null]
  );
  
  const row = result.rows[0];
  return {
    wallet_address: row.wallet_address,
    x_username: row.x_username,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function updateUserXUsername(walletAddress: string, xUsername: string): Promise<User | null> {
  const pool = getDatabasePool();
  if (!pool) return null;
  
  const result = await pool.query(
    `UPDATE users SET x_username = $2, updated_at = CURRENT_TIMESTAMP
     WHERE wallet_address = $1
     RETURNING *`,
    [walletAddress, xUsername]
  );
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    wallet_address: row.wallet_address,
    x_username: row.x_username,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// =============================================================================
// WALLET QUERIES
// =============================================================================

export async function getWalletByUserId(userId: string): Promise<Wallet | null> {
  const pool = getDatabasePool();
  if (!pool) return null;
  
  const result = await pool.query(
    'SELECT * FROM wallets WHERE user_id = $1',
    [userId]
  );
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    id: row.id,
    user_id: row.user_id,
    public_key: row.public_key,
    sol_balance: parseFloat(row.sol_balance),
    exported_keys: row.exported_keys,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createWallet(
  userId: string,
  publicKey: string,
  encryptedPrivateKey: string
): Promise<Wallet | null> {
  const pool = getDatabasePool();
  if (!pool) return null;
  
  // First ensure user exists
  await pool.query(
    `INSERT INTO users (wallet_address) VALUES ($1) ON CONFLICT (wallet_address) DO NOTHING`,
    [userId]
  );
  
  const result = await pool.query(
    `INSERT INTO wallets (user_id, public_key, encrypted_private_key, sol_balance)
     VALUES ($1, $2, $3, 0)
     RETURNING *`,
    [userId, publicKey, encryptedPrivateKey]
  );
  
  const row = result.rows[0];
  return {
    id: row.id,
    user_id: row.user_id,
    public_key: row.public_key,
    sol_balance: parseFloat(row.sol_balance),
    exported_keys: row.exported_keys,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// =============================================================================
// PROTOCOL BALANCE QUERIES (Use these for custodial balance operations)
// =============================================================================

export async function getProtocolBalance(walletAddress: string): Promise<number> {
  const pool = getDatabasePool();
  if (!pool) return 0;

  const result = await pool.query(
    'SELECT protocol_sol_balance FROM users WHERE wallet_address = $1',
    [walletAddress]
  );

  return result.rows.length > 0 ? parseFloat(result.rows[0].protocol_sol_balance || 0) : 0;
}

export async function updateProtocolBalance(walletAddress: string, newBalance: number): Promise<void> {
  const pool = getDatabasePool();
  if (!pool) return;

  await pool.query(
    'UPDATE users SET protocol_sol_balance = $2 WHERE wallet_address = $1',
    [walletAddress, newBalance]
  );
}

export async function incrementProtocolBalance(walletAddress: string, amount: number): Promise<number> {
  const pool = getDatabasePool();
  if (!pool) return 0;

  const result = await pool.query(
    `UPDATE users SET protocol_sol_balance = protocol_sol_balance + $2
     WHERE wallet_address = $1
     RETURNING protocol_sol_balance`,
    [walletAddress, amount]
  );

  return result.rows.length > 0 ? parseFloat(result.rows[0].protocol_sol_balance || 0) : 0;
}

export async function decrementProtocolBalance(walletAddress: string, amount: number): Promise<number> {
  const pool = getDatabasePool();
  if (!pool) return 0;

  const result = await pool.query(
    `UPDATE users SET protocol_sol_balance = protocol_sol_balance - $2
     WHERE wallet_address = $1 AND protocol_sol_balance >= $2
     RETURNING protocol_sol_balance`,
    [walletAddress, amount]
  );

  return result.rows.length > 0 ? parseFloat(result.rows[0].protocol_sol_balance || 0) : 0;
}

// =============================================================================
// DEPRECATED WALLET BALANCE QUERIES (DO NOT USE - Use protocol balance instead)
// =============================================================================
// These functions operate on the deprecated wallets.sol_balance field
// Use the protocol balance functions above instead

/**
 * @deprecated Use updateProtocolBalance instead
 */
export async function updateWalletBalance(userId: string, newBalance: number): Promise<void> {
  const pool = getDatabasePool();
  if (!pool) return;

  await pool.query(
    `UPDATE wallets SET sol_balance = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
    [userId, newBalance]
  );
}

/**
 * @deprecated Use incrementProtocolBalance instead
 */
export async function incrementWalletBalance(userId: string, amount: number): Promise<number> {
  const pool = getDatabasePool();
  if (!pool) return 0;

  const result = await pool.query(
    `UPDATE wallets SET sol_balance = sol_balance + $2, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1
     RETURNING sol_balance`,
    [userId, amount]
  );

  return result.rows.length > 0 ? parseFloat(result.rows[0].sol_balance) : 0;
}

/**
 * @deprecated Use decrementProtocolBalance instead
 */
export async function decrementWalletBalance(userId: string, amount: number): Promise<number> {
  const pool = getDatabasePool();
  if (!pool) return 0;

  const result = await pool.query(
    `UPDATE wallets SET sol_balance = sol_balance - $2, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND sol_balance >= $2
     RETURNING sol_balance`,
    [userId, amount]
  );

  return result.rows.length > 0 ? parseFloat(result.rows[0].sol_balance) : 0;
}

export async function getWalletWithPrivateKey(userId: string): Promise<{ wallet: Wallet; encryptedPrivateKey: string } | null> {
  const pool = getDatabasePool();
  if (!pool) return null;
  
  const result = await pool.query(
    'SELECT * FROM wallets WHERE user_id = $1',
    [userId]
  );
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    wallet: {
      id: row.id,
      user_id: row.user_id,
      public_key: row.public_key,
      sol_balance: parseFloat(row.sol_balance),
      exported_keys: row.exported_keys,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    encryptedPrivateKey: row.encrypted_private_key,
  };
}

// =============================================================================
// ETF QUERIES
// =============================================================================

export async function getETFById(etfId: string): Promise<ETF | null> {
  const pool = getDatabasePool();
  if (!pool) return null;
  
  const result = await pool.query(
    'SELECT * FROM etf_listings WHERE id = $1',
    [etfId]
  );
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    creator: row.creator,
    contract_address: row.contract_address,
    tokens: typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens,
    market_cap_at_list: parseFloat(row.market_cap_at_list),
    token_hash: row.token_hash,
    created_at: row.created_at,
  };
}

export async function getAllETFs(limit: number = 100): Promise<ETF[]> {
  const pool = getDatabasePool();
  if (!pool) return [];
  
  const result = await pool.query(
    'SELECT * FROM etf_listings ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  
  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    creator: row.creator,
    contract_address: row.contract_address,
    tokens: typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens,
    market_cap_at_list: parseFloat(row.market_cap_at_list),
    token_hash: row.token_hash,
    created_at: row.created_at,
  }));
}

export async function getETFsByCreator(creatorWallet: string): Promise<ETF[]> {
  const pool = getDatabasePool();
  if (!pool) return [];
  
  const result = await pool.query(
    'SELECT * FROM etf_listings WHERE creator = $1 ORDER BY created_at DESC',
    [creatorWallet]
  );
  
  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    creator: row.creator,
    contract_address: row.contract_address,
    tokens: typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens,
    market_cap_at_list: parseFloat(row.market_cap_at_list),
    token_hash: row.token_hash,
    created_at: row.created_at,
  }));
}

export async function getETFByTokenHash(tokenHash: string): Promise<ETF | null> {
  const pool = getDatabasePool();
  if (!pool) return null;
  
  const result = await pool.query(
    'SELECT * FROM etf_listings WHERE token_hash = $1',
    [tokenHash]
  );
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    creator: row.creator,
    contract_address: row.contract_address,
    tokens: typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens,
    market_cap_at_list: parseFloat(row.market_cap_at_list),
    token_hash: row.token_hash,
    created_at: row.created_at,
  };
}

export async function createETF(
  name: string,
  creator: string,
  contractAddress: string,
  tokens: TokenInfo[],
  marketCapAtList: number,
  tokenHash: string
): Promise<ETF | null> {
  const pool = getDatabasePool();
  if (!pool) return null;
  
  const result = await pool.query(
    `INSERT INTO etf_listings (name, creator, contract_address, tokens, market_cap_at_list, token_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, creator, contractAddress, JSON.stringify(tokens), marketCapAtList, tokenHash]
  );
  
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    creator: row.creator,
    contract_address: row.contract_address,
    tokens: typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens,
    market_cap_at_list: parseFloat(row.market_cap_at_list),
    token_hash: row.token_hash,
    created_at: row.created_at,
  };
}

// =============================================================================
// INVESTMENT QUERIES
// =============================================================================

export async function getInvestmentsByUser(userId: string): Promise<Investment[]> {
  const pool = getDatabasePool();
  if (!pool) return [];
  
  const result = await pool.query(
    'SELECT * FROM investments WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  
  return result.rows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    etf_id: row.etf_id,
    sol_amount: parseFloat(row.sol_amount),
    entry_market_cap: parseFloat(row.entry_market_cap),
    tokens_received: parseFloat(row.tokens_received),
    created_at: row.created_at,
  }));
}

export async function getInvestmentsByETF(etfId: string): Promise<Investment[]> {
  const pool = getDatabasePool();
  if (!pool) return [];
  
  const result = await pool.query(
    'SELECT * FROM investments WHERE etf_id = $1 ORDER BY created_at DESC',
    [etfId]
  );
  
  return result.rows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    etf_id: row.etf_id,
    sol_amount: parseFloat(row.sol_amount),
    entry_market_cap: parseFloat(row.entry_market_cap),
    tokens_received: parseFloat(row.tokens_received),
    created_at: row.created_at,
  }));
}

export async function createInvestment(
  userId: string,
  etfId: string,
  solAmount: number,
  entryMarketCap: number,
  tokensReceived: number
): Promise<Investment | null> {
  const pool = getDatabasePool();
  if (!pool) return null;
  
  const result = await pool.query(
    `INSERT INTO investments (user_id, etf_id, sol_amount, entry_market_cap, tokens_received)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, etfId, solAmount, entryMarketCap, tokensReceived]
  );
  
  const row = result.rows[0];
  return {
    id: row.id,
    user_id: row.user_id,
    etf_id: row.etf_id,
    sol_amount: parseFloat(row.sol_amount),
    entry_market_cap: parseFloat(row.entry_market_cap),
    tokens_received: parseFloat(row.tokens_received),
    created_at: row.created_at,
  };
}

export async function deleteInvestment(investmentId: string): Promise<boolean> {
  const pool = getDatabasePool();
  if (!pool) return false;
  
  const result = await pool.query(
    'DELETE FROM investments WHERE id = $1 RETURNING id',
    [investmentId]
  );
  
  return result.rows.length > 0;
}

// =============================================================================
// PORTFOLIO QUERIES
// =============================================================================

export async function getPortfolioByUser(userId: string): Promise<PortfolioPosition[]> {
  const pool = getDatabasePool();
  if (!pool) return [];
  
  const result = await pool.query(
    'SELECT * FROM portfolio WHERE user_id = $1',
    [userId]
  );
  
  return result.rows.map(row => ({
    user_id: row.user_id,
    etf_id: row.etf_id,
    amount: parseFloat(row.amount),
    entry_price: parseFloat(row.entry_price),
    current_value: parseFloat(row.current_value),
  }));
}

export async function getPortfolioWithETFs(userId: string): Promise<Array<{ position: PortfolioPosition; etf: ETF }>> {
  const pool = getDatabasePool();
  if (!pool) return [];
  
  const result = await pool.query(
    `SELECT p.*, e.*
     FROM portfolio p
     JOIN etf_listings e ON p.etf_id = e.id
     WHERE p.user_id = $1`,
    [userId]
  );
  
  return result.rows.map(row => ({
    position: {
      user_id: row.user_id,
      etf_id: row.etf_id,
      amount: parseFloat(row.amount),
      entry_price: parseFloat(row.entry_price),
      current_value: parseFloat(row.current_value),
    },
    etf: {
      id: row.id,
      name: row.name,
      creator: row.creator,
      contract_address: row.contract_address,
      tokens: typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens,
      market_cap_at_list: parseFloat(row.market_cap_at_list),
      token_hash: row.token_hash,
      created_at: row.created_at,
    },
  }));
}

export async function upsertPortfolioPosition(
  userId: string,
  etfId: string,
  amount: number,
  entryPrice: number,
  currentValue: number
): Promise<void> {
  const pool = getDatabasePool();
  if (!pool) return;
  
  await pool.query(
    `INSERT INTO portfolio (user_id, etf_id, amount, entry_price, current_value)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, etf_id) 
     DO UPDATE SET 
       amount = portfolio.amount + $3,
       current_value = portfolio.current_value + $5,
       entry_price = (portfolio.entry_price * portfolio.amount + $4 * $3) / (portfolio.amount + $3)`,
    [userId, etfId, amount, entryPrice, currentValue]
  );
}

export async function removeFromPortfolio(userId: string, etfId: string, amount: number): Promise<void> {
  const pool = getDatabasePool();
  if (!pool) return;
  
  // First check current position
  const current = await pool.query(
    'SELECT amount FROM portfolio WHERE user_id = $1 AND etf_id = $2',
    [userId, etfId]
  );
  
  if (current.rows.length === 0) return;
  
  const currentAmount = parseFloat(current.rows[0].amount);
  
  if (currentAmount <= amount) {
    // Remove entire position
    await pool.query(
      'DELETE FROM portfolio WHERE user_id = $1 AND etf_id = $2',
      [userId, etfId]
    );
  } else {
    // Reduce position
    await pool.query(
      `UPDATE portfolio SET amount = amount - $3, current_value = current_value * (1 - $3 / amount)
       WHERE user_id = $1 AND etf_id = $2`,
      [userId, etfId, amount]
    );
  }
}

// =============================================================================
// TRANSACTION QUERIES
// =============================================================================

export async function getTransactionsByUser(userId: string, limit: number = 50): Promise<Transaction[]> {
  const pool = getDatabasePool();
  if (!pool) return [];
  
  const result = await pool.query(
    'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  );
  
  return result.rows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    amount: parseFloat(row.amount),
    status: row.status,
    tx_hash: row.tx_hash,
    fees: parseFloat(row.fees || 0),
    etf_id: row.etf_id,
    created_at: row.created_at,
  }));
}

export async function createTransaction(
  userId: string,
  type: 'deposit' | 'withdrawal' | 'buy' | 'sell',
  amount: number,
  status: string = 'pending',
  txHash?: string,
  fees: number = 0,
  etfId?: string
): Promise<Transaction | null> {
  const pool = getDatabasePool();
  if (!pool) return null;
  
  const result = await pool.query(
    `INSERT INTO transactions (user_id, type, amount, status, tx_hash, fees, etf_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId, type, amount, status, txHash || null, fees, etfId || null]
  );
  
  const row = result.rows[0];
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    amount: parseFloat(row.amount),
    status: row.status,
    tx_hash: row.tx_hash,
    fees: parseFloat(row.fees || 0),
    etf_id: row.etf_id,
    created_at: row.created_at,
  };
}

export async function updateTransactionStatus(
  transactionId: string,
  status: string,
  txHash?: string
): Promise<void> {
  const pool = getDatabasePool();
  if (!pool) return;
  
  if (txHash) {
    await pool.query(
      'UPDATE transactions SET status = $2, tx_hash = $3 WHERE id = $1',
      [transactionId, status, txHash]
    );
  } else {
    await pool.query(
      'UPDATE transactions SET status = $2 WHERE id = $1',
      [transactionId, status]
    );
  }
}

// =============================================================================
// FEE QUERIES
// =============================================================================

export async function createFee(
  etfId: string,
  listerFee: number,
  platformFee: number
): Promise<Fee | null> {
  const pool = getDatabasePool();
  if (!pool) return null;
  
  const result = await pool.query(
    `INSERT INTO fees (etf_id, lister_fee, platform_fee, paid_out)
     VALUES ($1, $2, $3, FALSE)
     RETURNING *`,
    [etfId, listerFee, platformFee]
  );
  
  const row = result.rows[0];
  return {
    id: row.id,
    etf_id: row.etf_id,
    lister_fee: parseFloat(row.lister_fee),
    platform_fee: parseFloat(row.platform_fee),
    paid_out: row.paid_out,
    created_at: row.created_at,
  };
}

export async function getUnclaimedFeesByCreator(creatorWallet: string): Promise<Fee[]> {
  const pool = getDatabasePool();
  if (!pool) return [];
  
  const result = await pool.query(
    `SELECT f.* FROM fees f
     JOIN etf_listings e ON f.etf_id = e.id
     WHERE e.creator = $1 AND f.paid_out = FALSE
     ORDER BY f.created_at DESC`,
    [creatorWallet]
  );
  
  return result.rows.map(row => ({
    id: row.id,
    etf_id: row.etf_id,
    lister_fee: parseFloat(row.lister_fee),
    platform_fee: parseFloat(row.platform_fee),
    paid_out: row.paid_out,
    created_at: row.created_at,
  }));
}

export async function getTotalFeesEarnedByCreator(creatorWallet: string): Promise<number> {
  const pool = getDatabasePool();
  if (!pool) return 0;
  
  const result = await pool.query(
    `SELECT COALESCE(SUM(f.lister_fee), 0) as total
     FROM fees f
     JOIN etf_listings e ON f.etf_id = e.id
     WHERE e.creator = $1`,
    [creatorWallet]
  );
  
  return parseFloat(result.rows[0].total || 0);
}

export async function getUnclaimedFeesAmountByCreator(creatorWallet: string): Promise<number> {
  const pool = getDatabasePool();
  if (!pool) return 0;
  
  const result = await pool.query(
    `SELECT COALESCE(SUM(f.lister_fee), 0) as total
     FROM fees f
     JOIN etf_listings e ON f.etf_id = e.id
     WHERE e.creator = $1 AND f.paid_out = FALSE`,
    [creatorWallet]
  );
  
  return parseFloat(result.rows[0].total || 0);
}

export async function getTotalFeesPaidByUser(userId: string): Promise<number> {
  const pool = getDatabasePool();
  if (!pool) return 0;
  
  const result = await pool.query(
    `SELECT COALESCE(SUM(fees), 0) as total
     FROM transactions
     WHERE user_id = $1 AND type IN ('buy', 'sell')`,
    [userId]
  );
  
  return parseFloat(result.rows[0].total || 0);
}

export async function markFeesAsPaid(etfId: string): Promise<void> {
  const pool = getDatabasePool();
  if (!pool) return;
  
  await pool.query(
    'UPDATE fees SET paid_out = TRUE WHERE etf_id = $1 AND paid_out = FALSE',
    [etfId]
  );
}

export async function markAllFeesAsPaidForCreator(creatorWallet: string): Promise<number> {
  const pool = getDatabasePool();
  if (!pool) return 0;
  
  // First get total unclaimed
  const total = await getUnclaimedFeesAmountByCreator(creatorWallet);
  
  // Mark as paid
  await pool.query(
    `UPDATE fees SET paid_out = TRUE
     WHERE etf_id IN (SELECT id FROM etf_listings WHERE creator = $1)
     AND paid_out = FALSE`,
    [creatorWallet]
  );
  
  return total;
}

// =============================================================================
// LEADERBOARD QUERIES
// =============================================================================

export async function getLeaderboard(limit: number = 100): Promise<Array<{ etf: ETF; performance: number; currentMarketCap: number }>> {
  const pool = getDatabasePool();
  if (!pool) return [];
  
  // For now, return ETFs ordered by market cap
  // In production, this would use performance data
  const result = await pool.query(
    `SELECT * FROM etf_listings ORDER BY market_cap_at_list DESC LIMIT $1`,
    [limit]
  );
  
  return result.rows.map(row => ({
    etf: {
      id: row.id,
      name: row.name,
      creator: row.creator,
      contract_address: row.contract_address,
      tokens: typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens,
      market_cap_at_list: parseFloat(row.market_cap_at_list),
      token_hash: row.token_hash,
      created_at: row.created_at,
    },
    performance: 0, // TODO: Calculate from price data
    currentMarketCap: parseFloat(row.market_cap_at_list),
  }));
}

// =============================================================================
// UTILITY QUERIES
// =============================================================================

export async function testConnection(): Promise<boolean> {
  const pool = getDatabasePool();
  if (!pool) return false;

  try {
    const result = await pool.query('SELECT 1 as test');
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

// =============================================================================
// USER LABEL QUERIES
// =============================================================================

export interface UserLabel {
  wallet_address: string;
  label: string;
  created_at: Date;
}

export async function getUserLabel(walletAddress: string): Promise<string | null> {
  const pool = getDatabasePool();
  if (!pool) return null;

  const result = await pool.query(
    'SELECT label FROM user_labels WHERE wallet_address = $1',
    [walletAddress]
  );

  return result.rows.length > 0 ? result.rows[0].label : null;
}

export async function setUserLabel(walletAddress: string, label: string): Promise<UserLabel | null> {
  const pool = getDatabasePool();
  if (!pool) return null;

  const result = await pool.query(
    `INSERT INTO user_labels (wallet_address, label)
     VALUES ($1, $2)
     ON CONFLICT (wallet_address) DO UPDATE SET label = $2
     RETURNING *`,
    [walletAddress, label]
  );

  if (result.rows.length === 0) return null;

  return {
    wallet_address: result.rows[0].wallet_address,
    label: result.rows[0].label,
    created_at: result.rows[0].created_at,
  };
}

export async function removeUserLabel(walletAddress: string): Promise<boolean> {
  const pool = getDatabasePool();
  if (!pool) return false;

  const result = await pool.query(
    'DELETE FROM user_labels WHERE wallet_address = $1 RETURNING wallet_address',
    [walletAddress]
  );

  return result.rows.length > 0;
}

export async function getUsersByLabel(label: string): Promise<UserLabel[]> {
  const pool = getDatabasePool();
  if (!pool) return [];

  const result = await pool.query(
    'SELECT * FROM user_labels WHERE label = $1 ORDER BY created_at DESC',
    [label]
  );

  return result.rows.map(row => ({
    wallet_address: row.wallet_address,
    label: row.label,
    created_at: row.created_at,
  }));
}

export async function getAllUserLabels(): Promise<UserLabel[]> {
  const pool = getDatabasePool();
  if (!pool) return [];

  const result = await pool.query(
    'SELECT * FROM user_labels ORDER BY created_at DESC'
  );

  return result.rows.map(row => ({
    wallet_address: row.wallet_address,
    label: row.label,
    created_at: row.created_at,
  }));
}

export async function getKOLWallets(): Promise<string[]> {
  const pool = getDatabasePool();
  if (!pool) return [];

  const result = await pool.query(
    "SELECT wallet_address FROM user_labels WHERE label = 'KOL'"
  );

  return result.rows.map(row => row.wallet_address);
}
