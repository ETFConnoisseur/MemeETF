import { Search, ListFilter, Plus, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { apiGet } from '../lib/api';
import { getTokenLogo } from '../lib/tokenLogos';
import type { ETFsResponse, ETF } from '../types';
import { useNetwork } from '../contexts/NetworkContext';

// Token image component with fallback - tries multiple sources
function TokenImage({ 
  address, 
  symbol, 
  image, 
}: { 
  address: string; 
  symbol?: string; 
  image?: string;
}) {
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  const [tried, setTried] = useState(0);
  
  // Multiple image sources to try in order
  const imageSources = [
    getTokenLogo(address),
    image,
    `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${address}/logo.png`,
    `https://tokens.jup.ag/token/${address}/logo`,
  ].filter(Boolean) as string[];
  
  useEffect(() => {
    if (imageSources[tried]) {
      setCurrentSrc(imageSources[tried]);
    }
  }, [tried, address]);
  
  const handleError = () => {
    if (tried < imageSources.length - 1) {
      setTried(t => t + 1);
    } else {
      setCurrentSrc(null);
    }
  };
  
  if (currentSrc) {
    return (
      <img
        src={currentSrc}
        alt={symbol || 'Token'}
        className="w-4 h-4 rounded-full object-cover"
        onError={handleError}
      />
    );
  }
  
  return null;
}

interface ListingsProps {
  onNavigate: (tab: string, data?: any) => void;
}

// Format market cap with appropriate suffix (K, M, B)
function formatMarketCap(value: number): string {
  if (!value || isNaN(value) || !isFinite(value)) return '$0';
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  } else if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  } else if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  } else {
    return `$${value.toFixed(0)}`;
  }
}

