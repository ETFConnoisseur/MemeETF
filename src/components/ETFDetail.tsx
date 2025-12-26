import { useState, useEffect } from 'react';
import { ArrowLeft, ExternalLink, TrendingUp, TrendingDown, Wallet, User, Copy, Check, RefreshCw, Trash2 } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { getTokenLogo } from '../lib/tokenLogos';
import type { ETF, InvestmentResponse } from '../types';
import { useToastContext } from '../contexts/ToastContext';
import { useNetwork } from '../contexts/NetworkContext';

interface TokenWithLiveData {
  address: string;
  symbol: string;
  name?: string;
  weight: number;
  market_cap: number;        // MC at listing time (stored in DB)
  current_market_cap: number; // Current live MC
  price_change_24h: number;  // 24h price change percentage
  image?: string;            // Image from DB or fetched
}

interface ETFDetailProps {
  etfId: string;
  onNavigate: (tab: string) => void;
}

// Format market cap with appropriate suffix (K, M, B)
function formatMarketCap(value: number): string {
  if (!value || isNaN(value) || !isFinite(value) || value <= 0) return '$0';
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

// Shorten address for display
function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// Token image component with fallback - tries multiple sources
function TokenImage({ 
  src,
  symbol, 
  name, 
  size = 'md' 
}: { 
  src?: string;
  symbol?: string; 
  name?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [imgError, setImgError] = useState(false);
  
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  };
  
  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-xl',
  };
  
  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name || symbol || 'Token'}
        className={`${sizeClasses[size]} rounded-full bg-white/10 object-cover`}
        onError={() => setImgError(true)}
      />
    );
  }
  
  // Fallback to letter
  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-purple-500/30 to-blue-500/30 flex items-center justify-center`}>
      <span className={`${textSizes[size]} font-bold text-white/80`}>
        {symbol?.[0] || '?'}
      </span>
    </div>
  );
}

export function ETFDetail({ etfId, onNavigate }: ETFDetailProps) {
  const { publicKey, connected } = useWallet();
  const { addToast, updateToast } = useToastContext();
  const { network } = useNetwork();
  const [etf, setEtf] = useState<ETF | null>(null);
  const [loading, setLoading] = useState(true);
  const [investAmount, setInvestAmount] = useState('');
  const [investing, setInvesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [tokensWithLiveData, setTokensWithLiveData] = useState<TokenWithLiveData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchETF();
  }, [etfId]);

  // Fetch live data on load and refresh every 30 seconds
  useEffect(() => {
    if (etf?.tokens) {
      fetchLiveTokenData();
      
      // Auto-refresh every 30 seconds
      const interval = setInterval(() => {
        fetchLiveTokenData();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [etf]);

  async function fetchETF() {
    try {
      setLoading(true);
      const response = await apiGet<{ success: boolean; etf: ETF }>(
        `/api/etfs/${etfId}`,
        { success: false, etf: null as any }
      );
      if (response.success && response.etf) {
        setEtf(response.etf);
      }
    } catch (error) {
      console.error('Error fetching ETF:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLiveTokenData() {
    if (!etf?.tokens) return;
    
    const liveTokens: TokenWithLiveData[] = [];
    
    for (const token of etf.tokens) {
      let currentMC = token.market_cap || 0;
      let priceChange24h = 0;
      let image = token.image || '';
      
      try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.address}`);
        if (response.ok) {
          const data = await response.json();
          const pair = data.pairs?.[0];
          if (pair) {
            // Get live market cap
            if (pair.marketCap) {
              currentMC = parseFloat(pair.marketCap);
            } else if (pair.fdv) {
              currentMC = parseFloat(pair.fdv);
            }
            // Get 24h price change
            if (pair.priceChange?.h24 !== undefined) {
              priceChange24h = parseFloat(pair.priceChange.h24);
            }
            // Get token image from DexScreener
            if (pair.info?.imageUrl) {
              image = pair.info.imageUrl;
            }
          }
        }
      } catch (e) {
        console.warn(`Failed to fetch data for ${token.symbol}:`, e);
      }
      
      // Try local token logos as fallback
      if (!image) {
        image = getTokenLogo(token.address) || '';
      }
      
      liveTokens.push({
        address: token.address,
        symbol: token.symbol || 'UNKNOWN',
        name: token.name,
        weight: token.weight || 0,
        market_cap: token.market_cap || 0,       // Original listing MC
        current_market_cap: currentMC,            // Live MC
        price_change_24h: priceChange24h,         // 24h change %
        image: image || '',
      });
    }
    
    setTokensWithLiveData(liveTokens);
    setLastUpdated(new Date());
  }

  // Calculate weighted total current market cap (for display)
  // Calculate current total ETF market cap (weighted sum of current token MCs)
  const currentTotalMC = tokensWithLiveData.reduce((sum, token) => {
    return sum + (token.current_market_cap * (token.weight / 100));
  }, 0);

  // Calculate weighted listed market cap (stored in DB, for display)
  const listedTotalMC = etf?.market_cap_at_list || tokensWithLiveData.reduce((sum, token) => {
    return sum + (token.market_cap * (token.weight / 100));
  }, 0);

  // Calculate overall return since listing
  // Compare current weighted ETF MC vs ETF MC at listing
  const returnSinceListing = listedTotalMC > 0 && currentTotalMC > 0
    ? ((currentTotalMC - listedTotalMC) / listedTotalMC) * 100
    : 0;

  // Calculate weighted 24h return (weighted average of each token's 24h change)
  const return24h = tokensWithLiveData.reduce((sum, token) => {
    return sum + (token.price_change_24h * (token.weight / 100));
  }, 0);

  async function handleInvest() {
    if (!etf || !investAmount || parseFloat(investAmount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (!connected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    setError('');
    setSuccess('');
    setInvesting(true);

    // Show pending toast (convert network for toast compatibility)
    const toastNetwork = network === 'mainnet-beta' ? 'mainnet' : 'devnet';
    const toastId = addToast({
      type: 'etf_buy',
      status: 'pending',
      message: `Purchasing ${investAmount} SOL of ${etf.name}...`,
      network: toastNetwork,
    });

    try {
      const response = await apiPost<InvestmentResponse>('/api/investments/create', {
        etfId: etf.id,
        solAmount: parseFloat(investAmount),
        userId: publicKey.toBase58(),
        network: network,
      });

      if (response.success) {
        // Check if any swaps failed
        const failedSwaps = response.swapSignatures?.filter(s => s === 'FAILED') || [];
        if (failedSwaps.length > 0) {
          updateToast(toastId, {
            status: 'error',
            message: `${failedSwaps.length} token swap(s) failed. Investment incomplete.`,
          });
          setError(`${failedSwaps.length} token swap(s) failed. Please contact support.`);
          return;
        }

        // Update toast to success with transaction details
        updateToast(toastId, {
          status: 'success',
          message: `Successfully purchased ${investAmount} SOL of ${etf.name}!`,
          txSignature: response.txHash,
          swapSignatures: response.swapSignatures,
          tokenSubstitutions: response.tokenSubstitutions,
        });

        setSuccess(`Successfully invested ${investAmount} SOL!`);
        setInvestAmount('');
        setTimeout(() => {
          onNavigate('portfolio');
        }, 2000);
      } else {
        updateToast(toastId, {
          status: 'error',
          message: (response as any).error || 'Failed to invest',
        });
        setError((response as any).error || 'Failed to invest');
      }
    } catch (error: any) {
      console.error('Error investing:', error);
      updateToast(toastId, {
        status: 'error',
        message: error.message || 'Failed to invest',
      });
      setError(error.message || 'Failed to invest');
    } finally {
      setInvesting(false);
    }
  }

  async function copyToClipboard(text: string, type: string) {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleDelete() {
    if (!etf || !publicKey) return;

    const confirmed = window.confirm(`Are you sure you want to delete "${etf.name}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeleting(true);
    setError('');

    try {
      const response = await apiDelete<{ success?: boolean; error?: string }>(`/api/etfs/${etf.id}`, {
        userId: publicKey.toBase58(),
        network: network,
      });

      if (response && response.success) {
        onNavigate('listings');
      } else {
        const errorResponse = response as { error?: string };
        setError(errorResponse?.error || 'Failed to delete ETF');
      }
    } catch (error: any) {
      console.error('Error deleting ETF:', error);
      setError(error.message || 'Failed to delete ETF');
    } finally {
      setDeleting(false);
    }
  }

  const isCreator = connected && publicKey && etf?.creator === publicKey.toBase58();

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 lg:px-8 py-12">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-32 bg-white/10 rounded" />
          <div className="h-64 bg-white/10 rounded-2xl" />
          <div className="h-48 bg-white/10 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!etf) {
    return (
      <div className="max-w-5xl mx-auto px-6 lg:px-8 py-12">
        <div className="text-center py-16">
          <h1 className="text-2xl mb-4">ETF Not Found</h1>
          <button
            onClick={() => onNavigate('listings')}
            className="px-6 py-3 rounded-lg bg-white text-black hover:bg-white/90 transition-all"
          >
            Back to Listings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 lg:px-8 py-12">
      {/* Back Button */}
      <button
        onClick={() => onNavigate('listings')}
        className="flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-8"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Listings
      </button>

      {/* ETF Header */}
      <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="space-y-4">
            <h1 className="text-4xl tracking-tight">{etf.name}</h1>
            
            {/* Creator Info */}
            <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-white/60">
              <User className="w-4 h-4" />
              <span>Created by</span>
              <button
                onClick={() => copyToClipboard(etf.creator, 'creator')}
                className="flex items-center gap-1 font-mono text-sm bg-white/10 px-2 py-1 rounded hover:bg-white/20 transition-colors"
              >
                {shortenAddress(etf.creator, 6)}
                {copied === 'creator' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
              </div>
              
              {/* Delete button for creator */}
              {isCreator && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1 px-3 py-1 rounded text-sm text-red-400 border border-red-500/30 hover:bg-red-500/10 hover:border-red-500/50 transition-all disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>

            {/* Contract Address */}
            <div className="flex items-center gap-2 text-white/60">
              <span className="text-sm">Contract:</span>
              <button
                onClick={() => copyToClipboard(etf.contract_address, 'contract')}
                className="flex items-center gap-1 font-mono text-xs bg-white/10 px-2 py-1 rounded hover:bg-white/20 transition-colors"
              >
                {shortenAddress(etf.contract_address, 8)}
                {copied === 'contract' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
              <a
                href={`https://solscan.io/account/${etf.contract_address}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/40 hover:text-white/60 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="space-y-3">
            {/* Live Indicator - Above the stats */}
            <div className="flex items-center justify-end gap-2 text-emerald-400">
              <RefreshCw className="w-4 h-4 animate-spin" style={{ animationDuration: '3s' }} />
              <span className="text-sm font-medium">LIVE</span>
              {lastUpdated && (
                <span className="text-xs text-white/40">
                  Updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/10 p-4 text-center">
                <p className="text-xs text-white/60 mb-1">Listed MC</p>
                <p className="text-xl">{formatMarketCap(listedTotalMC)}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/30 p-4 text-center">
                <p className="text-xs text-white/60 mb-1">Current MC</p>
                <p className="text-xl">{formatMarketCap(currentTotalMC)}</p>
              </div>
              <div className="rounded-xl border border-white/10 p-4 text-center">
                <p className="text-xs text-white/60 mb-1">24h Performance</p>
                <div className={`text-2xl flex items-center justify-center gap-2 ${
                  return24h >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {return24h >= 0 ? (
                    <TrendingUp className="w-5 h-5" />
                  ) : (
                    <TrendingDown className="w-5 h-5" />
                  )}
                  {return24h >= 0 ? '+' : ''}{return24h.toFixed(2)}%
                </div>
              </div>
              <div className="rounded-xl border border-white/10 p-4 text-center">
                <p className="text-xs text-white/60 mb-1">Since Listing</p>
                <div className={`text-2xl flex items-center justify-center gap-2 ${
                  returnSinceListing >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {returnSinceListing >= 0 ? (
                    <TrendingUp className="w-5 h-5" />
                  ) : (
                    <TrendingDown className="w-5 h-5" />
                  )}
                  {returnSinceListing >= 0 ? '+' : ''}{returnSinceListing.toFixed(2)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Token List */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-6">
            <h2 className="text-2xl mb-6">Token Composition</h2>
            <div className="space-y-4">
              {tokensWithLiveData.length > 0 ? tokensWithLiveData.map((token, idx) => {
                // Calculate individual token return since listing (MC change)
                const tokenReturnSinceListing = token.market_cap > 0 
                  ? ((token.current_market_cap - token.market_cap) / token.market_cap) * 100 
                  : 0;

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-4 rounded-xl border border-white/10 hover:border-white/20 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <TokenImage 
                        src={token.image}
                        symbol={token.symbol} 
                        name={token.name}
                        size="lg"
                      />
                      <div>
                        <h3 className="font-medium text-white">{token.name || token.symbol}</h3>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white/60">{token.symbol}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            {token.weight.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right space-y-1">
                      <p className="text-white font-medium">{formatMarketCap(token.current_market_cap)}</p>
                      <div className="flex items-center justify-end gap-3">
                        <div className="text-right">
                          <p className="text-[10px] text-white/40 uppercase">24h</p>
                          <p className={`text-sm font-medium ${token.price_change_24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {token.price_change_24h >= 0 ? '+' : ''}{token.price_change_24h.toFixed(1)}%
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-white/40 uppercase">Listing</p>
                          <p className={`text-sm font-medium ${tokenReturnSinceListing >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {tokenReturnSinceListing >= 0 ? '+' : ''}{tokenReturnSinceListing.toFixed(1)}%
                      </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }) : etf.tokens.map((token, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-4 rounded-xl border border-white/10 animate-pulse"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-white/10" />
                    <div className="space-y-2">
                      <div className="h-4 w-24 bg-white/10 rounded" />
                      <div className="h-3 w-16 bg-white/10 rounded" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-20 bg-white/10 rounded" />
                    <div className="h-3 w-12 bg-white/10 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Invest Panel */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-6 sticky top-24">
            <h2 className="text-2xl mb-6 flex items-center gap-2">
              <Wallet className="w-6 h-6" />
              Invest
            </h2>

            {!connected ? (
              <div className="text-center py-8">
                <p className="text-white/60 mb-4">Connect your wallet to invest</p>
                <button
                  onClick={() => onNavigate('settings')}
                  className="px-6 py-3 rounded-lg bg-white text-black hover:bg-white/90 transition-all"
                >
                  Connect Wallet
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-white/60 mb-2">Amount (SOL)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={investAmount}
                    onChange={(e) => setInvestAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-3 rounded-xl border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                  />
                </div>

                <div className="flex gap-2">
                  {['0.1', '0.5', '1'].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setInvestAmount(amount)}
                      className="flex-1 py-2 rounded-lg border border-white/20 text-white/80 hover:bg-white/5 hover:border-white/30 transition-all text-sm"
                    >
                      {amount} SOL
                    </button>
                  ))}
                </div>

                {network === 'devnet' && (
                  <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/50 text-yellow-200 text-xs">
                    ⚠️ <strong>Devnet Mode:</strong> All tokens will be substituted with devnet USDC for testing purposes. This is for testing only.
                  </div>
                )}

                {error && (
                  <div className="p-3 rounded-lg bg-transparent border border-red-500 text-red-200 text-sm">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/50 text-emerald-200 text-sm">
                    {success}
                  </div>
                )}

                <button
                  onClick={handleInvest}
                  disabled={investing || !investAmount || parseFloat(investAmount) <= 0}
                  className={`w-full py-4 rounded-xl transition-all ${
                    investing || !investAmount || parseFloat(investAmount) <= 0
                      ? 'bg-transparent border border-white/30 text-white/40 cursor-not-allowed'
                      : 'bg-transparent border-2 border-emerald-500 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-400'
                  }`}
                >
                  {investing ? 'Processing...' : 'Invest Now'}
                </button>

                <p className="text-xs text-white/40 text-center">
                  A 0.5% fee will be charged to the lister
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="mt-8 rounded-2xl border border-white/10 backdrop-blur-sm p-6">
        <h2 className="text-xl mb-4">About This ETF</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-white/60">Tokens</p>
            <p className="text-white font-medium">{etf.tokens.length}</p>
          </div>
          <div>
            <p className="text-white/60">Listed On</p>
            <p className="text-white font-medium">
              {new Date(etf.created_at).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-white/60">Network</p>
            <p className="text-white font-medium">Solana Devnet</p>
          </div>
          <div>
            <p className="text-white/60">Fee Structure</p>
            <p className="text-white font-medium">0.5% on trades</p>
          </div>
        </div>
      </div>
    </div>
  );
}
