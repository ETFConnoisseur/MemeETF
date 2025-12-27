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

const ITEMS_PER_PAGE = 5;

export function Rewards() {
  const { network } = useNetwork();
  const { publicKey, connected } = useWallet();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalFees, setTotalFees] = useState(0);
  const [unclaimedFees, setUnclaimedFees] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

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

  // Calculate pagination
  const totalPages = Math.ceil(transactions.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedTransactions = transactions.slice(startIndex, endIndex);

  // Calculate stats
  const totalInvestors = new Set(transactions.map(tx => tx.wallet)).size;

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

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
      {/* Stats Section */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="rounded-xl bg-black border border-white/10 p-6">
          <p className="text-sm text-white/60 mb-1">Total Investors</p>
          <p className="text-3xl text-white">{totalInvestors}</p>
        </div>
        <div className="rounded-xl bg-black border border-white/10 p-6">
          <p className="text-sm text-white/60 mb-1">Total Volume</p>
          <p className="text-3xl text-white">{totalFees.toFixed(4)} SOL</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-8 transition-all duration-300 hover:border-white/20">
        <h2 className="text-2xl mb-6">Transactions</h2>

        {loading ? (
          <p className="text-white/40 text-center py-8">Loading transactions...</p>
        ) : transactions.length === 0 ? (
          <p className="text-white/40 text-center py-8">No fee transactions yet. Create an ETF and earn 0.5% on every purchase!</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white">Wallet</TableHead>
                  <TableHead className="text-white">Transaction</TableHead>
                  <TableHead className="text-white text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTransactions.map((tx, index) => (
                  <TableRow key={index} className="border-white/10 hover:bg-white/5">
                    <TableCell className="text-white font-mono">
                      {truncateWallet(tx.wallet)}
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/10">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Previous
                </button>

                <div className="flex items-center gap-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => goToPage(page)}
                      className={`w-8 h-8 rounded-lg transition-all ${
                        currentPage === page
                          ? 'bg-white/10 text-white'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
