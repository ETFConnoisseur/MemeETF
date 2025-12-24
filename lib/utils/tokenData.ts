import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  supply: number;
  logoURI?: string;
}

export interface TokenPriceData {
  price: number;
  marketCap: number;
  volume24h?: number;
  priceChange24h?: number;
}

/**
 * Fetch token metadata from on-chain Token Metadata Program
 */
export async function fetchOnChainMetadata(
  connection: Connection,
  mintAddress: string
): Promise<Partial<TokenMetadata>> {
  try {
    const mintPubkey = new PublicKey(mintAddress);
    
    // Get token supply
    const supply = await connection.getTokenSupply(mintPubkey);
    
    // Try to fetch from Metaplex Token Metadata Program
    // This is a simplified version - full implementation would use @metaplex-foundation/mpl-token-metadata
    const metadata: Partial<TokenMetadata> = {
      decimals: supply.value.decimals,
      supply: parseFloat(supply.value.amount) / Math.pow(10, supply.value.decimals),
    };

    return metadata;
  } catch (error) {
    console.error('Error fetching on-chain metadata:', error);
    return {};
  }
}

/**
 * Fetch token data from DexScreener API (free, no API key)
 */
export async function fetchDexScreenerData(
  tokenAddress: string
): Promise<{ metadata: Partial<TokenMetadata>; priceData: Partial<TokenPriceData> } | null> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      { next: { revalidate: 60 } } // Cache for 60 seconds
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const pair = data.pairs?.[0]; // Get first trading pair

    if (!pair) {
      return null;
    }

    return {
      metadata: {
        name: pair.baseToken?.name || 'Unknown',
        symbol: pair.baseToken?.symbol || 'UNKNOWN',
        logoURI: pair.baseToken?.logoURI,
      },
      priceData: {
        price: parseFloat(pair.priceUsd || '0'),
        marketCap: parseFloat(pair.marketCap || '0'),
        volume24h: parseFloat(pair.volume?.h24 || '0'),
        priceChange24h: parseFloat(pair.priceChange?.h24 || '0'),
      },
    };
  } catch (error) {
    console.error('Error fetching DexScreener data:', error);
    return null;
  }
}

/**
 * Fetch token data from Birdeye API (requires API key)
 */
export async function fetchBirdeyeData(
  tokenAddress: string,
  apiKey?: string
): Promise<{ metadata: Partial<TokenMetadata>; priceData: Partial<TokenPriceData> } | null> {
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(
      `https://public-api.birdeye.so/v1/token/overview?address=${tokenAddress}`,
      {
        headers: {
          'X-API-KEY': apiKey,
        },
        next: { revalidate: 60 },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return {
      metadata: {
        name: data.data?.name || 'Unknown',
        symbol: data.data?.symbol || 'UNKNOWN',
        logoURI: data.data?.logoURI,
      },
      priceData: {
        price: parseFloat(data.data?.price || '0'),
        marketCap: parseFloat(data.data?.mc || '0'),
        volume24h: parseFloat(data.data?.volume24h || '0'),
        priceChange24h: parseFloat(data.data?.priceChange24h || '0'),
      },
    };
  } catch (error) {
    console.error('Error fetching Birdeye data:', error);
    return null;
  }
}

/**
 * Fetch token data from Solscan API (free, no API key needed for public API)
 */
export async function fetchSolscanData(
  tokenAddress: string
): Promise<{ metadata: Partial<TokenMetadata>; priceData: Partial<TokenPriceData> } | null> {
  try {
    // Fetch token metadata
    const metaResponse = await fetch(
      `https://api.solscan.io/v2/token/meta?address=${tokenAddress}`,
      {
        headers: {
          'Accept': 'application/json',
        },
        next: { revalidate: 300 }, // Cache for 5 minutes
      }
    );

    if (!metaResponse.ok) {
      console.error('Solscan metadata fetch failed:', metaResponse.status);
      return null;
    }

    const metaData = await metaResponse.json();
    
    // Fetch market data for price and market cap
    const marketResponse = await fetch(
      `https://api.solscan.io/v2/token/price?address=${tokenAddress}`,
      {
        headers: {
          'Accept': 'application/json',
        },
        next: { revalidate: 60 },
      }
    );

    let marketCap = 0;
    if (marketResponse.ok) {
      const marketData = await marketResponse.json();
      marketCap = parseFloat(marketData.data?.marketCap || '0');
    }

    return {
      metadata: {
        name: metaData.data?.name || 'Unknown',
        symbol: metaData.data?.symbol || 'UNKNOWN',
        decimals: metaData.data?.decimals || 9,
        logoURI: metaData.data?.icon,
      },
      priceData: {
        marketCap: marketCap,
        price: 0,
      }
    };
  } catch (error) {
    console.error('Error fetching Solscan data:', error);
    return null;
  }
}

/**
 * Comprehensive token data fetcher - tries multiple sources
 */
export async function fetchTokenData(
  tokenAddress: string,
  connection: Connection,
  options?: {
    birdeyeApiKey?: string;
    solscanApiKey?: string;
  }
): Promise<{
  name: string;
  symbol: string;
  decimals: number;
  market_cap: number;
  pfp_url?: string;
}> {
  // Try DexScreener first (free, no API key)
  const dexscreenerData = await fetchDexScreenerData(tokenAddress);
  
  if (dexscreenerData) {
    const onChainData = await fetchOnChainMetadata(connection, tokenAddress);
    
    return {
      name: dexscreenerData.metadata.name || 'Unknown Token',
      symbol: dexscreenerData.metadata.symbol || 'UNKNOWN',
      decimals: onChainData.decimals || 9,
      market_cap: dexscreenerData.priceData.marketCap || 0,
      pfp_url: dexscreenerData.metadata.logoURI,
    };
  }

  // Fallback to Birdeye if API key provided
  if (options?.birdeyeApiKey) {
    const birdeyeData = await fetchBirdeyeData(tokenAddress, options.birdeyeApiKey);
    if (birdeyeData) {
      const onChainData = await fetchOnChainMetadata(connection, tokenAddress);
      return {
        name: birdeyeData.metadata.name || 'Unknown Token',
        symbol: birdeyeData.metadata.symbol || 'UNKNOWN',
        decimals: onChainData.decimals || 9,
        market_cap: birdeyeData.priceData.marketCap || 0,
        pfp_url: birdeyeData.metadata.logoURI,
      };
    }
  }

  // Fallback to Solscan (free, no API key needed)
  const solscanData = await fetchSolscanData(tokenAddress);
  if (solscanData) {
    const onChainData = await fetchOnChainMetadata(connection, tokenAddress);
    return {
      name: solscanData.metadata.name || 'Unknown Token',
      symbol: solscanData.metadata.symbol || 'UNKNOWN',
      decimals: solscanData.metadata.decimals || onChainData.decimals || 9,
      market_cap: solscanData.priceData.marketCap || 0,
      pfp_url: solscanData.metadata.logoURI,
    };
  }

  // Final fallback: on-chain only
  const onChainData = await fetchOnChainMetadata(connection, tokenAddress);
  return {
    name: 'Unknown Token',
    symbol: 'UNKNOWN',
    decimals: onChainData.decimals || 9,
    market_cap: 0,
    pfp_url: undefined,
  };
}

