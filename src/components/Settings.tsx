import { Settings as SettingsIcon, Wallet, Trash2, Twitter, LogOut, Loader2, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { apiGet, apiPost } from '../lib/api';

export function Settings() {
  const { publicKey, disconnect, connected } = useWallet();
  const [xUsername, setXUsername] = useState('');
  const [isXConnected, setIsXConnected] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [xLoading, setXLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      if (!publicKey) return;

      try {
        setLoading(true);
        
        // Fetch wallet balance from devnet
        const connection = new Connection('https://api.devnet.solana.com');
        const bal = await connection.getBalance(publicKey);
        setBalance(bal / LAMPORTS_PER_SOL);

        // Fetch user data from database
        try {
          const userData = await apiGet<{ 
            success: boolean; 
            user?: { x_username?: string } 
          }>(`/api/users/create?walletAddress=${publicKey.toBase58()}`);
          
          if (userData.success && userData.user?.x_username) {
            setXUsername(userData.user.x_username);
            setIsXConnected(true);
          }
        } catch (e) {
          console.log('User not found or database not configured');
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [publicKey]);

  // Check for OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const errorParam = params.get('error');
    
    if (errorParam) {
      setError(`X OAuth error: ${errorParam}`);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    
    if (code && state && publicKey) {
      // Handle OAuth callback
      handleXOAuthCallback(code, state);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [publicKey]);

  const handleXOAuthCallback = async (code: string, state: string) => {
    try {
      setXLoading(true);
      
      // Get stored verifier from sessionStorage
      const codeVerifier = sessionStorage.getItem('x_code_verifier');
      const storedState = sessionStorage.getItem('x_state');
      
      if (!codeVerifier) {
        throw new Error('Missing code verifier. Please try connecting again.');
      }
      
      if (state !== storedState) {
        throw new Error('State mismatch. Please try connecting again.');
      }
      
      // Exchange code for token and get user info
      const response = await apiPost<{ 
        success: boolean; 
        xUsername?: string;
        error?: string;
      }>('/api/auth/x/callback', {
        code,
        codeVerifier,
        state,
      });

      if (response.success && response.xUsername) {
        setXUsername(response.xUsername);
        setIsXConnected(true);
        setSuccess(`X account @${response.xUsername} connected successfully!`);
        
        // Clear stored OAuth data
        sessionStorage.removeItem('x_code_verifier');
        sessionStorage.removeItem('x_state');
      } else {
        throw new Error(response.error || 'Failed to connect X account');
      }
    } catch (err: any) {
      console.error('Failed to complete X OAuth:', err);
      setError(err.message || 'Failed to connect X account');
      
      // Clear stored OAuth data on error
      sessionStorage.removeItem('x_code_verifier');
      sessionStorage.removeItem('x_state');
    } finally {
      setXLoading(false);
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const handleDisconnect = () => {
    disconnect();
  };

  const handleConnectX = async () => {
    if (!publicKey) return;
    
    try {
      setXLoading(true);
      setError('');
      
      // Get OAuth URL from backend
      const response = await apiGet<{ 
        success: boolean; 
        authUrl?: string; 
        codeVerifier?: string; 
        state?: string;
        error?: string;
      }>(`/api/auth/x?walletAddress=${publicKey.toBase58()}`);

      if (response.error) {
        // If OAuth not configured, fall back to manual entry
        if (response.error.includes('not configured')) {
          const username = window.prompt('X OAuth not configured. Enter your X username manually (without @):');
          if (username && username.trim()) {
            await saveXUsername(username.trim());
          }
          return;
        }
        throw new Error(response.error);
      }

      if (response.authUrl && response.codeVerifier && response.state) {
        // Store verifier and state in sessionStorage for callback
        sessionStorage.setItem('x_code_verifier', response.codeVerifier);
        sessionStorage.setItem('x_state', response.state);
        
        // Redirect to X OAuth
        window.location.href = response.authUrl;
      }
    } catch (err: any) {
      console.error('Failed to initiate X OAuth:', err);
      setError(err.message || 'Failed to connect X account');
    } finally {
      setXLoading(false);
    }
  };

  const saveXUsername = async (username: string) => {
    if (!publicKey) return;
    
    try {
      setXLoading(true);
      setError('');
      
      // First ensure user exists
      await apiPost('/api/users/create', {
        walletAddress: publicKey.toBase58(),
        xUsername: username,
      });

      setXUsername(username);
      setIsXConnected(true);
      setSuccess('X username saved successfully!');
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Failed to save X username:', err);
      setError('Failed to save X username. Please try again.');
    } finally {
      setXLoading(false);
    }
  };

  const handleDisconnectX = async () => {
    if (!publicKey) return;
    
    try {
      setXLoading(true);
      
      // Update user to remove X username
      await apiPost('/api/users/create', {
        walletAddress: publicKey.toBase58(),
        xUsername: null,
      });

      setXUsername('');
      setIsXConnected(false);
      setSuccess('X account disconnected');
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Failed to disconnect X:', err);
      setError('Failed to disconnect X account');
    } finally {
      setXLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!publicKey) return;
    
    const confirmed = window.confirm(
      'Are you sure you want to delete your account? This action cannot be undone.'
    );
    
    if (!confirmed) return;

    try {
      setLoading(true);
      
      // Call delete API
      await apiPost('/api/users/delete', {
        walletAddress: publicKey.toBase58(),
      });

      // Disconnect wallet
      disconnect();
      
      setSuccess('Account deleted successfully');
    } catch (err) {
      console.error('Failed to delete account:', err);
      setError('Failed to delete account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 lg:px-8 py-12">
      {/* Hero Section */}
      <div className="mb-12 space-y-3">
        <div className="flex items-center gap-3">
          <h1 className="text-5xl tracking-tight">Settings</h1>
          <SettingsIcon className="w-10 h-10 text-white/60" />
        </div>
        <p className="text-white text-lg">Manage your account and preferences</p>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-500/50 bg-red-500/10 p-4">
          <p className="text-red-300">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-6 rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-4">
          <p className="text-emerald-300">{success}</p>
        </div>
      )}

      {!connected ? (
        <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-12 text-center">
          <p className="text-white/60 text-lg">Connect your wallet to access settings</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Wallet Section */}
          <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-8">
            <div className="flex items-center gap-2 mb-6">
              <Wallet className="w-6 h-6 text-white/80" />
              <h3 className="text-2xl">Wallet</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-5 rounded-xl border border-white/10">
                <div className="space-y-1">
                  <p className="text-sm text-white">Connected Wallet</p>
                  <p className="text-lg">{publicKey ? truncateAddress(publicKey.toBase58()) : 'Not connected'}</p>
                </div>
                <button 
                  onClick={handleDisconnect}
                  className="px-5 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Disconnect
                </button>
              </div>

              <div className="flex items-center justify-between p-5 rounded-xl border border-white/10">
                <div className="space-y-1">
                  <p className="text-sm text-white">Wallet Balance (Devnet)</p>
                  <p className="text-lg">
                    {loading ? 'Loading...' : balance !== null ? `${balance.toFixed(4)} SOL` : 'N/A'}
                  </p>
                </div>
                <a 
                  href="https://faucet.solana.com/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 rounded-lg border border-white/20 text-white/80 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all flex items-center gap-2"
                >
                  Get Devnet SOL
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>

          {/* Connect X Account Section */}
          <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-8">
            <div className="flex items-center gap-2 mb-6">
              <Twitter className="w-6 h-6 text-white/80" />
              <h3 className="text-2xl">Connect X Account</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-5 rounded-xl border border-white/10">
                <div className="flex-1">
                  <p className="text-lg">X (Twitter) Account</p>
                  <p className="text-sm text-white mt-1">
                    {isXConnected ? (
                      <>Connected as <span className="text-white">@{xUsername}</span></>
                    ) : (
                      'Link your X account to appear on the leaderboard'
                    )}
                  </p>
                </div>
                {xLoading ? (
                  <div className="px-5 py-2.5">
                    <Loader2 className="w-5 h-5 animate-spin text-white/60" />
                  </div>
                ) : isXConnected ? (
                  <button 
                    onClick={handleDisconnectX}
                    className="px-5 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button 
                    onClick={handleConnectX}
                    className="px-5 py-2.5 rounded-lg border border-white/20 text-white/80 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all flex items-center gap-2"
                  >
                    <Twitter className="w-4 h-4" />
                    Connect X
                  </button>
                )}
              </div>

              <p className="text-xs text-white/60 px-2">
                Connecting your X account allows you to appear on leaderboards and share your ETF performance.
              </p>
            </div>
          </div>

          {/* Delete Account Section */}
          <div className="rounded-2xl border border-red-500/30 backdrop-blur-sm p-8">
            <div className="flex items-center gap-2 mb-6">
              <Trash2 className="w-6 h-6 text-red-400" />
              <h3 className="text-2xl text-red-400">Danger Zone</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-5 rounded-xl border border-red-500/20">
                <div className="flex-1">
                  <p className="text-lg text-white">Permanently Delete Account</p>
                  <p className="text-sm text-white mt-1">
                    This action cannot be undone. All your data will be permanently deleted.
                  </p>
                </div>
                <button 
                  onClick={handleDeleteAccount}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-lg border border-red-500/50 bg-red-500/20 text-red-300 hover:bg-red-500/30 hover:border-red-500 transition-all disabled:opacity-50"
                >
                  {loading ? 'Deleting...' : 'Delete Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
