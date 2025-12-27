/**
 * useEtfTransaction Hook
 *
 * NON-CUSTODIAL: Handles signing and sending ETF transactions
 * User signs transactions directly with their connected wallet (Phantom, Solflare, etc.)
 *
 * Flow:
 * 1. Call preparePurchase/prepareSell to get unsigned transactions from backend
 * 2. Call executePurchase/executeSell to sign with wallet and send to blockchain
 * 3. Tokens go directly to/from user's wallet
 */

import { useState, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import {
  Transaction,
  VersionedTransaction,
  SendTransactionError,
} from '@solana/web3.js';

// Types matching backend response
interface UnsignedSwapTransaction {
  transaction: string;
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  expectedOutputAmount: number;
  priceImpactPct: string;
  tokenSymbol: string;
  tokenWeight: number;
}

interface FeeTransaction {
  transaction: string;
  creatorFee: number;
  devFee: number;
  totalFee: number;
}

interface UnsignedEtfPurchase {
  feeTransaction: FeeTransaction;
  swapTransactions: UnsignedSwapTransaction[];
  totalSolAmount: number;
  solAfterFees: number;
  userWallet: string;
  creatorWallet: string;
  network: 'devnet' | 'mainnet-beta';
}

interface UnsignedEtfSell {
  swapTransactions: UnsignedSwapTransaction[];
  feeTransaction?: FeeTransaction;
  totalExpectedSol: number;
  userWallet: string;
  network: 'devnet' | 'mainnet-beta';
}

export interface TransactionResult {
  success: boolean;
  signatures: string[];
  error?: string;
}

export interface UseEtfTransactionReturn {
  isLoading: boolean;
  currentStep: string;
  progress: number;
  error: string | null;
  preparePurchase: (params: PreparePurchaseParams) => Promise<UnsignedEtfPurchase | null>;
  executePurchase: (purchase: UnsignedEtfPurchase) => Promise<TransactionResult>;
  prepareSell: (params: PrepareSellParams) => Promise<UnsignedEtfSell | null>;
  executeSell: (sell: UnsignedEtfSell) => Promise<TransactionResult>;
  reset: () => void;
}

interface PreparePurchaseParams {
  etfId: string;
  solAmount: number;
  creatorWallet: string;
  tokens: Array<{ address: string; symbol: string; weight: number }>;
  network?: 'devnet' | 'mainnet-beta';
}

interface PrepareSellParams {
  creatorWallet: string;
  tokens: Array<{ mint: string; amount: number; symbol: string }>;
  network?: 'devnet' | 'mainnet-beta';
}

export function useEtfTransaction(): UseEtfTransactionReturn {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setIsLoading(false);
    setCurrentStep('');
    setProgress(0);
    setError(null);
  }, []);

  const preparePurchase = useCallback(async (
    params: PreparePurchaseParams
  ): Promise<UnsignedEtfPurchase | null> => {
    if (!publicKey) {
      setError('Wallet not connected');
      return null;
    }

    setIsLoading(true);
    setCurrentStep('Preparing transactions...');
    setProgress(10);
    setError(null);

    try {
      const response = await fetch('/api/investments/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etfId: params.etfId,
          solAmount: params.solAmount,
          userWallet: publicKey.toBase58(),
          creatorWallet: params.creatorWallet,
          tokens: params.tokens,
          network: params.network || 'devnet',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to prepare transactions');
      }

      setProgress(30);
      setCurrentStep('Ready for signing');
      return data as UnsignedEtfPurchase;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey]);

  const executePurchase = useCallback(async (
    purchase: UnsignedEtfPurchase
  ): Promise<TransactionResult> => {
    if (!publicKey || !signTransaction || !signAllTransactions) {
      return { success: false, signatures: [], error: 'Wallet not connected or does not support signing' };
    }

    setIsLoading(true);
    setError(null);
    const signatures: string[] = [];

    try {
      // Step 1: Sign and send fee transaction
      setCurrentStep('Sign fee transaction in your wallet...');
      setProgress(35);

      const feeTx = Transaction.from(Buffer.from(purchase.feeTransaction.transaction, 'base64'));
      feeTx.feePayer = publicKey;

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      feeTx.recentBlockhash = blockhash;
      feeTx.lastValidBlockHeight = lastValidBlockHeight;

      const signedFeeTx = await signTransaction(feeTx);
      const feeSignature = await connection.sendRawTransaction(signedFeeTx.serialize());
      await connection.confirmTransaction({
        signature: feeSignature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      signatures.push(feeSignature);
      setProgress(45);

      // Step 2: Sign and send swap transactions
      const totalSwaps = purchase.swapTransactions.length;

      for (let i = 0; i < totalSwaps; i++) {
        const swap = purchase.swapTransactions[i];
        setCurrentStep(`Sign swap ${i + 1}/${totalSwaps}: ${swap.tokenSymbol}...`);
        setProgress(45 + ((i / totalSwaps) * 50));

        try {
          const swapTx = VersionedTransaction.deserialize(
            Buffer.from(swap.transaction, 'base64')
          );

          // Sign the versioned transaction
          const signedSwapTx = await signTransaction(swapTx as any);
          const swapSignature = await connection.sendRawTransaction(
            (signedSwapTx as VersionedTransaction).serialize()
          );

          const { blockhash: swapBlockhash, lastValidBlockHeight: swapHeight } =
            await connection.getLatestBlockhash('confirmed');
          await connection.confirmTransaction({
            signature: swapSignature,
            blockhash: swapBlockhash,
            lastValidBlockHeight: swapHeight,
          }, 'confirmed');

          signatures.push(swapSignature);
        } catch (swapError: any) {
          console.error(`Swap ${i + 1} failed:`, swapError);
          // Continue with other swaps
        }
      }

      setProgress(100);
      setCurrentStep('Purchase complete!');

      return {
        success: true,
        signatures,
      };
    } catch (err: any) {
      console.error('Purchase execution failed:', err);
      const errorMessage = err instanceof SendTransactionError
        ? `Transaction failed: ${err.message}`
        : err.message || 'Transaction failed';

      setError(errorMessage);
      return {
        success: false,
        signatures,
        error: errorMessage,
      };
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, signAllTransactions, connection]);

  const prepareSell = useCallback(async (
    params: PrepareSellParams
  ): Promise<UnsignedEtfSell | null> => {
    if (!publicKey) {
      setError('Wallet not connected');
      return null;
    }

    setIsLoading(true);
    setCurrentStep('Preparing sell transactions...');
    setProgress(10);
    setError(null);

    try {
      const response = await fetch('/api/investments/prepare-sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWallet: publicKey.toBase58(),
          creatorWallet: params.creatorWallet,
          tokens: params.tokens,
          network: params.network || 'devnet',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to prepare sell transactions');
      }

      setProgress(30);
      setCurrentStep('Ready for signing');
      return data as UnsignedEtfSell;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey]);

  const executeSell = useCallback(async (
    sell: UnsignedEtfSell
  ): Promise<TransactionResult> => {
    if (!publicKey || !signTransaction) {
      return { success: false, signatures: [], error: 'Wallet not connected' };
    }

    setIsLoading(true);
    setError(null);
    const signatures: string[] = [];

    try {
      const totalSwaps = sell.swapTransactions.length;

      for (let i = 0; i < totalSwaps; i++) {
        const swap = sell.swapTransactions[i];
        setCurrentStep(`Selling ${swap.tokenSymbol} (${i + 1}/${totalSwaps})...`);
        setProgress(10 + ((i / totalSwaps) * 70));

        try {
          const swapTx = VersionedTransaction.deserialize(
            Buffer.from(swap.transaction, 'base64')
          );

          const signedSwapTx = await signTransaction(swapTx as any);
          const swapSignature = await connection.sendRawTransaction(
            (signedSwapTx as VersionedTransaction).serialize()
          );

          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
          await connection.confirmTransaction({
            signature: swapSignature,
            blockhash,
            lastValidBlockHeight,
          }, 'confirmed');

          signatures.push(swapSignature);
        } catch (swapError: any) {
          console.error(`Sell swap ${i + 1} failed:`, swapError);
        }
      }

      // Sign and send fee transaction if present
      if (sell.feeTransaction) {
        setCurrentStep('Paying fees...');
        setProgress(85);

        const feeTx = Transaction.from(Buffer.from(sell.feeTransaction.transaction, 'base64'));
        feeTx.feePayer = publicKey;

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        feeTx.recentBlockhash = blockhash;
        feeTx.lastValidBlockHeight = lastValidBlockHeight;

        const signedFeeTx = await signTransaction(feeTx);
        const feeSignature = await connection.sendRawTransaction(signedFeeTx.serialize());
        await connection.confirmTransaction({
          signature: feeSignature,
          blockhash,
          lastValidBlockHeight,
        }, 'confirmed');

        signatures.push(feeSignature);
      }

      setProgress(100);
      setCurrentStep('Sell complete!');

      return {
        success: true,
        signatures,
      };
    } catch (err: any) {
      console.error('Sell execution failed:', err);
      setError(err.message);
      return {
        success: false,
        signatures,
        error: err.message,
      };
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, connection]);

  return {
    isLoading,
    currentStep,
    progress,
    error,
    preparePurchase,
    executePurchase,
    prepareSell,
    executeSell,
    reset,
  };
}
