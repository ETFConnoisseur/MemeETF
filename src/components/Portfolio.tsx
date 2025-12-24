import { Search, TrendingDown, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { apiGet, apiPost } from '../lib/api';
import type { PortfolioResponse, PortfolioHolding } from '../types';

export function Portfolio() {
  const { publicKey } = useWallet();
  const [searchQuery, setSearchQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sellingEtfId, setSellingEtfId] = useState<string | null>(null);
  const [sellAmount, setSellAmount] = useState<{ [key: string]: string }>({});
  const [showSellModal, setShowSellModal] = useState<string | null>(null);

  useEffect(() => {
    const fetchPortfolio = async () => {
      if (!publicKey) {
        setLoading(false);
        setPortfolio({
          success: true,
          holdings: [],
          totalValue: 0,
          unrealizedPnl: 0,
          realizedPnl: 0,
          availableBalance: 0,
          realizedPnlHistory: [],
        });
        return;
      }

      try {
        setLoading(true);
        const data = await apiGet<PortfolioResponse>(
          `/api/portfolio?userId=${publicKey.toBase58()}`,
          {
            success: true,
            holdings: [],
            totalValue: 0,
            unrealizedPnl: 0,
            realizedPnl: 0,
            availableBalance: 0,
            realizedPnlHistory: [],
          }
        );
        setPortfolio(data);
      } catch (error) {
        console.error('Failed to fetch portfolio:', error);
        setPortfolio({
          success: true,
          holdings: [],
          totalValue: 0,
          unrealizedPnl: 0,
          realizedPnl: 0,
          availableBalance: 0,
          realizedPnlHistory: [],
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolio();
  }, [publicKey]);

  const filteredHoldings = portfolio?.holdings.filter((holding) => {
    if (!searchQuery) return true;
    return (
      holding.etf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      holding.etf.contract_address.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }) || [];

  const fetchPortfolioData = async () => {
    if (!publicKey) return;
    
    try {
      const data = await apiGet<PortfolioResponse>(
        `/api/portfolio?userId=${publicKey.toBase58()}`,
        {
          success: true,
          holdings: [],
          totalValue: 0,
          unrealizedPnl: 0,
          realizedPnl: 0,
          availableBalance: 0,
          realizedPnlHistory: [],
        }
      );
      setPortfolio(data);
    } catch (error) {
      console.error('Failed to refresh portfolio:', error);
    }
  };

  const handleSell = async (etfId: string, tokensHeld: number) => {
    if (!publicKey) return;
    
    const amount = sellAmount[etfId];
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount to sell');
      return;
    }

    const sellTokens = parseFloat(amount);
    if (sellTokens > tokensHeld) {
      alert(`You can only sell up to ${tokensHeld.toFixed(4)} tokens`);
      return;
    }

    setSellingEtfId(etfId);
    
    try {
      const response = await apiPost<{ success: boolean; error?: string; newBalance?: number }>('/api/investments/sell', {
        etfId,
        tokensToSell: sellTokens,
        userId: publicKey.toBase58(),
      });

      if (response.success) {
        alert(`Successfully sold ${sellTokens.toFixed(4)} tokens! New balance: ${response.newBalance?.toFixed(4)} SOL`);
        setShowSellModal(null);
        setSellAmount({ ...sellAmount, [etfId]: '' });
        // Refresh portfolio
        await fetchPortfolioData();
      } else {
        alert(`Failed to sell: ${response.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Sell error:', error);
      alert(`Error selling: ${error.message || 'Unknown error'}`);
    } finally {
      setSellingEtfId(null);
    }
  };

  const handleSellAll = (etfId: string, tokensHeld: number) => {
    setSellAmount({ ...sellAmount, [etfId]: tokensHeld.toString() });
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-5xl tracking-tight mb-3">Portfolio</h1>
      </div>

      {!publicKey ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-12 text-center">
          <p className="text-white/60 text-lg">Connect your wallet to view your portfolio</p>
        </div>
      ) : (
        <>
          {/* Balance Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {/* Balance Card */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8">
              <h2 className="text-xl mb-8">Portfolio</h2>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="text-sm text-white/60 mb-2">PORTFOLIO VALUE</p>
                  <p className="text-2xl">
                    {loading ? '...' : `${(portfolio?.totalValue || 0).toFixed(4)} SOL`}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-white/60 mb-2">AVAILABLE BALANCE</p>
                  <p className="text-2xl">
                    {loading ? '...' : `${(portfolio?.availableBalance || 0).toFixed(4)} SOL`}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-white/60 mb-2">TOTAL INVESTED</p>
                  <p className="text-2xl text-white/80">
                    {loading ? '...' : `${((portfolio as any)?.totalInvested || 0).toFixed(4)} SOL`}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-white/60 mb-2">UNREALIZED PNL</p>
                  <p className={`text-2xl ${(portfolio?.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {loading ? '...' : `${(portfolio?.unrealizedPnl || 0) >= 0 ? '+' : ''}${(portfolio?.unrealizedPnl || 0).toFixed(4)} SOL`}
                  </p>
                </div>
              </div>
            </div>

            {/* Realized PNL Card */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8">
              <h2 className="text-xl mb-4">Realized PNL</h2>
              <p className={`text-4xl mb-6 ${(portfolio?.realizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {loading ? '...' : `${(portfolio?.realizedPnl || 0) >= 0 ? '+' : ''}${(portfolio?.realizedPnl || 0).toFixed(4)} SOL`}
              </p>
              <p className="text-sm text-white/40">
                From closed positions
              </p>
            </div>
          </div>

          {/* Active Positions */}
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8">
            <h2 className="text-3xl mb-8 text-center">Active Positions</h2>
            
            {/* Search and Filter */}
            <div className="max-w-2xl mx-auto mb-8 space-y-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or address"
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                />
              </div>
              
              <div className="flex items-center justify-end gap-2">
                <input
                  type="checkbox"
                  id="showHidden"
                  checked={showHidden}
                  onChange={(e) => setShowHidden(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/5"
                />
                <label htmlFor="showHidden" className="text-sm text-white/80">
                  Show Hidden
                </label>
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="py-16 text-center">
                <p className="text-white/40">Loading positions...</p>
              </div>
            ) : filteredHoldings.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-white/40">No holdings yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-sm text-white/60 uppercase tracking-wider px-6 py-4">ETF Name</th>
                      <th className="text-left text-sm text-white/60 uppercase tracking-wider px-6 py-4">Tokens</th>
                      <th className="text-left text-sm text-white/60 uppercase tracking-wider px-6 py-4">Invested</th>
                      <th className="text-left text-sm text-white/60 uppercase tracking-wider px-6 py-4">Current Value</th>
                      <th className="text-left text-sm text-white/60 uppercase tracking-wider px-6 py-4">PNL</th>
                      <th className="text-left text-sm text-white/60 uppercase tracking-wider px-6 py-4">Return</th>
                      <th className="text-left text-sm text-white/60 uppercase tracking-wider px-6 py-4">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHoldings.map((holding, index) => {
                      // Get values from the API response
                      const holdingAny = holding as any;
                      const invested = holdingAny.invested_sol || holding.position?.amount || 0;
                      const currentVal = holding.current_value || 0;
                      const pnl = holding.unrealized_pnl || 0;
                      const perf = holding.performance_percentage || 0;
                      const tokensHeld = holdingAny.tokens_held || holding.position?.amount || 0;
                      const etfId = holding.etf?.id;
                      
                      return (
                        <tr key={etfId || index} className="border-b border-white/5 hover:bg-white/5">
                          <td className="px-6 py-4">{holding.etf?.name || 'Unknown ETF'}</td>
                          <td className="px-6 py-4">{tokensHeld.toFixed(4)}</td>
                          <td className="px-6 py-4">{invested.toFixed(4)} SOL</td>
                          <td className="px-6 py-4">{currentVal.toFixed(4)} SOL</td>
                          <td className={`px-6 py-4 ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {pnl >= 0 ? '+' : ''}{pnl.toFixed(4)} SOL
                          </td>
                          <td className={`px-6 py-4 ${perf >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {perf >= 0 ? '+' : ''}{perf.toFixed(2)}%
                        </td>
                          <td className="px-6 py-4">
                            {tokensHeld > 0 && etfId && (
                              <button
                                onClick={() => setShowSellModal(etfId)}
                                disabled={sellingEtfId === etfId}
                                className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-all disabled:opacity-50"
                              >
                                {sellingEtfId === etfId ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <TrendingDown className="w-4 h-4" />
                                )}
                                Sell
                              </button>
                            )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Sell Modal */}
                {showSellModal && (
                  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-gray-900 border border-white/10 rounded-2xl p-8 max-w-md w-full mx-4">
                      {(() => {
                        const holding = filteredHoldings.find(h => h.etf?.id === showSellModal);
                        const holdingAny = holding as any;
                        const tokensHeld = holdingAny?.tokens_held || holding?.position?.amount || 0;
                        const currentVal = holding?.current_value || 0;
                        const etfName = holding?.etf?.name || 'ETF';
                        
                        return (
                          <>
                            <h3 className="text-2xl font-bold mb-6">Sell {etfName}</h3>
                            
                            <div className="space-y-4 mb-6">
                              <div className="flex justify-between text-white/60">
                                <span>Available to sell:</span>
                                <span className="text-white">{tokensHeld.toFixed(4)} tokens</span>
                              </div>
                              <div className="flex justify-between text-white/60">
                                <span>Current value:</span>
                                <span className="text-white">{currentVal.toFixed(4)} SOL</span>
                              </div>
                            </div>
                            
                            <div className="mb-6">
                              <label className="block text-sm text-white/60 mb-2">Amount to sell</label>
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  value={sellAmount[showSellModal] || ''}
                                  onChange={(e) => setSellAmount({ ...sellAmount, [showSellModal]: e.target.value })}
                                  placeholder="0.0"
                                  step="0.0001"
                                  max={tokensHeld}
                                  className="flex-1 px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                                />
                                <button
                                  onClick={() => handleSellAll(showSellModal, tokensHeld)}
                                  className="px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm transition-all"
                                >
                                  MAX
                                </button>
                              </div>
                            </div>
                            
                            <div className="flex gap-4">
                              <button
                                onClick={() => {
                                  setShowSellModal(null);
                                  setSellAmount({ ...sellAmount, [showSellModal]: '' });
                                }}
                                className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSell(showSellModal, tokensHeld)}
                                disabled={sellingEtfId === showSellModal || !sellAmount[showSellModal]}
                                className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 rounded-xl font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {sellingEtfId === showSellModal ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Selling...
                                  </>
                                ) : (
                                  <>
                                    <TrendingDown className="w-4 h-4" />
                                    Confirm Sell
                                  </>
                                )}
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}