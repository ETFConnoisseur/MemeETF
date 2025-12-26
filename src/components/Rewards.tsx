import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { apiGet, apiPost } from '../lib/api';
import { useNetwork } from '../contexts/NetworkContext';

interface RewardHistoryItem {
  date: string;
  amount: number;
  type: string;
}

interface RewardsData {
  success: boolean;
  total_claimable: number;
  total_claimed: number;
  rewards: any[];
  history: RewardHistoryItem[];
}

const defaultRewards: RewardsData = {
  success: true,
  total_claimable: 0,
  total_claimed: 0,
  rewards: [],
  history: [],
};

export function Rewards() {
  const { publicKey } = useWallet();
  const { network } = useNetwork();
  const [isHovering, setIsHovering] = useState(false);
  const [rewards, setRewards] = useState<RewardsData>(defaultRewards);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRewards = async () => {
      if (!publicKey) {
        setLoading(false);
        setRewards(defaultRewards);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await apiGet<RewardsData>(
          `/api/rewards?userId=${publicKey.toBase58()}&network=${network}`,
          defaultRewards
        );
        // Ensure all required fields exist
        setRewards({
          success: data?.success ?? true,
          total_claimable: data?.total_claimable ?? 0,
          total_claimed: data?.total_claimed ?? 0,
          rewards: Array.isArray(data?.rewards) ? data.rewards : [],
          history: Array.isArray(data?.history) ? data.history : [],
        });
      } catch (err) {
        console.error('Failed to fetch rewards:', err);
        setError('Failed to load rewards');
        setRewards(defaultRewards);
      } finally {
        setLoading(false);
      }
    };

    fetchRewards();
  }, [publicKey, network]);

  const handleClaim = async () => {
    if (!publicKey || rewards.total_claimable === 0) return;

    try {
      setClaiming(true);
      await apiPost('/api/rewards/claim', { userId: publicKey.toBase58() });
      // Refresh rewards after claiming
      const data = await apiGet<RewardsData>(`/api/rewards?userId=${publicKey.toBase58()}&network=${network}`, defaultRewards);
      setRewards({
        success: data?.success ?? true,
        total_claimable: data?.total_claimable ?? 0,
        total_claimed: data?.total_claimed ?? 0,
        rewards: Array.isArray(data?.rewards) ? data.rewards : [],
        history: Array.isArray(data?.history) ? data.history : [],
      });
    } catch (err) {
      console.error('Failed to claim rewards:', err);
    } finally {
      setClaiming(false);
    }
  };

  const chartData = (rewards.history || []).map(h => ({
    date: h?.date ? new Date(h.date).toLocaleDateString('en-US', { month: 'short' }) : '',
    amount: h?.amount ?? 0,
  }));

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
      {!publicKey ? (
        <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-12 text-center">
          <p className="text-white/60 text-lg">Connect your wallet to view rewards</p>
        </div>
      ) : (
        <>
          {/* Claim Rewards Section */}
          <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-12 mb-8 transition-all duration-300 hover:border-white/20">
            <div className="text-center space-y-8">
              <div className="flex items-center justify-center gap-2">
                <h2 className="text-2xl">Claim Rewards</h2>
              </div>
              <p className="text-sm text-white/60">TOTAL CLAIMABLE</p>

              {/* Glowing Circle */}
              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-64 h-64 rounded-full bg-emerald-500/20 blur-3xl"></div>
                </div>
                <div
                  className={`relative w-56 h-56 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                    isHovering ? 'border-emerald-500/50 scale-105' : 'border-emerald-500/30'
                  }`}
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                >
                  <div className="text-center">
                    <p className="text-4xl">
                      {loading ? '...' : `+${(rewards?.total_claimable || 0).toFixed(3)}`}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-lg text-white/80">SOL</p>

              <button 
                onClick={handleClaim}
                disabled={claiming || loading || (rewards?.total_claimable || 0) === 0}
                className="w-full max-w-md mx-auto py-4 rounded-xl bg-emerald-500/90 hover:bg-emerald-500 text-black transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {claiming ? 'Claiming...' : 'Claim SOL Rewards'}
              </button>
            </div>
          </div>

          {/* Bottom Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* SOL Rewards Generated */}
          <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-8 transition-all duration-300 hover:border-white/20">
            <h3 className="text-xl mb-6">SOL Rewards Generated</h3>

            <div className="space-y-6">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorRewards" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis
                      dataKey="date"
                      stroke="rgba(255,255,255,0.4)"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis stroke="rgba(255,255,255,0.4)" style={{ fontSize: '12px' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(0,0,0,0.9)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '8px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="#10b981"
                      fillOpacity={1}
                      fill="url(#colorRewards)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="pt-4 border-t border-white/10">
                <p className="text-sm text-white/60 mb-3">Total Claimed</p>
                <p className="text-2xl text-emerald-400">
                  {loading ? '...' : `${(rewards?.total_claimed || 0).toFixed(3)} SOL`}
                </p>
              </div>
            </div>
          </div>

          {/* Rewards History */}
          <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-8 transition-all duration-300 hover:border-white/20">
            <div className="flex items-center gap-2 mb-6">
              <h3 className="text-xl">Rewards History</h3>
              <span className="text-sm text-white/40">({rewards.history?.length || 0})</span>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm text-white/60 uppercase tracking-wider pb-2 border-b border-white/10">
                <div>Date</div>
                <div>Type</div>
                <div className="text-right">Amount</div>
              </div>

              {loading ? (
                <div className="py-12 text-center">
                  <p className="text-white/40">Loading...</p>
                </div>
              ) : error ? (
                <div className="py-12 text-center">
                  <p className="text-red-400">{error}</p>
                </div>
              ) : !rewards.history || rewards.history.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-white/40">No history yet</p>
                  <p className="text-white/30 text-sm mt-2">Create an ETF and earn fees when others invest</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {rewards.history.map((item, index) => (
                    <div key={index} className="grid grid-cols-3 gap-4 py-3 border-b border-white/5">
                      <div className="text-sm">{item?.date ? new Date(item.date).toLocaleDateString() : '-'}</div>
                      <div className="text-sm text-white/80">{item?.type || '-'}</div>
                      <div className="text-sm text-right text-emerald-400">+{(item?.amount ?? 0).toFixed(3)} SOL</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
}