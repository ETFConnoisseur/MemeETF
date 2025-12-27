import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useNetwork } from '../contexts/NetworkContext';
import { apiGet } from '../lib/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

interface Transaction {
  wallet: string;
  signature: string;
  amount: number;
  date: string;
  etfName?: string;
  etfId?: string;
  paidOut?: boolean;
}

interface RewardsResponse {
  success: boolean;
  transactions: Transaction[];
  totalFees: number;
  unclaimedFees: number;
}

// Helper to truncate wallet address
const truncateWallet = (wallet: string) => {
  if (!wallet) return '-';
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
};

// Helper to truncate transaction signature
const truncateSignature = (sig: string) => {
  if (!sig) return '-';
  return `${sig.slice(0, 8)}...`;
};

// Get explorer URL based on network
const getExplorerUrl = (signature: string, network: string) => {
  const cluster = network === 'mainnet-beta' ? '' : '?cluster=devnet';
  return `https://solscan.io/tx/${signature}${cluster}`;
};

export function Rewards() {
  const { network } = useNetwork();
  const { publicKey, connected } = useWallet();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalFees, setTotalFees] = useState(0);
  const [unclaimedFees, setUnclaimedFees] = useState(0);

  useEffect(() => {
    if (connected && publicKey) {
      fetchRewards();
    } else {
      setTransactions([]);
      setTotalFees(0);
      setUnclaimedFees(0);
      setLoading(false);
    }
  }, [connected, publicKey, network]);

  async function fetchRewards() {
    if (!publicKey) return;

    try {
      setLoading(true);
      const data = await apiGet<RewardsResponse>(
        `/api/rewards?creator=${publicKey.toBase58()}&network=${network}`,
        { success: true, transactions: [], totalFees: 0, unclaimedFees: 0 }
      );

      if (data.success) {
        setTransactions(data.transactions);
        setTotalFees(data.totalFees);
        setUnclaimedFees(data.unclaimedFees);
      }
    } catch (error) {
      console.error('Failed to fetch rewards:', error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }

  if (!connected) {
    return (
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
        <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-8 text-center">
          <h2 className="text-2xl mb-4">Creator Rewards</h2>
          <p className="text-white/60">Connect your wallet to view fee rewards from your ETFs</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
      <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-8 transition-all duration-300 hover:border-white/20">
        <h2 className="text-2xl mb-2">Creator Rewards</h2>
        <p className="text-white/60 text-sm mb-6">Fees earned from users buying your ETFs (0.5% per purchase)</p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-lg border border-white/10 p-4">
            <p className="text-xs text-white/60 mb-1">Total Earned</p>
            <p className="text-xl text-emerald-400 font-medium">{totalFees.toFixed(4)} SOL</p>
          </div>
          <div className="rounded-lg border border-white/10 p-4">
            <p className="text-xs text-white/60 mb-1">Unclaimed</p>
            <p className="text-xl text-yellow-400 font-medium">{unclaimedFees.toFixed(4)} SOL</p>
          </div>
        </div>

        {loading ? (
          <p className="text-white/40 text-center py-8">Loading transactions...</p>
        ) : transactions.length === 0 ? (
          <p className="text-white/40 text-center py-8">No fee transactions yet. Create an ETF and earn 0.5% on every purchase!</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white">Buyer</TableHead>
                <TableHead className="text-white">ETF</TableHead>
                <TableHead className="text-white">Transaction</TableHead>
                <TableHead className="text-white text-right">Fee Earned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx, index) => (
                <TableRow key={index} className="border-white/10 hover:bg-white/5">
                  <TableCell className="text-white font-mono">
                    {truncateWallet(tx.wallet)}
                  </TableCell>
                  <TableCell className="text-white/80">
                    {tx.etfName || '-'}
                  </TableCell>
                  <TableCell>
                    {tx.signature ? (
                      <a
                        href={getExplorerUrl(tx.signature, network)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 hover:underline font-mono"
                      >
                        {truncateSignature(tx.signature)}
                      </a>
                    ) : (
                      <span className="text-white/40">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-emerald-400 font-medium">
                    {tx.amount.toFixed(4)} SOL
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
