import CryptoJS from 'crypto-js';
import { TokenInfo } from '@/types';

export function generateTokenHash(tokens: TokenInfo[]): string {
  // Sort tokens by address to ensure consistent hashing
  const sorted = [...tokens].sort((a, b) => 
    a.address.localeCompare(b.address)
  );
  
  // Create a string representation of the token list
  const tokenString = sorted.map(t => t.address).join(',');
  
  // Generate hash
  return CryptoJS.SHA256(tokenString).toString();
}

export function isDuplicateTokenList(
  tokens1: TokenInfo[],
  tokens2: TokenInfo[]
): boolean {
  if (tokens1.length !== tokens2.length) {
    return false;
  }

  const hash1 = generateTokenHash(tokens1);
  const hash2 = generateTokenHash(tokens2);
  
  return hash1 === hash2;
}

