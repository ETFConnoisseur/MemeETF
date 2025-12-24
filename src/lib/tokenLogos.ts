// Token logo mappings for well-known Solana tokens
// These are official/commonly used logo URLs

export const TOKEN_LOGOS: Record<string, string> = {
  // Solana (SOL) - Native token
  'So11111111111111111111111111111111111111112': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  
  // USD Coin (USDC)
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  
  // Raydium (RAY)
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png',
  
  // Tether (USDT)
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg',
  
  // Bonk (BONK)
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',
  
  // Jupiter (JUP)
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'https://static.jup.ag/jup/icon.png',
  
  // Marinade Staked SOL (mSOL)
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png',
  
  // Jito Staked SOL (JitoSOL)
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': 'https://storage.googleapis.com/token-metadata/JitoSOL-256.png',
  
  // Orca (ORCA)
  'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png',
  
  // Pyth Network (PYTH)
  'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3': 'https://pyth.network/token.svg',
  
  // Render (RNDR)
  'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof/logo.png',
  
  // Tensor (TNSR)
  'TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6': 'https://gateway.irys.xyz/K1qVs4CxOkMKlKUFvGpWmZGJn4uqRpY_ZTIEIbLF0jM',
  
  // dogwifhat (WIF)
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': 'https://bafkreibk3covs5ltyqxa272uodhculbr6kea6betidfwy3ajsav2vjzyum.ipfs.nftstorage.link',
};

/**
 * Get the logo URL for a token
 * Falls back to trying Jupiter's CDN if not in our mapping
 */
export function getTokenLogo(address: string): string | null {
  // Check our mapping first
  if (TOKEN_LOGOS[address]) {
    return TOKEN_LOGOS[address];
  }
  
  // Fallback to Jupiter's token list
  return `https://tokens.jup.ag/token/${address}/logo`;
}

/**
 * Get token logo with fallback placeholder
 */
export function getTokenLogoWithFallback(address: string, symbol?: string): string {
  const logo = getTokenLogo(address);
  if (logo) return logo;
  
  // Return a placeholder based on symbol first letter
  return '';  // Return empty to show initial letter fallback in UI
}

