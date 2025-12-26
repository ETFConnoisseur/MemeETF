import { Trophy, Medal, Award } from 'lucide-react';
import { useState, useEffect } from 'react';
import { apiGet } from '../lib/api';
import type { LeaderboardResponse, LeaderboardEntry } from '../types';
import { useNetwork } from '../contexts/NetworkContext';

interface LeaderboardProps {
  onNavigate: (tab: string, data?: any) => void;
}

export function Leaderboard({ onNavigate }: LeaderboardProps) {
  const { network } = useNetwork();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        const data = await apiGet<LeaderboardResponse>(
          `/api/leaderboard?network=${network}`,
          { success: true, leaderboard: [] }
        );
        if (data.success && Array.isArray(data.leaderboard)) {
          setLeaderboard(data.leaderboard);
        } else {
          setLeaderboard([]);
        }
      } catch (error) {
        console.error('Failed to fetch leaderboard:', error);
        setLeaderboard([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [network]);

  const topThree = leaderboard.slice(0, 3);
  const restOfLeaderboard = leaderboard.slice(3);

  const handleETFClick = (etfId: string) => {
    onNavigate('etf-detail', { etfId });
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
      {/* Hero Section */}
      <div className="text-center mb-12 space-y-3">
        <div className="flex items-center justify-center gap-3">
          <h1 className="text-5xl tracking-tight">Leaderboard</h1>
          <Trophy className="w-10 h-10 text-yellow-500" />
        </div>
        <p className="text-white/60 text-lg">Top performing ETFs and Creators</p>
      </div>

      {/* Top 3 Podium */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {/* Second Place */}
        <div className="rounded-xl border-2 border-gray-400 backdrop-blur-sm p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center mx-auto mb-4">
            <Medal className="w-8 h-8 text-white" />
          </div>
          <p className="text-sm text-white mb-1">#2</p>
          {loading ? (
            <p className="text-white/40">Loading...</p>
          ) : topThree[1] ? (
            <>
              <p className="text-lg text-white mb-1">{topThree[1].twitter_handle || topThree[1].user_id?.slice(0, 8) || 'Unknown'}</p>
              <p className="text-sm text-white">{topThree[1].etf_name || 'Unknown ETF'}</p>
              <p className={`text-xl text-white mt-2 ${(topThree[1].return_percentage || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {(topThree[1].return_percentage || 0) >= 0 ? '+' : ''}{(topThree[1].return_percentage || 0).toFixed(2)}%
              </p>
            </>
          ) : (
            <p className="text-white/40">No data</p>
          )}
        </div>

        {/* First Place */}
        <div className="rounded-xl border-2 border-yellow-500 backdrop-blur-sm p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <p className="text-sm text-white mb-1">#1</p>
          {loading ? (
            <p className="text-white/40">Loading...</p>
          ) : topThree[0] ? (
            <>
              <p className="text-xl text-white mb-1">{topThree[0].twitter_handle || topThree[0].user_id?.slice(0, 8) || 'Unknown'}</p>
              <p className="text-sm text-white">{topThree[0].etf_name || 'Unknown ETF'}</p>
              <p className={`text-2xl text-white mt-2 ${(topThree[0].return_percentage || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {(topThree[0].return_percentage || 0) >= 0 ? '+' : ''}{(topThree[0].return_percentage || 0).toFixed(2)}%
              </p>
            </>
          ) : (
            <p className="text-white/40">No data</p>
          )}
        </div>

        {/* Third Place */}
        <div className="rounded-xl border-2 border-amber-700 backdrop-blur-sm p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center mx-auto mb-4">
            <Award className="w-8 h-8 text-white" />
          </div>
          <p className="text-sm text-white mb-1">#3</p>
          {loading ? (
            <p className="text-white/40">Loading...</p>
          ) : topThree[2] ? (
            <>
              <p className="text-lg text-white mb-1">{topThree[2].twitter_handle || topThree[2].user_id?.slice(0, 8) || 'Unknown'}</p>
              <p className="text-sm text-white">{topThree[2].etf_name || 'Unknown ETF'}</p>
              <p className={`text-xl text-white mt-2 ${(topThree[2].return_percentage || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {(topThree[2].return_percentage || 0) >= 0 ? '+' : ''}{(topThree[2].return_percentage || 0).toFixed(2)}%
              </p>
            </>
          ) : (
            <p className="text-white/40">No data</p>
          )}
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="rounded-2xl border-2 border-gray-400 backdrop-blur-sm overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-8 py-5 border-b border-white/10">
          <div className="col-span-1 text-sm text-white uppercase tracking-wider">Rank</div>
          <div className="col-span-4 text-sm text-white uppercase tracking-wider">User</div>
          <div className="col-span-4 text-sm text-white uppercase tracking-wider">ETF Name</div>
          <div className="col-span-3 text-sm text-white uppercase tracking-wider text-right">Return %</div>
        </div>

        {/* Table Body */}
        {loading ? (
          <div className="py-24 text-center">
            <p className="text-white/40 text-lg">Loading...</p>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-white/40 text-lg">No leaderboard data available</p>
            <p className="text-white/30 text-sm mt-2">Start trading to appear on the leaderboard</p>
          </div>
        ) : (
          <div>
            {leaderboard.map((entry, index) => (
              <div
                key={`${entry.user_id || index}-${entry.etf_id || index}`}
                onClick={() => entry.etf_id && handleETFClick(entry.etf_id)}
                className="grid grid-cols-12 gap-4 px-8 py-5 border-b border-white/5 hover:bg-white/5 transition-all cursor-pointer"
              >
                <div className="col-span-1 flex items-center">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm text-white">
                    {entry.rank || index + 1}
                  </div>
                </div>
                <div className="col-span-4 flex items-center">
                  <p className="text-white">{entry.twitter_handle || entry.user_id?.slice(0, 12) || 'Unknown'}</p>
                </div>
                <div className="col-span-4 flex items-center">
                  <p className="text-white hover:text-white transition-colors">{entry.etf_name || 'Unknown ETF'}</p>
                </div>
                <div className="col-span-3 flex items-center justify-end">
                  <p className={`text-lg font-mono text-white ${(entry.return_percentage || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(entry.return_percentage || 0) >= 0 ? '+' : ''}{(entry.return_percentage || 0).toFixed(2)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}