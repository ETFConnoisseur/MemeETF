import { X, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { apiGet, apiPost } from '../lib/api';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface WalletData {
  publicKey: string;
  balance: number;
}

export function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);
  const [protocolWallet, setProtocolWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && publicKey) {
      fetchBalances();
    }
  }, [isOpen, publicKey]);

  const fetchBalances = async () => {
    if (!publicKey) return;

    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), 10000)
    );

    try {
      setLoading(true);
      setError('');
      
      // Fetch user's wallet balance (from connected wallet) with timeout
      const balancePromise = connection.getBalance(publicKey);
      const balance = await Promise.race([balancePromise, timeout]) as number;
      setWalletBalance(balance / LAMPORTS_PER_SOL);

      // Create or get protocol wallet for this user with timeout
      const walletPromise = apiPost<{ success: boolean; wallet: WalletData }>(
        '/api/wallet/create',
        { userId: publicKey.toBase58() }
      );

      const walletResponse = await Promise.race([walletPromise, timeout]) as { success: boolean; wallet: WalletData };

      if (walletResponse && walletResponse.success) {
        setProtocolWallet(walletResponse.wallet);
      } else {
        // Fallback: create a temporary wallet for display
        console.warn('Using fallback wallet data');
        setProtocolWallet({
          publicKey: '',
          balance: 0,
        });
      }
    } catch (err: any) {
      console.error('Failed to fetch balances:', err);
      setError(err.message === 'Request timeout' 
        ? 'Connection timeout. Database may not be configured.' 
        : 'Failed to load wallet data. Database may not be configured.');
      // Set fallback data so modal isn't stuck
      setProtocolWallet({
        publicKey: '',
        balance: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (!publicKey || !protocolWallet || !depositAmount) return;

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (amount > walletBalance) {
      setError('Insufficient balance in wallet');
      return;
    }

    try {
      setDepositing(true);
      setError('');

      // Validate protocol wallet public key
      if (!protocolWallet.publicKey || protocolWallet.publicKey.length < 32) {
        setError('Protocol wallet not ready. Please wait or refresh.');
        return;
      }

      // CRITICAL: Check database connection BEFORE sending transaction
      try {
        const dbCheck = await apiGet<{ success?: boolean }>('/api/test-db');
        if (!dbCheck || !dbCheck.success) {
          setError('Database connection failed. Please contact support or try again later.');
          return;
        }
      } catch (dbError: any) {
        console.error('Database check failed:', dbError);
        setError('Cannot connect to database. Please contact support.');
        return;
      }

      // Create transfer transaction from user's wallet to protocol wallet
      let protocolPubkey: PublicKey;
      try {
        protocolPubkey = new PublicKey(protocolWallet.publicKey);
      } catch (e) {
        setError('Invalid protocol wallet address. Please refresh.');
        return;
      }

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: protocolPubkey,
          lamports: amount * LAMPORTS_PER_SOL,
        })
      );

      // Send transaction
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');

      // Record deposit in database
      const depositResponse = await apiPost<{ success?: boolean; error?: string; newBalance?: number }>('/api/wallet/deposit', {
        userId: publicKey.toBase58(),
        amount: amount,
        txHash: signature,
      });

      if (!depositResponse || !depositResponse.success) {
        // Transaction already sent but database failed - this is a critical error
        console.error('CRITICAL: Transaction sent but database recording failed:', depositResponse);
        setError(`Transaction completed on blockchain but failed to record in database. Transaction: ${signature}. Please contact support with this transaction hash.`);
        // Still update UI to show the transaction happened
        await fetchBalances();
        return;
      }

      // Update UI
      await fetchBalances();
      setDepositAmount('');
      setError('');
    } catch (err: any) {
      console.error('Deposit failed:', err);
      setError(err.message || 'Deposit failed');
    } finally {
      setDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!publicKey || !protocolWallet || !withdrawAmount) return;

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (amount > protocolWallet.balance) {
      setError('Insufficient protocol balance');
      return;
    }

    try {
      setWithdrawing(true);
      setError('');

      // Call API to withdraw from protocol wallet to user's wallet
      const response = await apiPost<{ success: boolean; txHash: string; newBalance: number }>(
        '/api/wallet/withdraw',
        {
          userId: publicKey.toBase58(),
          address: publicKey.toBase58(),
          amount: amount,
        }
      );

      if (response.success) {
        await fetchBalances();
        setWithdrawAmount('');
        setError('');
      }
    } catch (err: any) {
      console.error('Withdraw failed:', err);
      setError(err.message || 'Withdraw failed');
    } finally {
      setWithdrawing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pt-20 pr-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-black border border-white/20 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-2xl">Wallet Balance</h2>
              {loading ? (
                <div className="flex items-center gap-2 mt-2">
                  <Loader2 className="w-5 h-5 animate-spin text-white/60" />
                  <p className="text-white/60">Loading...</p>
                </div>
              ) : (
                <p className="text-3xl mt-2">{walletBalance.toFixed(4)} SOL</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-lg transition-all"
            >
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>

          {/* Protocol Balance */}
          <div className="pt-4 border-t border-white/10">
            <h3 className="text-lg">Protocol Balance</h3>
            {loading ? (
              <p className="text-white/60 mt-1">Loading...</p>
            ) : (
              <p className="text-2xl mt-1">{(protocolWallet?.balance || 0).toFixed(4)} SOL</p>
            )}
            {protocolWallet && protocolWallet.publicKey && (
              <p className="text-xs text-white/40 mt-1">
                {protocolWallet.publicKey.slice(0, 8)}...{protocolWallet.publicKey.slice(-8)}
              </p>
            )}
            {!protocolWallet?.publicKey && !loading && (
              <p className="text-xs text-yellow-400 mt-2">
                ⚠️ Database not configured. Using temporary wallet.
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/50 p-3">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Deposit Section */}
          <div className="pt-4 border-t border-white/10 space-y-4">
            <div>
              <label className="text-sm text-white/60">Deposit Amount (SOL)</label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
                <span className="text-white/60">SOL</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-white/40">Wallet Balance</span>
                <span className="text-xs text-white/60">{walletBalance.toFixed(4)}</span>
              </div>
            </div>
            <button 
              onClick={handleDeposit}
              disabled={depositing || loading || !depositAmount}
              className="w-full py-3 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {depositing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Depositing...
                </>
              ) : (
                'Deposit to Protocol'
              )}
            </button>
          </div>

          {/* Withdraw Section */}
          <div className="pt-4 border-t border-white/10 space-y-4">
            <div>
              <label className="text-sm text-white/60">Withdraw Amount (SOL)</label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
                <span className="text-white/60">SOL</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-white/40">Protocol Balance</span>
                <span className="text-xs text-white/60">{(protocolWallet?.balance || 0).toFixed(4)}</span>
              </div>
            </div>
            <button 
              onClick={handleWithdraw}
              disabled={withdrawing || loading || !withdrawAmount}
              className="w-full py-3 rounded-lg bg-white/5 border border-white/20 text-white hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {withdrawing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Withdrawing...
                </>
              ) : (
                'Withdraw to Wallet'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
