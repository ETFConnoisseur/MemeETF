/**
 * Solana Wallet Utilities
 *
 * This file contains utility functions for working with Solana wallets.
 *
 * NOTE: The investment buy/sell flow is NON-CUSTODIAL (users sign with their own wallets).
 * However, ETF creation and withdrawals still use server-side signing temporarily.
 */

import { PublicKey, Connection, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import crypto from 'crypto';
import bs58 from 'bs58';

// Encryption key from environment
const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || 'default-dev-key-change-in-production!!';

/**
 * Validate a Solana wallet address
 */
export function isValidWalletAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get SOL balance for a wallet address
 */
export async function getWalletBalance(publicKey: string, connection: Connection): Promise<number> {
  try {
    const pubKey = new PublicKey(publicKey);
    const balance = await connection.getBalance(pubKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    return 0;
  }
}

/**
 * Get connection to Solana network
 */
export function getConnection(network: 'mainnet-beta' | 'devnet' | 'mainnet' = 'devnet'): Connection {
  const isMainnet = network === 'mainnet' || network === 'mainnet-beta';
  const rpcUrl = isMainnet
    ? process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com'
    : process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com';

  return new Connection(rpcUrl, 'confirmed');
}

/**
 * Shorten a wallet address for display
 * e.g., "7xKX...3mF9"
 */
export function shortenAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Format SOL amount for display
 */
export function formatSol(lamports: number): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  if (sol < 0.001) return '<0.001';
  if (sol < 1) return sol.toFixed(4);
  if (sol < 100) return sol.toFixed(3);
  return sol.toFixed(2);
}

// ============================================================================
// LEGACY FUNCTIONS: Used for ETF creation and withdrawals
// Investment buy/sell is now non-custodial (users sign with their wallets)
// ============================================================================

/**
 * Generate a new Solana wallet keypair
 * Used for: ETF creation (protocol wallet)
 */
export function generateWallet(): { publicKey: string; privateKey: string } {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    privateKey: bs58.encode(keypair.secretKey),
  };
}

/**
 * Encrypt a private key for storage
 * Used for: Storing protocol wallet keys
 */
export function encryptPrivateKey(privateKey: string): string {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt an encrypted private key
 * Used for: Retrieving protocol wallet keys
 */
export function decryptPrivateKey(encryptedKey: string): string {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);

  const parts = encryptedKey.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted key format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Get a Keypair from a base58-encoded private key
 * Used for: Signing ETF creation and withdrawal transactions
 */
export function getKeypairFromPrivateKey(privateKey: string): Keypair {
  const secretKey = bs58.decode(privateKey);
  return Keypair.fromSecretKey(secretKey);
}

