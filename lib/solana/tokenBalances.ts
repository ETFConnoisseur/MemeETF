/**
 * On-chain Token Balance Reading
 *
 * NON-CUSTODIAL: Reads token balances directly from the user's wallet on-chain
 * No database needed - all data comes from the blockchain
 */

import {
  Connection,
  PublicKey,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  TokenAccountNotFoundError,
} from '@solana/spl-token';

export interface TokenBalance {
  mint: string;
  amount: number; // Raw amount (with decimals)
  decimals: number;
  uiAmount: number; // Human-readable amount
}

export interface WalletTokenHoldings {
  wallet: string;
  solBalance: number;
  tokens: TokenBalance[];
  network: 'devnet' | 'mainnet-beta';
}

/**
 * Get connection to Solana network
 */
export function getConnection(network: 'devnet' | 'mainnet-beta'): Connection {
  const rpcUrl = network === 'devnet'
    ? clusterApiUrl('devnet')
    : process.env.MAINNET_RPC_URL || clusterApiUrl('mainnet-beta');
  return new Connection(rpcUrl, 'confirmed');
}

/**
 * Get SOL balance for a wallet
 */
export async function getSolBalance(
  connection: Connection,
  wallet: PublicKey
): Promise<number> {
  const balance = await connection.getBalance(wallet);
  return balance / 1e9; // Convert lamports to SOL
}

/**
 * Get balance of a specific token for a wallet
 */
export async function getTokenBalance(
  connection: Connection,
  wallet: PublicKey,
  tokenMint: PublicKey
): Promise<TokenBalance | null> {
  try {
    const ata = await getAssociatedTokenAddress(tokenMint, wallet);
    const account = await getAccount(connection, ata);

    // Get mint info for decimals
    const mintInfo = await connection.getParsedAccountInfo(tokenMint);
    const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals || 9;

    return {
      mint: tokenMint.toBase58(),
      amount: Number(account.amount),
      decimals,
      uiAmount: Number(account.amount) / Math.pow(10, decimals),
    };
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) {
      return null; // Token account doesn't exist (user has no tokens)
    }
    throw error;
  }
}

/**
 * Get all token balances for a wallet
 * Fetches all SPL token accounts owned by the wallet
 */
export async function getAllTokenBalances(
  connection: Connection,
  wallet: PublicKey
): Promise<TokenBalance[]> {
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    wallet,
    { programId: TOKEN_PROGRAM_ID }
  );

  return tokenAccounts.value.map(account => {
    const parsed = account.account.data.parsed.info;
    return {
      mint: parsed.mint,
      amount: parseInt(parsed.tokenAmount.amount),
      decimals: parsed.tokenAmount.decimals,
      uiAmount: parseFloat(parsed.tokenAmount.uiAmountString || '0'),
    };
  }).filter(t => t.amount > 0); // Only return tokens with balance
}

/**
 * Get specific token balances for an ETF portfolio
 * Only checks the tokens that are part of the ETF
 */
export async function getEtfTokenBalances(
  connection: Connection,
  wallet: PublicKey,
  tokenMints: string[]
): Promise<TokenBalance[]> {
  const balances: TokenBalance[] = [];

  for (const mint of tokenMints) {
    try {
      const balance = await getTokenBalance(
        connection,
        wallet,
        new PublicKey(mint)
      );
      if (balance && balance.amount > 0) {
        balances.push(balance);
      }
    } catch (error) {
      console.error(`Error fetching balance for ${mint}:`, error);
    }
  }

  return balances;
}

/**
 * Get complete wallet holdings (SOL + all tokens)
 */
export async function getWalletHoldings(
  wallet: string,
  network: 'devnet' | 'mainnet-beta' = 'devnet'
): Promise<WalletTokenHoldings> {
  const connection = getConnection(network);
  const walletPubkey = new PublicKey(wallet);

  const [solBalance, tokens] = await Promise.all([
    getSolBalance(connection, walletPubkey),
    getAllTokenBalances(connection, walletPubkey),
  ]);

  return {
    wallet,
    solBalance,
    tokens,
    network,
  };
}

/**
 * Check if user has sufficient balance for an ETF purchase
 */
export async function checkSufficientBalance(
  wallet: string,
  solAmount: number,
  network: 'devnet' | 'mainnet-beta' = 'devnet'
): Promise<{
  sufficient: boolean;
  currentBalance: number;
  required: number;
  shortfall: number;
}> {
  const connection = getConnection(network);
  const walletPubkey = new PublicKey(wallet);
  const currentBalance = await getSolBalance(connection, walletPubkey);

  // Add buffer for transaction fees (~0.01 SOL)
  const required = solAmount + 0.01;
  const sufficient = currentBalance >= required;

  return {
    sufficient,
    currentBalance,
    required,
    shortfall: sufficient ? 0 : required - currentBalance,
  };
}

/**
 * Get token balances that match an ETF's token list
 * Used to display user's holdings for a specific ETF
 */
export async function getEtfPortfolioBalance(
  wallet: string,
  etfTokens: Array<{ address: string; symbol: string; weight: number }>,
  network: 'devnet' | 'mainnet-beta' = 'devnet'
): Promise<{
  holdings: Array<{
    mint: string;
    symbol: string;
    weight: number;
    balance: number;
    uiBalance: number;
  }>;
  hasAnyTokens: boolean;
}> {
  const connection = getConnection(network);
  const walletPubkey = new PublicKey(wallet);

  const holdings = await Promise.all(
    etfTokens.map(async (token) => {
      const balance = await getTokenBalance(
        connection,
        walletPubkey,
        new PublicKey(token.address)
      );
      return {
        mint: token.address,
        symbol: token.symbol,
        weight: token.weight,
        balance: balance?.amount || 0,
        uiBalance: balance?.uiAmount || 0,
      };
    })
  );

  return {
    holdings,
    hasAnyTokens: holdings.some(h => h.balance > 0),
  };
}
