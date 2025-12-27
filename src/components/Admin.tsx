import { useState, useEffect } from 'react';
import { Lock, Loader2, RefreshCw, ExternalLink, Users, Layers, Activity, Wallet, Tag, Plus, Trash2, Copy, Check } from 'lucide-react';

interface UserLabel {
  wallet_address: string;
  label: string;
  created_at: string;
}

interface AdminStats {
  database: {
    totalEtfs: number;
    totalUsers: number;
    totalTransactions: number;
    recentEtfs: any[];
    recentTransactions: any[];
  };
  onChain: {
    devWalletBalance: number;
    devWalletBalanceMainnet: number;
  };
  devWallet: string;
  timestamp: string;
}

export function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // KOL Label management state
  const [userLabels, setUserLabels] = useState<UserLabel[]>([]);
  const [loadingLabels, setLoadingLabels] = useState(false);
  const [newWallet, setNewWallet] = useState('');
  const [newLabel, setNewLabel] = useState('KOL');
  const [labelError, setLabelError] = useState('');
  const [copiedWallet, setCopiedWallet] = useState<string | null>(null);

  // Check if already authenticated
  useEffect(() => {
    const savedToken = localStorage.getItem('adminToken');
    if (savedToken) {
      setToken(savedToken);
      setIsAuthenticated(true);
    }
  }, []);

  // Load stats and labels when authenticated
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchStats();
      fetchLabels();
    }
  }, [isAuthenticated, token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, code }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      setToken(data.token);
      localStorage.setItem('adminToken', data.token);
      setIsAuthenticated(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setToken('');
    setIsAuthenticated(false);
    setStats(null);
    setUserLabels([]);
  };

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const response = await fetch('/api/admin/stats', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          handleLogout();
          return;
        }
        throw new Error(data.error || 'Failed to fetch stats');
      }

      setStats(data.stats);
    } catch (err: any) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchLabels = async () => {
    setLoadingLabels(true);
    try {
      const response = await fetch('/api/admin/labels', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          handleLogout();
          return;
        }
        throw new Error(data.error || 'Failed to fetch labels');
      }

      setUserLabels(data.labels || []);
    } catch (err: any) {
      console.error('Failed to fetch labels:', err);
    } finally {
      setLoadingLabels(false);
    }
  };

  const addLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    setLabelError('');

    if (!newWallet.trim()) {
      setLabelError('Wallet address is required');
      return;
    }

    try {
      const response = await fetch('/api/admin/labels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          walletAddress: newWallet.trim(),
          label: newLabel,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add label');
      }

      setNewWallet('');
      fetchLabels();
    } catch (err: any) {
      setLabelError(err.message);
    }
  };

  const removeLabel = async (walletAddress: string) => {
    try {
      const response = await fetch('/api/admin/labels', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ walletAddress }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove label');
      }

      fetchLabels();
    } catch (err: any) {
      console.error('Failed to remove label:', err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedWallet(text);
    setTimeout(() => setCopiedWallet(null), 2000);
  };

  // Login form
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 mb-4">
              <Lock className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Admin Access</h1>
            <p className="text-white/60 mt-2">Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-white/60 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-emerald-500/50"
                placeholder="Enter password"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-white/60 mb-2">Access Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-emerald-500/50"
                placeholder="Enter code"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-black font-medium rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Access Dashboard'
              )}
            </button>
          </form>

          <p className="text-center text-white/40 text-xs mt-6">
            Unauthorized access is prohibited
          </p>
        </div>
      </div>
    );
  }

  // Admin dashboard
  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-white/60 mt-1">MemeETF Platform Statistics</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={fetchStats}
              disabled={loadingStats}
              className="p-2 hover:bg-white/10 rounded-lg transition-all"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${loadingStats ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg hover:bg-red-500/20 transition-all"
            >
              Logout
            </button>
          </div>
        </div>

        {loadingStats && !stats ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          </div>
        ) : stats ? (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Layers className="w-5 h-5 text-blue-400" />
                  </div>
                  <span className="text-white/60">Total ETFs</span>
                </div>
                <p className="text-3xl font-bold">{stats.database.totalEtfs}</p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <Users className="w-5 h-5 text-emerald-400" />
                  </div>
                  <span className="text-white/60">Unique Creators</span>
                </div>
                <p className="text-3xl font-bold">{stats.database.totalUsers}</p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-500/20 rounded-lg">
                    <Activity className="w-5 h-5 text-purple-400" />
                  </div>
                  <span className="text-white/60">Total Transactions</span>
                </div>
                <p className="text-3xl font-bold">{stats.database.totalTransactions}</p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-yellow-500/20 rounded-lg">
                    <Wallet className="w-5 h-5 text-yellow-400" />
                  </div>
                  <span className="text-white/60">Dev Wallet (Devnet)</span>
                </div>
                <p className="text-3xl font-bold">{stats.onChain.devWalletBalance.toFixed(4)} SOL</p>
              </div>
            </div>

            {/* Dev Wallet Info */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4">Platform Fee Wallet</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-white/60 text-sm mb-2">Wallet Address</p>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-white/5 px-3 py-2 rounded-lg flex-1 truncate">
                      {stats.devWallet}
                    </code>
                    <a
                      href={`https://solscan.io/account/${stats.devWallet}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-white/10 rounded-lg"
                    >
                      <ExternalLink className="w-4 h-4 text-white/60" />
                    </a>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-white/60 text-sm mb-2">Devnet Balance</p>
                    <p className="text-xl font-semibold text-yellow-400">
                      {stats.onChain.devWalletBalance.toFixed(4)} SOL
                    </p>
                  </div>
                  <div>
                    <p className="text-white/60 text-sm mb-2">Mainnet Balance</p>
                    <p className="text-xl font-semibold text-emerald-400">
                      {stats.onChain.devWalletBalanceMainnet.toFixed(4)} SOL
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* KOL Label Management */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Tag className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">KOL Labels</h2>
                  <p className="text-white/60 text-sm">Accounts with KOL label will have their ETFs shown in listings</p>
                </div>
              </div>

              {/* Add new label form */}
              <form onSubmit={addLabel} className="flex gap-3 mb-6">
                <input
                  type="text"
                  value={newWallet}
                  onChange={(e) => setNewWallet(e.target.value)}
                  placeholder="Wallet address"
                  className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-purple-500/50"
                />
                <select
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500/50"
                >
                  <option value="KOL">KOL</option>
                  <option value="VIP">VIP</option>
                  <option value="Partner">Partner</option>
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-all flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </form>

              {labelError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg mb-4">
                  <p className="text-sm text-red-300">{labelError}</p>
                </div>
              )}

              {/* Labels list */}
              {loadingLabels ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                </div>
              ) : userLabels.length > 0 ? (
                <div className="space-y-2">
                  {userLabels.map((label) => (
                    <div
                      key={label.wallet_address}
                      className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          label.label === 'KOL'
                            ? 'bg-purple-500/20 text-purple-300'
                            : label.label === 'VIP'
                            ? 'bg-yellow-500/20 text-yellow-300'
                            : 'bg-blue-500/20 text-blue-300'
                        }`}>
                          {label.label}
                        </span>
                        <code className="text-sm text-white/80">{label.wallet_address}</code>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/40">
                          {new Date(label.created_at).toLocaleDateString()}
                        </span>
                        <button
                          onClick={() => removeLabel(label.wallet_address)}
                          className="p-2 hover:bg-red-500/20 rounded-lg transition-all group"
                          title="Remove label"
                        >
                          <Trash2 className="w-4 h-4 text-white/40 group-hover:text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-white/40 text-center py-8">No labels added yet</p>
              )}
            </div>

            {/* Recent ETFs */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4">Recent ETFs</h2>
              {stats.database.recentEtfs.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-white/60 text-sm border-b border-white/10">
                        <th className="pb-3 pr-4">Name</th>
                        <th className="pb-3 pr-4">Creator</th>
                        <th className="pb-3 pr-4">Market Cap</th>
                        <th className="pb-3 pr-4">Network</th>
                        <th className="pb-3">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.database.recentEtfs.map((etf: any) => (
                        <tr key={etf.id} className="border-b border-white/5">
                          <td className="py-3 pr-4 font-medium">{etf.name}</td>
                          <td className="py-3 pr-4">
                            <button
                              onClick={() => copyToClipboard(etf.creator)}
                              className="flex items-center gap-1.5 text-white/60 hover:text-white transition-colors group"
                              title="Click to copy full address"
                            >
                              <span className="text-sm">{etf.creator?.slice(0, 8)}...</span>
                              {copiedWallet === etf.creator ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                            </button>
                          </td>
                          <td className="py-3 pr-4">${(etf.market_cap_at_list || 0).toLocaleString()}</td>
                          <td className="py-3 pr-4">
                            <span className={`px-2 py-1 rounded text-xs ${
                              etf.network === 'devnet'
                                ? 'bg-yellow-500/20 text-yellow-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}>
                              {etf.network}
                            </span>
                          </td>
                          <td className="py-3 text-white/60 text-sm">
                            {new Date(etf.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-white/40 text-center py-8">No ETFs created yet</p>
              )}
            </div>

            {/* Recent Transactions */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="text-xl font-semibold mb-4">Recent Transactions</h2>
              {stats.database.recentTransactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-white/60 text-sm border-b border-white/10">
                        <th className="pb-3 pr-4">Type</th>
                        <th className="pb-3 pr-4">User</th>
                        <th className="pb-3 pr-4">Amount</th>
                        <th className="pb-3 pr-4">TX Hash</th>
                        <th className="pb-3">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.database.recentTransactions.map((tx: any) => (
                        <tr key={tx.id} className="border-b border-white/5">
                          <td className="py-3 pr-4">
                            <span className={`px-2 py-1 rounded text-xs ${
                              tx.type === 'buy'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : tx.type === 'sell'
                                ? 'bg-red-500/20 text-red-300'
                                : 'bg-blue-500/20 text-blue-300'
                            }`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-white/60 text-sm">
                            {tx.user_wallet?.slice(0, 8)}...
                          </td>
                          <td className="py-3 pr-4">{tx.amount} SOL</td>
                          <td className="py-3 pr-4">
                            {tx.tx_hash ? (
                              <a
                                href={`https://solscan.io/tx/${tx.tx_hash}?cluster=devnet`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:underline text-sm"
                              >
                                {tx.tx_hash.slice(0, 8)}...
                              </a>
                            ) : (
                              <span className="text-white/40">-</span>
                            )}
                          </td>
                          <td className="py-3 text-white/60 text-sm">
                            {new Date(tx.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-white/40 text-center py-8">No transactions yet</p>
              )}
            </div>

            {/* Last Updated */}
            <p className="text-center text-white/40 text-sm mt-6">
              Last updated: {new Date(stats.timestamp).toLocaleString()}
            </p>
          </>
        ) : (
          <div className="text-center py-20 text-white/60">
            Failed to load stats. Click refresh to try again.
          </div>
        )}
      </div>
    </div>
  );
}
