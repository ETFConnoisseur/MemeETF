import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Plus } from 'lucide-react';
import { apiGet } from '../lib/api';
import type { ETFsResponse, ETF } from '../types';
import { useNetwork } from '../contexts/NetworkContext';

interface DashboardProps {
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

export function Dashboard({ onNavigate }: DashboardProps) {
  const { network } = useNetwork();
  const [featuredETFs, setFeaturedETFs] = useState<ETF[]>([]);
  const [newestETFs, setNewestETFs] = useState<ETF[]>([]);
  const [stats, setStats] = useState({ totalETFs: 0, totalVolume: 0, activeTraders: 0 });
  const [loading, setLoading] = useState(true);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [priceChanges24h, setPriceChanges24h] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchData();
  }, [network]);

  useEffect(() => {
    if (newestETFs.length > 0) {
      fetchCurrentPrices();
    }
  }, [newestETFs]);

  async function fetchData() {
    try {
      setLoading(true);

      // Fetch ETFs with fallback to empty data
      const response = await apiGet<ETFsResponse>(
        `/api/etfs?limit=10&network=${network}`,
        { success: true, etfs: [] }
      );
      
      if (response.success && response.etfs) {
        // Sort by total market cap for featured
        const sortedByVolume = [...response.etfs].sort((a, b) => 
          (b.market_cap_at_list || 0) - (a.market_cap_at_list || 0)
        );
        
        setFeaturedETFs(sortedByVolume.slice(0, 3));
        setNewestETFs(response.etfs.slice(0, 6));
        setStats({
          totalETFs: response.etfs.length,
          totalVolume: response.etfs.reduce((sum, etf) => sum + (etf.market_cap_at_list || 0), 0),
          activeTraders: 0, // TODO: Calculate from investments
        });
      } else {
        setFeaturedETFs([]);
        setNewestETFs([]);
        setStats({ totalETFs: 0, totalVolume: 0, activeTraders: 0 });
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setFeaturedETFs([]);
      setNewestETFs([]);
      setStats({ totalETFs: 0, totalVolume: 0, activeTraders: 0 });
    } finally {
      setLoading(false);
    }
  }

  async function fetchCurrentPrices() {
    const prices: Record<string, number> = {};
    const changes: Record<string, number> = {};
    const allTokens = newestETFs.flatMap(etf => etf.tokens);
    const uniqueAddresses = [...new Set(allTokens.map(t => t.address))];
    
    for (const address of uniqueAddresses) {
      try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
        if (response.ok) {
          const data = await response.json();
          const pair = data.pairs?.[0];
          if (pair?.marketCap) {
            prices[address] = parseFloat(pair.marketCap);
          }
          if (pair?.priceChange?.h24 !== undefined) {
            changes[address] = parseFloat(pair.priceChange.h24);
          }
        }
      } catch (e) {
        // Ignore individual failures
      }
    }
    
    setCurrentPrices(prices);
    setPriceChanges24h(changes);
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

  // Calculate return percentage since listing
  // Compare current weighted ETF MC vs ETF MC at listing
  function getReturnSinceListing(etf: ETF): number {
    const currentMC = getCurrentMC(etf);
    const listingMC = etf.market_cap_at_list || 0;

    if (listingMC <= 0 || currentMC <= 0) return 0;

    const returnPct = ((currentMC - listingMC) / listingMC) * 100;
    return isNaN(returnPct) ? 0 : returnPct;
  }

  function handleETFClick(etf: ETF) {
    onNavigate('etf-detail', { etfId: etf.id });
  }

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
      {/* Hero Section */}
      <div className="text-center mb-12 space-y-3">
        <h1 className="text-5xl tracking-tight">Dashboard</h1>
        <p className="text-white/60 text-lg">
          Discover and invest in custom Solana token ETFs
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="rounded-xl border border-white/10 backdrop-blur-sm p-6">
          <p className="text-sm text-white/60 mb-2">Total ETFs</p>
          <p className="text-3xl">{loading ? '...' : stats.totalETFs}</p>
        </div>
        <div className="rounded-xl border border-white/10 backdrop-blur-sm p-6">
          <p className="text-sm text-white/60 mb-2">Total Volume</p>
          <p className="text-3xl">{loading ? '...' : formatMarketCap(stats.totalVolume)}</p>
        </div>
        <div className="rounded-xl border border-white/10 backdrop-blur-sm p-6">
          <p className="text-sm text-white/60 mb-2">Active Traders</p>
          <p className="text-3xl">{loading ? '...' : stats.activeTraders}</p>
        </div>
      </div>

      {/* Featured ETFs Section */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl">Featured ETFs</h2>
            <TrendingUp className="w-6 h-6 text-emerald-400" />
          </div>
          <button 
            onClick={() => onNavigate('listings')}
            className="px-5 py-2.5 rounded-lg border border-white/20 text-white/80 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all"
          >
            View All
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-12">
            <div className="text-center text-white/40">Loading...</div>
          </div>
        ) : featuredETFs.length === 0 ? (
          <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-12">
            <div className="text-center space-y-6">
              <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center mx-auto">
                <Plus className="w-8 h-8 text-white/40" />
              </div>
              <p className="text-white/40 text-lg">No featured ETFs yet</p>
              <button
                onClick={() => onNavigate('list-new-etf')}
                className="px-8 py-3 rounded-lg bg-white text-black hover:bg-white/90 transition-all"
              >
                Create First ETF
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {featuredETFs.map((etf) => {
              const return24h = get24hReturn(etf);
              return (
                <div
                  key={etf.id}
                  onClick={() => handleETFClick(etf)}
                  className="rounded-2xl border border-white/10 backdrop-blur-sm p-6 hover:border-white/20 transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-xl">{etf.name}</h3>
                    <div className={`flex items-center gap-1 text-sm px-2 py-1 rounded ${
                      return24h >= 0 
                        ? 'bg-emerald-500/20 text-emerald-400' 
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {return24h >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      <span className="text-[10px] opacity-70">24h</span>
                      {return24h >= 0 ? '+' : ''}{return24h.toFixed(1)}%
                    </div>
                  </div>
                  <p className="text-sm text-white/60 mb-4">
                    Market Cap: {formatMarketCap(etf.market_cap_at_list)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {etf.tokens.slice(0, 3).map((token, idx) => (
                      <span key={idx} className="text-xs px-2 py-1 rounded bg-white/10 text-white/80">
                        {token.symbol}
                      </span>
                    ))}
                    {etf.tokens.length > 3 && (
                      <span className="text-xs px-2 py-1 rounded bg-white/10 text-white/60">
                        +{etf.tokens.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Newest Listings Section */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl">Newest Listings</h2>
          <button 
            onClick={() => onNavigate('listings')}
            className="px-5 py-2.5 rounded-lg border border-white/20 text-white/80 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all"
          >
            View All
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-12">
            <div className="text-center text-white/40">Loading...</div>
          </div>
        ) : newestETFs.length === 0 ? (
          <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-12">
            <div className="text-center">
              <p className="text-white/40 text-lg">No listings yet</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {newestETFs.map((etf) => {
              const return24h = get24hReturn(etf);
              return (
                <div
                  key={etf.id}
                  onClick={() => handleETFClick(etf)}
                  className="rounded-xl border border-white/10 backdrop-blur-sm p-6 hover:border-white/20 transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg">{etf.name}</h3>
                    <span className={`text-xs flex items-center gap-1 ${return24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      <span className="text-[9px] opacity-60">24h</span>
                      {return24h >= 0 ? '+' : ''}{return24h.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-sm text-white/60 mb-3">
                    {formatMarketCap(etf.market_cap_at_list)}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-white/40">
                    <span>{etf.tokens.length} tokens</span>
                    <span>•</span>
                    <span>{etf.creator.slice(0, 4)}...{etf.creator.slice(-4)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CTA Section */}
      <div className="rounded-2xl border border-emerald-500/50 backdrop-blur-sm p-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <h2 className="text-2xl">Ready to create your own ETF?</h2>
            <p className="text-white/60">
              List your custom token basket and start earning fees
            </p>
          </div>
          <button
            onClick={() => onNavigate('list-new-etf')}
            className="px-8 py-3 rounded-lg bg-transparent border border-emerald-500/50 text-white hover:bg-emerald-500/10 hover:border-emerald-500 transition-all whitespace-nowrap flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            List New ETF
          </button>
        </div>
      </div>
    </div>
  );
}