export function Listings({ onNavigate }: ListingsProps) {
  const { network } = useNetwork();
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [etfs, setEtfs] = useState<ETF[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [priceChanges24h, setPriceChanges24h] = useState<Record<string, number>>({});
  const [tokenImages, setTokenImages] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchETFs();
  }, [activeFilter, network]);

  // Fetch prices and images on load and refresh every 30 seconds for live updates
  useEffect(() => {
    if (etfs.length > 0) {
      fetchCurrentPricesAndImages();
      
      // Auto-refresh prices every 30 seconds
      const interval = setInterval(() => {
        fetchCurrentPricesAndImages();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [etfs]);

  async function fetchETFs() {
    try {
      setLoading(true);
      const data = await apiGet<ETFsResponse>(
        `/api/etfs?filter=${activeFilter}&network=${network}`,
        { success: true, etfs: [] }
      );
      if (data.success) {
        setEtfs(data.etfs);
      } else {
        setEtfs([]);
      }
    } catch (error) {
      console.error('Failed to fetch ETFs:', error);
      setEtfs([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCurrentPricesAndImages() {
    const prices: Record<string, number> = {};
    const changes: Record<string, number> = {};
    const images: Record<string, string> = {};
    
    // Collect all unique token addresses
    const allTokens = etfs.flatMap(etf => etf.tokens);
    const uniqueAddresses = [...new Set(allTokens.map(t => t.address))];
    
    // Fetch prices and images in batches
    for (const address of uniqueAddresses) {
      try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
        if (response.ok) {
          const data = await response.json();
          const pair = data.pairs?.[0];
          if (pair) {
            if (pair.marketCap) {
              prices[address] = parseFloat(pair.marketCap);
            } else if (pair.fdv) {
              prices[address] = parseFloat(pair.fdv);
            }
            // Get 24h price change
            if (pair.priceChange?.h24 !== undefined) {
              changes[address] = parseFloat(pair.priceChange.h24);
            }
            // Get image from DexScreener
            if (pair.info?.imageUrl) {
              images[address] = pair.info.imageUrl;
            }
          }
        }
      } catch (e) {
        // Ignore individual failures
      }
    }
    
    setCurrentPrices(prices);
    setPriceChanges24h(changes);
    setTokenImages(images);
  }

  // Calculate current MC for an ETF
  function getCurrentMC(etf: ETF): number {
    if (!etf?.tokens?.length) return 0;
    const result = etf.tokens.reduce((sum, token) => {
      const mc = currentPrices[token.address] || token.market_cap || 0;
      const weight = token.weight || 0;
      return sum + (mc * weight / 100);
    }, 0);
    return isNaN(result) ? 0 : result;
  }

  // Calculate weighted 24h return for an ETF
  function get24hReturn(etf: ETF): number {
    if (!etf?.tokens?.length) return 0;
    const result = etf.tokens.reduce((sum, token) => {
      const change = priceChanges24h[token.address] || 0;
      const weight = token.weight || 0;
      return sum + (change * weight / 100);
    }, 0);
    return isNaN(result) ? 0 : result;
  }

  // Calculate return percentage since listing
  // Compare current weighted ETF MC vs ETF MC at listing
  function getReturnSinceListing(etf: ETF): number {
    const currentMC = getCurrentMC(etf);
    const listingMC = etf.market_cap_at_list || 0;

    if (listingMC <= 0 || currentMC <= 0) return 0;

    const returnPct = ((currentMC - listingMC) / listingMC) * 100;
    return isNaN(returnPct) ? 0 : returnPct;
  }

  const filteredETFs = etfs.filter((etf) => {
    if (!searchQuery) return true;
    return (
      etf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      etf.tokens.some(token => 
        token.symbol?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        token.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
  });

  function handleETFClick(etf: ETF) {
    onNavigate('etf-detail', { etfId: etf.id });
  }

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
      {/* Hero Section */}
      <div className="text-center mb-12 space-y-3">
        <h1 className="text-5xl tracking-tight">ETF Listings</h1>
        <p className="text-white/60 text-lg">Browse all available token ETFs</p>
      </div>

      {/* Search and Filter Section */}
      <div className="mb-10 space-y-6">
        <div className="relative max-w-2xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ETFs or tokens..."
            className="w-full pl-12 pr-4 py-4 rounded-xl border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
          />
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-8 py-2.5 rounded-lg transition-all ${
              activeFilter === 'all'
                ? 'bg-white text-black'
                : 'bg-transparent text-white/60 hover:text-white hover:bg-white/5 border border-white/20'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveFilter('kol')}
            className={`px-8 py-2.5 rounded-lg transition-all ${
              activeFilter === 'kol'
                ? 'bg-white text-black'
                : 'bg-transparent text-white/60 hover:text-white hover:bg-white/5 border border-white/20'
            }`}
          >
            KOL
          </button>
          <button
            onClick={() => setActiveFilter('trending')}
            className={`px-8 py-2.5 rounded-lg transition-all ${
              activeFilter === 'trending'
                ? 'bg-white text-black'
                : 'bg-transparent text-white/60 hover:text-white hover:bg-white/5 border border-white/20'
            }`}
          >
            Trending
          </button>
        </div>
      </div>

      {/* ETF Grid */}
      {loading ? (
        <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-12 text-center">
          <p className="text-white/40 text-lg">Loading ETFs...</p>
        </div>
      ) : filteredETFs.length === 0 ? (
        <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-12">
          <div className="text-center space-y-6">
            <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center mx-auto">
              <ListFilter className="w-8 h-8 text-white/40" />
            </div>
            <p className="text-white/40 text-lg">No ETFs found</p>
            <p className="text-white/30 text-sm">Be the first to create one</p>
            <button
              onClick={() => onNavigate('list-new-etf')}
              className="px-8 py-3 rounded-lg bg-white text-black hover:bg-white/90 transition-all inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create ETF
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredETFs.map((etf) => {
            const currentMC = getCurrentMC(etf);
            const return24h = get24hReturn(etf);
            const returnSinceListing = getReturnSinceListing(etf);
            
            return (
              <div
                key={etf.id}
                onClick={() => handleETFClick(etf)}
                className="rounded-2xl border border-white/10 backdrop-blur-sm p-6 hover:border-white/20 transition-all cursor-pointer group"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-xl group-hover:text-white/90 transition-colors">{etf.name}</h3>
                  <div className={`flex items-center gap-1 text-sm px-2 py-1 rounded ${
                    return24h >= 0 
                      ? 'bg-emerald-500/20 text-emerald-400' 
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {return24h >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    <span className="text-[9px] opacity-70">24h</span>
                    {return24h >= 0 ? '+' : ''}{return24h.toFixed(1)}%
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-lg border border-white/10 p-3">
                    <p className="text-xs text-white/50 mb-1">Current MC</p>
                    <p className="text-white font-medium">{formatMarketCap(currentMC)}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 p-3">
                    <p className="text-xs text-white/50 mb-1">Since Listing</p>
                    <p className={`font-medium ${returnSinceListing >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {returnSinceListing >= 0 ? '+' : ''}{returnSinceListing.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Token List */}
                <div className="border-t border-white/10 pt-4">
                  <p className="text-xs text-white/50 mb-3">Tokens ({etf.tokens.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {etf.tokens.map((token, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg bg-white/10 text-white/80"
                      >
                        <TokenImage 
                          address={token.address} 
                          symbol={token.symbol}
                          image={tokenImages[token.address] || token.image || token.pfp_url}
                        />
                        <span>{token.symbol}</span>
                        <span className="text-white/50">{token.weight}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Creator */}
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                  <span className="text-white/40">By {etf.creator.slice(0, 4)}...{etf.creator.slice(-4)}</span>
                  <span className="text-white/40">{new Date(etf.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
