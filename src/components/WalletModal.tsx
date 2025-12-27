import { X, Loader2, ExternalLink, Copy, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useNetwork } from '../contexts/NetworkContext';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const { publicKey, disconnect } = useWallet();
  const { connection } = useConnection();
  const { network } = useNetwork();

  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && publicKey) {
      fetchBalance();
    }
  }, [isOpen, publicKey]);

  const fetchBalance = async () => {
    if (!publicKey) return;

    try {
      setLoading(true);
      const balance = await connection.getBalance(publicKey);
      setWalletBalance(balance / LAMPORTS_PER_SOL);
    } catch (err: any) {
      console.error('Failed to fetch balance:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    onClose();
  };

  const explorerUrl = publicKey
    ? `https://solscan.io/account/${publicKey.toBase58()}${network === 'devnet' ? '?cluster=devnet' : ''}`
    : '';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pt-20 pr-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative border border-white/20 rounded-2xl w-full max-w-md shadow-2xl bg-black/90">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-2xl text-white">Wallet</h2>
              {loading ? (
                <div className="flex items-center gap-2 mt-2">
                  <Loader2 className="w-5 h-5 animate-spin text-white/60" />
                  <p className="text-white/60">Loading...</p>
                </div>
              ) : (
                <p className="text-3xl mt-2 text-white">{walletBalance.toFixed(4)} SOL</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-lg transition-all"
            >
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>

          {/* Address */}
          {publicKey && (
            <div className="pt-4 border-t border-white/10">
              <p className="text-sm text-white/60 mb-2">Connected Address</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm text-white bg-white/5 px-3 py-2 rounded-lg truncate">
                  {publicKey.toBase58()}
                </code>
                <button
                  onClick={copyAddress}
                  className="p-2 hover:bg-white/10 rounded-lg transition-all"
                  title="Copy address"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-white/60" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Network Badge */}
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs ${
              network === 'devnet'
                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            }`}>
              {network === 'devnet' ? 'Devnet' : 'Mainnet'}
            </span>
          </div>

          {/* Info Box */}
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-4">
            <p className="text-sm text-blue-200">
              This is a <strong>non-custodial</strong> platform. Your tokens stay in your wallet.
              You sign transactions directly with Phantom/Solflare.
            </p>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-white/10 space-y-3">
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 rounded-lg bg-white/5 border border-white/20 text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              View on Solscan
            </a>

            <button
              onClick={handleDisconnect}
              className="w-full py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 transition-all"
            >
              Disconnect Wallet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
