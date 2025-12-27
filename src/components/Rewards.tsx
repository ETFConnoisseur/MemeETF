import { useState, useEffect } from 'react';
import { useNetwork } from '../contexts/NetworkContext';
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
}

// Mock data for display
const mockTransactions: Transaction[] = [
  { wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', signature: '5UfDuX6XoLvHqKEr4PZVoKD6DtWJxbsKvNFnRwGS5Kz3xFbNvSqLqR3rTqK9PdVxvKtHMqQzZLpXbKYnZbVqDKm4', amount: 2.5, date: '2025-12-26' },
  { wallet: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', signature: '3KfDuX6XoLvHqKEr4PZVoKD6DtWJxbsKvNFnRwGS5Kz3xFbNvSqLqR3rTqK9PdVxvKtHMqQzZLpXbKYnZbVqDKm4', amount: 1.25, date: '2025-12-25' },
  { wallet: '5TnDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', signature: '4JfDuX6XoLvHqKEr4PZVoKD6DtWJxbsKvNFnRwGS5Kz3xFbNvSqLqR3rTqK9PdVxvKtHMqQzZLpXbKYnZbVqDKm4', amount: 0.75, date: '2025-12-25' },
  { wallet: '3RnDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', signature: '2HfDuX6XoLvHqKEr4PZVoKD6DtWJxbsKvNFnRwGS5Kz3xFbNvSqLqR3rTqK9PdVxvKtHMqQzZLpXbKYnZbVqDKm4', amount: 3.0, date: '2025-12-24' },
  { wallet: '8QnDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', signature: '6GfDuX6XoLvHqKEr4PZVoKD6DtWJxbsKvNFnRwGS5Kz3xFbNvSqLqR3rTqK9PdVxvKtHMqQzZLpXbKYnZbVqDKm4', amount: 0.5, date: '2025-12-24' },
  { wallet: '2PnDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', signature: '7FfDuX6XoLvHqKEr4PZVoKD6DtWJxbsKvNFnRwGS5Kz3xFbNvSqLqR3rTqK9PdVxvKtHMqQzZLpXbKYnZbVqDKm4', amount: 1.8, date: '2025-12-23' },
  { wallet: '6OnDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', signature: '8EfDuX6XoLvHqKEr4PZVoKD6DtWJxbsKvNFnRwGS5Kz3xFbNvSqLqR3rTqK9PdVxvKtHMqQzZLpXbKYnZbVqDKm4', amount: 4.2, date: '2025-12-23' },
  { wallet: '4NnDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', signature: '9DfDuX6XoLvHqKEr4PZVoKD6DtWJxbsKvNFnRwGS5Kz3xFbNvSqLqR3rTqK9PdVxvKtHMqQzZLpXbKYnZbVqDKm4', amount: 0.35, date: '2025-12-22' },
];

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
  const [transactions] = useState<Transaction[]>(mockTransactions);

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
      <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-8 transition-all duration-300 hover:border-white/20">
        <h2 className="text-2xl mb-6">Transactions</h2>

        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-white">Wallet</TableHead>
              <TableHead className="text-white">Transaction</TableHead>
              <TableHead className="text-white text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx, index) => (
              <TableRow key={index} className="border-white/10 hover:bg-white/5">
                <TableCell className="text-white font-mono">
                  {truncateWallet(tx.wallet)}
                </TableCell>
                <TableCell>
                  <a
                    href={getExplorerUrl(tx.signature, network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 hover:underline font-mono"
                  >
                    {truncateSignature(tx.signature)}
                  </a>
                </TableCell>
                <TableCell className="text-right text-emerald-400 font-medium">
                  {tx.amount.toFixed(4)} SOL
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
